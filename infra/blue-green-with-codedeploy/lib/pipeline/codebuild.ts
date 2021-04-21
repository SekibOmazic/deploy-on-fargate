import * as cdk from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import * as ecr from '@aws-cdk/aws-ecr'
import * as codeBuild from '@aws-cdk/aws-codebuild'
import * as secretsManager from '@aws-cdk/aws-secretsmanager'

export interface EcsBlueGreenBuildImageProps {
  readonly ecsTaskRole: iam.Role
  readonly codeBuildRole: iam.Role
  readonly apiName: string
  readonly codeRepoOwner: string
  readonly codeRepoName: string
  readonly dockerHubUsername: string
  readonly dockerHubPassword: string
}

export class EcsBlueGreenBuildImage extends cdk.Construct {
  public readonly ecrRepo: ecr.Repository
  public readonly codeBuildProject: codeBuild.Project

  constructor(
    scope: cdk.Construct,
    id: string,
    props: EcsBlueGreenBuildImageProps
  ) {
    super(scope, id)

    // Ecr
    this.ecrRepo = new ecr.Repository(this, 'ecrRepo', {
      imageScanOnPush: true,
      repositoryName: props.codeRepoName,
    })

    // secrets manager for DockerHub login
    const dockerHubSecret = new secretsManager.CfnSecret(
      this,
      'dockerHubSecret',
      {
        secretString: JSON.stringify({
          username: props.dockerHubUsername,
          password: props.dockerHubPassword,
        }),
        description: 'DockerHub secrets for CodeBuild',
      }
    )

    // CodeBuild project
    this.codeBuildProject = new codeBuild.Project(this, 'codeBuild', {
      role: props.codeBuildRole,
      description: 'Code build project for the application',
      environment: {
        buildImage: codeBuild.LinuxBuildImage.STANDARD_4_0,
        computeType: codeBuild.ComputeType.SMALL,
        privileged: true,
        environmentVariables: {
          REPOSITORY_URI: {
            value: this.ecrRepo.repositoryUri,
            type: codeBuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          TASK_EXECUTION_ARN: {
            value: props.ecsTaskRole!.roleArn,
            type: codeBuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          DOCKER_HUB_SECRET_ARN: {
            value: dockerHubSecret.ref,
            type: codeBuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          API_NAME: {
            value: props.apiName,
            type: codeBuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
        },
      },
      source: codeBuild.Source.gitHub({
        owner: props.codeRepoOwner!,
        repo: props.codeRepoName!,
      }),
      buildSpec: codeBuild.BuildSpec.fromSourceFilename(
        'infra/blue-green-with-codedeploy/buildspec.yaml'
      ),
    })

    new cdk.CfnOutput(this, 'ecrRepoName', {
      description: 'ECR repository name',
      exportName: 'ecrRepoName',
      value: this.ecrRepo.repositoryName,
    })
    new cdk.CfnOutput(this, 'codeBuildProjectName', {
      description: 'CodeBuild project name',
      exportName: 'codeBuildProjectName',
      value: this.codeBuildProject.projectName,
    })
    new cdk.CfnOutput(this, 'ecsTaskRoleArn', {
      description: 'ECS task role arn',
      exportName: 'ecsTaskRoleArn',
      value: props.ecsTaskRole?.roleArn!,
    })
  }
}
