import * as cdk from '@aws-cdk/core'
import * as ecs from '@aws-cdk/aws-ecs'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'
import * as ecr from '@aws-cdk/aws-ecr'
import * as codeBuild from '@aws-cdk/aws-codebuild'
import * as codePipeline from '@aws-cdk/aws-codepipeline'
import * as codePipelineActions from '@aws-cdk/aws-codepipeline-actions'
import * as route53 from '@aws-cdk/aws-route53'

import {
  EcsBlueGreenDeploymentGroup,
  EcsBlueGreenService,
  EcsServiceAlarms,
} from '..'

export interface EcsBlueGreenPipelineProps {
  readonly domainName: string
  readonly zone: route53.IHostedZone
  readonly vpc?: ec2.IVpc
  readonly cluster?: ecs.ICluster
  readonly githubRepoOwner?: string
  readonly githubRepoName?: string
  readonly ecrRepoName?: string
  readonly codeBuildProjectName?: string
  readonly ecsTaskRoleArn?: string
  readonly containerPort?: number
  readonly apiName?: string
  readonly taskSetTerminationTimeInMinutes?: number
  readonly deploymentConfigName?: string
}

export class EcsBlueGreenPipeline extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: EcsBlueGreenPipelineProps
  ) {
    super(scope, id)

    // Github Token
    const githubAccessToken = cdk.SecretValue.secretsManager(
      '/github.com/sekibomazic',
      {
        jsonField: 'token',
      }
    )

    const ecrRepo = ecr.Repository.fromRepositoryName(
      this,
      'ecrRepo',
      props.ecrRepoName!
    )
    const codeBuildProject = codeBuild.Project.fromProjectName(
      this,
      'codeBuild',
      props.codeBuildProjectName!
    )
    const ecsTaskRole = iam.Role.fromRoleArn(
      this,
      'ecsTaskRole',
      props.ecsTaskRoleArn!
    )

    const codePipelineRole = new iam.Role(this, 'codePipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    })

    const codePipelinePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:PassRole',
        'sts:AssumeRole',
        'codecommit:Get*',
        'codecommit:List*',
        'codecommit:GitPull',
        'codecommit:UploadArchive',
        'codecommit:CancelUploadArchive',
        'codebuild:BatchGetBuilds',
        'codebuild:StartBuild',
        'codedeploy:CreateDeployment',
        'codedeploy:Get*',
        'codedeploy:RegisterApplicationRevision',
        's3:Get*',
        's3:List*',
        's3:PutObject',
      ],
      resources: ['*'],
    })

    codePipelineRole.addToPolicy(codePipelinePolicy)

    const sourceArtifact = new codePipeline.Artifact('sourceArtifact')
    const buildArtifact = new codePipeline.Artifact('buildArtifact')

    // S3 bucket for storing the code pipeline artifacts
    const artifactsBucket = new s3.Bucket(this, 'artifactsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    })

    const denyUnEncryptedObjectUploads = new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['s3:PutObject'],
      principals: [new iam.AnyPrincipal()],
      resources: [artifactsBucket.bucketArn.concat('/*')],
      conditions: {
        StringNotEquals: {
          's3:x-amz-server-side-encryption': 'aws:kms',
        },
      },
    })

    const denyInsecureConnections = new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['s3:*'],
      principals: [new iam.AnyPrincipal()],
      resources: [artifactsBucket.bucketArn.concat('/*')],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false',
        },
      },
    })

    artifactsBucket.addToResourcePolicy(denyUnEncryptedObjectUploads)
    artifactsBucket.addToResourcePolicy(denyInsecureConnections)

    const ecsBlueGreenService = new EcsBlueGreenService(this, 'service', {
      containerPort: props.containerPort,
      apiName: props.apiName,
      ecrRepository: ecrRepo,
      ecsTaskRole: ecsTaskRole,
      vpc: props.vpc,
      cluster: props.cluster,
      domainName: props.domainName,
      zone: props.zone,
    })

    const ecsServiceAlarms = new EcsServiceAlarms(this, 'alarms', {
      alb: ecsBlueGreenService.alb,
      blueTargetGroup: ecsBlueGreenService.blueTargetGroup,
      greenTargetGroup: ecsBlueGreenService.greenTargetGroup,
      apiName: props.apiName,
    })

    const ecsBlueGreenDeploymentGroup = new EcsBlueGreenDeploymentGroup(
      this,
      'ecsApplication',
      {
        ecsClusterName: props.cluster?.clusterName,
        ecsServiceName: ecsBlueGreenService.ecsService.serviceName,
        prodListenerArn: ecsBlueGreenService.albProdListener.listenerArn,
        testListenerArn: ecsBlueGreenService.albTestListener.listenerArn,
        blueTargetGroupName:
          ecsBlueGreenService.blueTargetGroup.targetGroupName,
        greenTargetGroupName:
          ecsBlueGreenService.greenTargetGroup.targetGroupName,
        terminationWaitTime: props.taskSetTerminationTimeInMinutes,
        deploymentConfigName: props.deploymentConfigName,
        deploymentGroupName: props.apiName,
        targetGroupAlarms: ecsServiceAlarms.targetGroupAlarms,
      }
    )

    const pipeline = new codePipeline.Pipeline(this, 'ecsBlueGreen', {
      role: codePipelineRole,
      artifactBucket: artifactsBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codePipelineActions.GitHubSourceAction({
              actionName: 'Source',
              output: sourceArtifact,
              branch: 'main',
              owner: props.githubRepoOwner!,
              repo: props.githubRepoName!,
              oauthToken: githubAccessToken,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codePipelineActions.CodeBuildAction({
              actionName: 'Build',
              project: codeBuildProject,
              input: sourceArtifact,
              outputs: [buildArtifact],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codePipelineActions.CodeDeployEcsDeployAction({
              actionName: 'Deploy',
              deploymentGroup: ecsBlueGreenDeploymentGroup.ecsDeploymentGroup,
              appSpecTemplateInput: buildArtifact,
              taskDefinitionTemplateInput: buildArtifact,
            }),
          ],
        },
      ],
    })

    pipeline.node.addDependency(ecsBlueGreenDeploymentGroup)

    new cdk.CfnOutput(this, 'ecsBlueGreenLBDns', {
      description: 'Load balancer DNS',
      exportName: 'ecsBlueGreenLBDns',
      value: ecsBlueGreenService.alb.loadBalancerDnsName,
    })
  }
}
