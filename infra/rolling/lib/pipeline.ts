import * as cdk from '@aws-cdk/core'
import * as codebuild from '@aws-cdk/aws-codebuild'
import * as codepipeline from '@aws-cdk/aws-codepipeline'
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions'
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs'
import * as iam from '@aws-cdk/aws-iam'

export interface PipelineProps {
  readonly githubRepoName: string
  readonly githubRepoOwner: string
  readonly account: string

  readonly service: ecs.IBaseService
  readonly containerName: string
  readonly ecrRepo: ecr.Repository
}

export class Pipeline extends cdk.Construct {
  readonly service: ecs.IBaseService
  readonly containerName: string
  readonly ecrRepo: ecr.Repository

  constructor(scope: cdk.Construct, id: string, props: PipelineProps) {
    super(scope, id)

    this.service = props.service
    this.ecrRepo = props.ecrRepo
    this.containerName = props.containerName

    // SOURCE
    const githubAccessToken = cdk.SecretValue.secretsManager(
      '/github.com/sekibomazic',
      {
        jsonField: 'token',
      }
    )

    const sourceOutput = new codepipeline.Artifact('SourceArtifact')

    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHubSource',
      branch: 'main',
      owner: props.githubRepoOwner,
      repo: props.githubRepoName,
      oauthToken: githubAccessToken,
      output: sourceOutput,
    })

    // BUILD
    const buildProject = new codebuild.PipelineProject(
      this,
      'deployOnFargateCodeBuild',
      {
        // role: codeBuildServiceRole,
        description: 'Code build project for the application',
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          'infra/rolling/buildspec.yaml'
        ),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
          environmentVariables: {
            ECR_REPOSITORY_URI: {
              value: this.ecrRepo.repositoryUri,
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            AWS_ACCOUNT_ID: {
              value: props.account,
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
          },
        },
      }
    )
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    )
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:BatchCheckLayerAvailability',
          'ecr:PutImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
        ],
        resources: [this.ecrRepo.repositoryArn],
      })
    )

    const buildOutput = new codepipeline.Artifact('BuildArtifact')

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    })

    // DEPLOY
    const deployAction = new codepipeline_actions.EcsDeployAction({
      actionName: 'ECSDeploy_Action',
      input: buildOutput,
      service: this.service,
    })

    // PIPELINE STAGES

    const pipeline = new codepipeline.Pipeline(this, 'deploy-to-fargate', {
      pipelineName: 'deploy-to-fargate-rolling',
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Deploy',
          actions: [deployAction],
        },
      ],
    })
  }
}
