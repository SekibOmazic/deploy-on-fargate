import * as cdk from '@aws-cdk/core'
import * as codebuild from '@aws-cdk/aws-codebuild'
import * as codepipeline from '@aws-cdk/aws-codepipeline'
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions'
import * as ecr from '@aws-cdk/aws-ecr'
import * as iam from '@aws-cdk/aws-iam'

export interface PipelineStackProps extends cdk.StackProps {
  readonly githubRepoName: string
  readonly githubRepoOwner: string
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props)

    // ECR repository for the docker images
    const ecrRepo = new ecr.Repository(this, 'EcrRepo', {
      // just a convention I like: ECR repo and the Github repo have the same name
      repositoryName: props.githubRepoName,
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
          'infra/blue-green-with-cloudformation/buildspec.yaml'
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
        resources: [ecrRepo.repositoryArn],
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
    const changeSetName = 'SimpleApiChangeSet'
    const createChangeSetAction = new codepipeline_actions.CloudFormationCreateReplaceChangeSetAction(
      {
        actionName: 'CreateChangeSet',
        stackName: 'SimpleApi',
        changeSetName,
        runOrder: 1,
        adminPermissions: true,
        templatePath: buildOutput.atPath('SimpleApi.template.json'),
      }
    )

    const executeChangeSetAction = new codepipeline_actions.CloudFormationExecuteChangeSetAction(
      {
        actionName: 'ExecuteChangeSet',
        stackName: 'SimpleApi',
        changeSetName,
        runOrder: 2,
      }
    )

    // PIPELINE STAGES

    new codepipeline.Pipeline(
      this,
      'deploy-to-fargate-blue-green-cloudformation',
      {
        pipelineName: 'blue-green-with-cloudformation',
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
            actions: [createChangeSetAction, executeChangeSetAction],
          },
        ],
      }
    )
  }
}
