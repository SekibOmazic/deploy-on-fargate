#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import * as blueGreen from '../lib'
import * as route53 from '@aws-cdk/aws-route53'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs'

export class BlueGreenPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const deploymentConfigName = new cdk.CfnParameter(
      this,
      'deploymentConfigName',
      {
        type: 'String',
        default: 'CodeDeployDefault.ECSCanary10Percent5Minutes',
        allowedValues: [
          'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
          'CodeDeployDefault.ECSLinear10PercentEvery3Minutes',
          'CodeDeployDefault.ECSCanary10Percent5Minutes',
          'CodeDeployDefault.ECSCanary10Percent15Minutes',
          'CodeDeployDefault.ECSAllAtOnce',
        ],
        description:
          'Shifts 10 percent of traffic and after 5 minutes the remaining 90 percent',
      }
    )

    const taskSetTerminationTimeInMinutes = new cdk.CfnParameter(
      this,
      'taskSetTerminationTimeInMinutes',
      {
        type: 'Number',
        default: '5',
        description: 'TaskSet termination time in minutes',
      }
    )

    const vpc = new ec2.Vpc(this, 'VPC', {
      cidr: '10.0.0.0/16',
    })
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc,
      containerInsights: true,
      clusterName: 'Cluster',
    })

    /**
     * IMPORTANT: this actually belongs to service.ts but for some
     * reason HostedZone.fromLookup(...) doesn't work in a Construct
     * even if I pass
     *   env: {
     *     account: process.env.CDK_DEFAULT_ACCOUNT,
     *     region: process.env.CDK_DEFAULT_REGION,
     *   }
     * in the Stack (see below)
     */
    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: process.env.HOSTED_ZONE_NAME || '',
    })

    new blueGreen.EcsBlueGreenPipeline(this, 'EcsBlueGreenPipeline', {
      domainName: process.env.DOMAIN_NAME || '',
      githubRepoName: process.env.GITHUB_REPO_NAME,
      githubRepoOwner: process.env.GITHUB_REPO_OWNER,
      apiName: process.env.API_NAME,
      deploymentConfigName: deploymentConfigName.valueAsString,
      zone: hostedZone,
      cluster: cluster,
      vpc: vpc,
      containerPort: Number(process.env.CONTAINER_PORT),
      ecrRepoName: process.env.ECR_REPO_NAME,
      codeBuildProjectName: process.env.CODE_BUILD_PROJECT_NAME,
      ecsTaskRoleArn: process.env.ECS_TASK_ROLE_ARN,
      taskSetTerminationTimeInMinutes:
        taskSetTerminationTimeInMinutes.valueAsNumber,
    })
  }
}

const app = new cdk.App()
new BlueGreenPipelineStack(app, 'BlueGreenPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
