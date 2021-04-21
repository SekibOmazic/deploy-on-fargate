import { countResources, expect as expectCDK } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import * as route53 from '@aws-cdk/aws-route53'
import * as EcsBlueGreen from '../lib/index'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs'

test('Blue/Green deployment pipeline is created', () => {
  const app = new cdk.App()
  const stack = new cdk.Stack(app, 'EcsBlueGreenStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  })

  // WHEN
  const ecsBlueGreenRoles = new EcsBlueGreen.EcsBlueGreenRoles(
    stack,
    'EcsBlueGreenRoles'
  )
  const ecsBlueGreenBuildImage = new EcsBlueGreen.EcsBlueGreenBuildImage(
    stack,
    'EcsBlueGreenBuildImage',
    {
      apiName: 'simple-api',
      codeBuildRole: ecsBlueGreenRoles.codeBuildRole,
      ecsTaskRole: ecsBlueGreenRoles.ecsTaskRole,
      codeRepoName: 'deploy-on-fargate',
      codeRepoOwner: 'me',
      dockerHubUsername: 'username',
      dockerHubPassword: 'password',
    }
  )

  const vpc = new ec2.Vpc(stack, 'VPC', {
    cidr: '10.0.0.0/16',
  })
  const cluster = new ecs.Cluster(stack, 'Cluster', {
    vpc: vpc,
    containerInsights: true,
    clusterName: 'Cluster',
  })

  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', {
    zoneName: 'example.com',
    hostedZoneId: '123456789',
  })

  new EcsBlueGreen.EcsBlueGreenPipeline(stack, 'EcsBlueGreenPipeline', {
    apiName: 'simple-api',
    domainName: 'simple-api.example.com',
    deploymentConfigName: 'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
    cluster,
    vpc,
    zone,
    containerPort: 9000,
    ecrRepoName: ecsBlueGreenBuildImage.ecrRepo.repositoryName,
    codeBuildProjectName: ecsBlueGreenBuildImage.codeBuildProject.projectName,
    ecsTaskRoleArn: ecsBlueGreenRoles.ecsTaskRole.roleArn,
    taskSetTerminationTimeInMinutes: 10,
  })

  // THEN
  expectCDK(stack).to(countResources('AWS::IAM::Role', 7))
  expectCDK(stack).to(countResources('AWS::ECR::Repository', 1))
  expectCDK(stack).to(countResources('AWS::CodeBuild::Project', 1))
  expectCDK(stack).to(countResources('AWS::EC2::VPC', 1))
  expectCDK(stack).to(countResources('AWS::ECS::Cluster', 1))
  expectCDK(stack).to(countResources('AWS::ECS::TaskDefinition', 1))
  expectCDK(stack).to(countResources('AWS::ECS::Service', 1))
  expectCDK(stack).to(
    countResources('AWS::ElasticLoadBalancingV2::LoadBalancer', 1)
  )
  expectCDK(stack).to(
    countResources('AWS::ElasticLoadBalancingV2::Listener', 2)
  )
  expectCDK(stack).to(
    countResources('AWS::ElasticLoadBalancingV2::TargetGroup', 2)
  )
  expectCDK(stack).to(countResources('AWS::CloudWatch::Alarm', 4))
})
