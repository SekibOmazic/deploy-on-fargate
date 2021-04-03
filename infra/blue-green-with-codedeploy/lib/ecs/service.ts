import * as cdk from '@aws-cdk/core'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as iam from '@aws-cdk/aws-iam'
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs'
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import * as log from '@aws-cdk/aws-logs'
import * as acm from '@aws-cdk/aws-certificatemanager'
import * as route53 from '@aws-cdk/aws-route53'
import * as ssm from '@aws-cdk/aws-ssm'
import * as alias from '@aws-cdk/aws-route53-targets'
export interface EcsBlueGreenServiceProps {
  readonly apiName?: string
  readonly vpc?: ec2.IVpc
  readonly cluster?: ecs.ICluster
  readonly containerPort?: number
  readonly ecrRepository?: ecr.IRepository
  readonly ecsTaskRole?: iam.IRole
  readonly zone: route53.IHostedZone
  readonly domainName: string
}

export class EcsBlueGreenService extends cdk.Construct {
  private static readonly PREFIX: string = 'app'

  public readonly ecsService: ecs.FargateService
  public readonly blueTargetGroup: elb.ApplicationTargetGroup
  public readonly greenTargetGroup: elb.ApplicationTargetGroup
  public readonly albProdListener: elb.ApplicationListener
  public readonly albTestListener: elb.ApplicationListener
  public readonly alb: elb.ApplicationLoadBalancer

  constructor(
    scope: cdk.Construct,
    id: string,
    props: EcsBlueGreenServiceProps
  ) {
    super(scope, id)

    // Lookup pre-existing TLS certificate
    const certificateArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CertArnParameter',
      {
        parameterName: 'CertificateArn-' + props.domainName,
      }
    ).stringValue

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Cert',
      certificateArn
    )

    // Creating the task definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'apiTaskDefinition',
      {
        family: props.apiName,
        cpu: 256,
        memoryLimitMiB: 1024,
        taskRole: props.ecsTaskRole,
        executionRole: props.ecsTaskRole,
      }
    )
    taskDefinition
      .addContainer('apiContainer', {
        image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository!),
        logging: new ecs.AwsLogDriver({
          logGroup: new log.LogGroup(this, 'apiLogGroup', {
            logGroupName: '/ecs/'.concat(props.apiName!),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          streamPrefix: EcsBlueGreenService.PREFIX,
        }),
      })
      .addPortMappings({
        containerPort: props.containerPort!,
        protocol: ecs.Protocol.TCP,
      })

    // Creating an application load balancer, listener and two target groups for Blue/Green deployment
    this.alb = new elb.ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc!,
      internetFacing: true,
    })
    this.albProdListener = this.alb.addListener('albProdListener', {
      port: 443,
      protocol: elb.ApplicationProtocol.HTTPS,
      certificates: [certificate],
    })
    this.albTestListener = this.alb.addListener('albTestListener', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTPS,
      certificates: [certificate],
    })

    this.albProdListener.connections.allowDefaultPortFromAnyIpv4(
      'Allow traffic from everywhere'
    )
    this.albTestListener.connections.allowDefaultPortFromAnyIpv4(
      'Allow traffic from everywhere'
    )

    // Route53 record
    new route53.ARecord(this, 'AliasRecord', {
      zone: props.zone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new alias.LoadBalancerTarget(this.alb)
      ),
      comment: 'A record for simple-api service.',
    })

    // Target group 1
    this.blueTargetGroup = new elb.ApplicationTargetGroup(this, 'blueGroup', {
      vpc: props.vpc!,
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: '/',
        timeout: cdk.Duration.seconds(30),
        interval: cdk.Duration.seconds(60),
        healthyHttpCodes: '200',
      },
    })

    // Target group 2
    this.greenTargetGroup = new elb.ApplicationTargetGroup(this, 'greenGroup', {
      vpc: props.vpc!,
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: '/',
        timeout: cdk.Duration.seconds(30),
        interval: cdk.Duration.seconds(60),
        healthyHttpCodes: '200',
      },
    })

    // Registering the blue target group with the production listener of load balancer
    this.albProdListener.addTargetGroups('blueTarget', {
      targetGroups: [this.blueTargetGroup],
    })

    // Registering the green target group with the test listener of load balancer
    this.albTestListener.addTargetGroups('greenTarget', {
      targetGroups: [this.greenTargetGroup],
    })

    this.ecsService = new ecs.FargateService(this, 'ecsService', {
      cluster: props.cluster!,
      taskDefinition: taskDefinition,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      desiredCount: 3,
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      serviceName: props.apiName!,
    })

    this.ecsService.connections.allowFrom(this.alb, ec2.Port.tcp(80))
    this.ecsService.connections.allowFrom(this.alb, ec2.Port.tcp(9000))
    this.ecsService.attachToApplicationTargetGroup(this.blueTargetGroup)
  }
}
