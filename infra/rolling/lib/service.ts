import * as cdk from '@aws-cdk/core'

import { Certificate } from '@aws-cdk/aws-certificatemanager'
import { Alarm } from '@aws-cdk/aws-cloudwatch'
import { Repository } from '@aws-cdk/aws-ecr'
import { Cluster, ContainerImage, PropagatedTagSource } from '@aws-cdk/aws-ecs'
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns'
import { HttpCodeTarget } from '@aws-cdk/aws-elasticloadbalancingv2'
import { HostedZone } from '@aws-cdk/aws-route53'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { IBaseService } from '@aws-cdk/aws-ecs'

export interface ServiceProps {
  readonly domainName: string
  readonly domainZone: string
  readonly ecrRepoName: string
}

export class Service extends cdk.Construct {
  private fargateService: ApplicationLoadBalancedFargateService

  public readonly containerName: string
  public readonly ecrRepo: Repository
  public readonly service: IBaseService

  constructor(scope: cdk.Construct, id: string, props: ServiceProps) {
    super(scope, id)

    const domainZone = HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainZone,
    })

    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(
      this,
      'CertArnParameter',
      {
        parameterName: 'CertificateArn-' + props.domainName,
      }
    ).stringValue

    const certificate = Certificate.fromCertificateArn(
      this,
      'Cert',
      certificateArn
    )

    // ECR
    const ecrRepo = Repository.fromRepositoryName(
      this,
      'EcrRepo',
      props.ecrRepoName
    )
    const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest'
    const image = ContainerImage.fromEcrRepository(ecrRepo, tag)

    // ECS
    const cluster = new Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      containerInsights: true,
    })

    this.fargateService = new ApplicationLoadBalancedFargateService(
      this,
      'Service',
      {
        cluster,
        taskImageOptions: { image },
        desiredCount: 3,
        domainName: props.domainName,
        domainZone,
        certificate,
        propagateTags: PropagatedTagSource.SERVICE,
      }
    )
    // needed in Pipeline construct
    this.service = this.fargateService.service

    // Alarms: monitor 500s and unhealthy hosts on target groups
    new Alarm(this, 'TargetGroupUnhealthyHosts', {
      alarmName: props.ecrRepoName + '-Unhealthy-Hosts',
      metric: this.fargateService.targetGroup.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    })

    new Alarm(this, 'TargetGroup5xx', {
      alarmName: props.ecrRepoName + '-Http-500',
      metric: this.fargateService.targetGroup.metricHttpCodeTarget(
        HttpCodeTarget.TARGET_5XX_COUNT
      ),
      threshold: 1,
      evaluationPeriods: 1,
      period: cdk.Duration.minutes(1),
    })

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.fargateService.service.serviceName,
    })
    new cdk.CfnOutput(this, 'ContainerName', {
      value: this.fargateService.taskDefinition.defaultContainer!.containerName,
    })
  }
}
