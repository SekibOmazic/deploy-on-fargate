import * as cdk from '@aws-cdk/core'

import * as acm from '@aws-cdk/aws-certificatemanager'
import * as cw from '@aws-cdk/aws-cloudwatch'
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs'
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns'
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import * as route53 from '@aws-cdk/aws-route53'
import * as ssm from '@aws-cdk/aws-ssm'

export interface ServiceStackProps extends cdk.StackProps {
  readonly domainName: string
  readonly domainZone: string
  readonly ecrRepoName: string
}

export class ServiceStack extends cdk.Stack {
  private fargateService: ecs_patterns.ApplicationLoadBalancedFargateService

  constructor(scope: cdk.Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const domainZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainZone,
    })

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

    // ECR repository for the docker images
    const ecrRepo = ecr.Repository.fromRepositoryName(
      this,
      'Repo',
      props.ecrRepoName
    )
    const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest'
    const image = ecs.ContainerImage.fromEcrRepository(ecrRepo, tag)

    // ECS
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      containerInsights: true,
    })

    this.fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'Service',
      {
        cluster,
        taskImageOptions: { image },
        desiredCount: 3,
        domainName: props.domainName,
        domainZone,
        certificate,
        propagateTags: ecs.PropagatedTagSource.SERVICE,
      }
    )

    // Alarms: monitor 500s and unhealthy hosts on target groups
    new cw.Alarm(this, 'TargetGroupUnhealthyHosts', {
      alarmName: props.ecrRepoName + '-Unhealthy-Hosts',
      metric: this.fargateService.targetGroup.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    })

    new cw.Alarm(this, 'TargetGroup5xx', {
      alarmName: props.ecrRepoName + '-Http-500',
      metric: this.fargateService.targetGroup.metricHttpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT
      ),
      threshold: 1,
      evaluationPeriods: 1,
      period: cdk.Duration.minutes(1),
    })

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.fargateService.service.serviceName,
    })
  }
}
