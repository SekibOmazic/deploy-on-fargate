import * as cdk from '@aws-cdk/core'

import * as acm from '@aws-cdk/aws-certificatemanager'
import * as cw from '@aws-cdk/aws-cloudwatch'
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs'
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import * as route53 from '@aws-cdk/aws-route53'
import * as ssm from '@aws-cdk/aws-ssm'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as alias from '@aws-cdk/aws-route53-targets'
import * as iam from '@aws-cdk/aws-iam'

export interface ServiceStackProps extends cdk.StackProps {
  readonly apiName: string
  readonly hostedZoneName: string
  readonly ecrRepoName: string
  readonly clusterName?: string
}

export class ServiceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const domainName = `${props.apiName}.${props.hostedZoneName}`

    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.hostedZoneName,
    })

    // Lookup pre-existing TLS certificate
    const certificateArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CertArnParameter',
      {
        parameterName: 'CertificateArn-' + domainName,
      }
    ).stringValue

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Cert',
      certificateArn
    )

    // ECR repository for the docker images
    const ecrRepo = ecr.Repository.fromRepositoryName(
      this,
      'Repo',
      props.ecrRepoName
    )
    const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest'
    const image = ecs.ContainerImage.fromEcrRepository(ecrRepo, tag)

    // VPC
    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 })

    // ALB, listener and two target groups for Blue/Green deployment
    const tg1 = new elb.ApplicationTargetGroup(this, 'ServiceTargetGroupBlue', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      vpc,
      deregistrationDelay: cdk.Duration.seconds(5),
      healthCheck: {
        interval: cdk.Duration.seconds(5),
        path: '/',
        protocol: elb.Protocol.HTTP,
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4),
      },
    })

    const tg2 = new elb.ApplicationTargetGroup(
      this,
      'ServiceTargetGroupGreen',
      {
        port: 80,
        protocol: elb.ApplicationProtocol.HTTP,
        targetType: elb.TargetType.IP,
        vpc,
        deregistrationDelay: cdk.Duration.seconds(5),
        healthCheck: {
          interval: cdk.Duration.seconds(5),
          path: '/',
          protocol: elb.Protocol.HTTP,
          healthyHttpCodes: '200',
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          timeout: cdk.Duration.seconds(4),
        },
      }
    )

    const alb = new elb.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
    })
    const albProdListener = alb.addListener('albProdListener', {
      port: 443,
      protocol: elb.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elb.ListenerAction.weightedForward([
        {
          targetGroup: tg1,
          weight: 100,
        },
      ]),
    })
    const albTestListener = alb.addListener('albTestListener', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elb.ListenerAction.weightedForward([
        {
          targetGroup: tg1,
          weight: 100,
        },
      ]),
    })

    // Route53 record
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new alias.LoadBalancerTarget(alb)),
      comment: 'A record for simple-api service.',
    })

    // ECS
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.clusterName || 'Cluster',
      containerInsights: true,
      vpc,
    })
    const serviceSG = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
    })
    serviceSG.connections.allowFrom(alb, ec2.Port.tcp(80))

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {}
    )
    const container = taskDefinition.addContainer('web', {
      image,
      logging: new ecs.AwsLogDriver({ streamPrefix: props.apiName }),
    })
    container.addPortMappings({ containerPort: 80 })

    const service = new ecs.CfnService(this, 'Service', {
      serviceName: props.apiName,
      cluster: cluster.clusterName,
      desiredCount: 3,
      deploymentController: { type: ecs.DeploymentControllerType.EXTERNAL },
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    })
    service.node.addDependency(tg1)
    service.node.addDependency(tg2)
    service.node.addDependency(albProdListener)
    service.node.addDependency(albTestListener)

    const taskSet = new ecs.CfnTaskSet(this, 'TaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      scale: { unit: 'PERCENT', value: 100 },
      taskDefinition: taskDefinition.taskDefinitionArn,
      launchType: ecs.LaunchType.FARGATE,
      loadBalancers: [
        {
          containerName: 'web',
          containerPort: 80,
          targetGroupArn: tg1.targetGroupArn,
        },
      ],
      networkConfiguration: {
        awsVpcConfiguration: {
          assignPublicIp: 'DISABLED',
          securityGroups: [serviceSG.securityGroupId],
          subnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE })
            .subnetIds,
        },
      },
    })

    // The IAM Role for CloudFormation to use to perform blue-green deployments.
    const servceRoleBlueGreen = new iam.Role(
      this,
      'blue-green-deployment-role',
      {
        assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      }
    )

    const serviceRoleblueGreenPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
        'codedeploy:Get*',
        'codedeploy:CreateCloudFormationDeployment',
        // TODO: only 'lambda:InvokeFunction' on resource Resource: !Sub 'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:CodeDeployHook_*'
      ],
      resources: ['*'],
    })

    servceRoleBlueGreen.addToPolicy(serviceRoleblueGreenPolicy)

    //
    this.addTransform('AWS::CodeDeployBlueGreen')
    const taskDefLogicalId = this.getLogicalId(
      taskDefinition.node.defaultChild as ecs.CfnTaskDefinition
    )
    const taskSetLogicalId = this.getLogicalId(taskSet)
    new cdk.CfnCodeDeployBlueGreenHook(this, 'CodeDeployBlueGreenHook', {
      trafficRoutingConfig: {
        type: cdk.CfnTrafficRoutingType.TIME_BASED_CANARY,
        timeBasedCanary: {
          // Shift 10% of prod traffic, then wait 5 minutes
          stepPercentage: 10,
          bakeTimeMins: 5,
        },
      },
      additionalOptions: {
        // After canary period, shift 100% of prod traffic, then wait 30 minutes
        terminationWaitTimeInMinutes: 5,
      },
      lifecycleEventHooks: {
        // invoke lifecycle event hook function after test traffic is live, but before prod traffic is live
        afterAllowTestTraffic:
          'CodeDeployHook_-' + props.apiName + '-pre-traffic',
      },
      // TODO: just use serviceRole: 'AWSCodeDeployRoleForECS'?
      serviceRole: servceRoleBlueGreen.roleName, // 'CodeDeployHookRole_' + props.deploymentHooksStack,
      applications: [
        {
          target: {
            type: service.cfnResourceType,
            logicalId: this.getLogicalId(service),
          },
          ecsAttributes: {
            taskDefinitions: [taskDefLogicalId, taskDefLogicalId + 'Green'],
            taskSets: [taskSetLogicalId, taskSetLogicalId + 'Green'],
            trafficRouting: {
              prodTrafficRoute: {
                type: elb.CfnListener.CFN_RESOURCE_TYPE_NAME,
                logicalId: this.getLogicalId(
                  albProdListener.node.defaultChild as elb.CfnListener
                ),
              },
              testTrafficRoute: {
                type: elb.CfnListener.CFN_RESOURCE_TYPE_NAME,
                logicalId: this.getLogicalId(
                  albTestListener.node.defaultChild as elb.CfnListener
                ),
              },
              targetGroups: [
                this.getLogicalId(tg1.node.defaultChild as elb.CfnTargetGroup),
                this.getLogicalId(tg2.node.defaultChild as elb.CfnTargetGroup),
              ],
            },
          },
        },
      ],
    })

    new ecs.CfnPrimaryTaskSet(this, 'PrimaryTaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      taskSetId: taskSet.attrId,
    })

    // new cdk.CfnOutput(this, 'ServiceName', {
    //   value: this.fargateService.service.serviceName,
    // })
  }
}
