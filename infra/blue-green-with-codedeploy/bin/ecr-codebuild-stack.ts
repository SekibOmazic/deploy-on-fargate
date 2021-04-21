#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import * as blueGreen from '../lib'

export class BlueGreenContainerImageStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const roles = new blueGreen.EcsBlueGreenRoles(this, 'Roles')

    new blueGreen.EcsBlueGreenBuildImage(this, 'EcsBlueGreenBuildImage', {
      codeBuildRole: roles.codeBuildRole,
      ecsTaskRole: roles.ecsTaskRole,
      apiName: process.env.API_NAME || 'simple-api',
      codeRepoOwner: process.env.GITHUB_REPO_OWNER!,
      codeRepoName: process.env.GITHUB_REPO_NAME!,
      dockerHubUsername: process.env.DOCKERHUB_USERNAME!,
      dockerHubPassword: process.env.DOCKERHUB_PASSWORD!,
    })
  }
}

const app = new cdk.App()
new BlueGreenContainerImageStack(app, 'BlueGreenContainerImageStack')
