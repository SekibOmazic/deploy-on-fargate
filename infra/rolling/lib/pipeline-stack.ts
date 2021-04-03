import * as cdk from '@aws-cdk/core'
import * as codebuild from '@aws-cdk/aws-codebuild'
import * as codepipeline from '@aws-cdk/aws-codepipeline'
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions'
import * as ecr from '@aws-cdk/aws-ecr'

import { StackProps } from '@aws-cdk/core'

export interface PipelineStackProps extends StackProps {
  readonly repoName: string
  readonly repoOwner: string
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props)

    // ECR repository for the docker images
    const ecrRepo = new ecr.Repository(this, 'demoAppEcrRepo', {
      repositoryName: props.repoName,
      imageScanOnPush: true,
    })

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
      owner: props.repoOwner,
      repo: props.repoName,
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
              value: ecrRepo.repositoryUri,
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            AWS_ACCOUNT_ID: {
              value: props.env!.account!,
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
          },
        },
        // source: codebuild.Source.gitHub({
        //   repo: props.repoName,
        //   owner: props.repoOwner,
        // }),
      }
    )

    const buildOutput = new codepipeline.Artifact('BuildArtifact')

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    })

    // PIPELINE STAGES

    const pipeline = new codepipeline.Pipeline(this, 'deploy-to-fargate', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        // TODO
        // {
        //   stageName: 'Deploy-to-ECS',
        //   actions: [deployAction],
        // }
      ],
    })
  }
}
