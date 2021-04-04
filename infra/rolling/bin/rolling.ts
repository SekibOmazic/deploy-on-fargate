#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { Pipeline } from '../lib/pipeline'
import { Service } from '../lib/service'

const GITHUB_REPO_NAME = 'deploy-on-fargate'
const GITHUB_REPO_OWNER = 'SekibOmazic'
const DOMAIN_NAME = 'simple-api.delta-comsysto-reply.de'
const DOMAIN_ZONE = 'delta-comsysto-reply.de'
const ECR_REPOSITORY_NAME = 'simple-api'

class FargateRollingStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    const api = new Service(this, 'deploy-on-fargate-api', {
      domainName: DOMAIN_NAME,
      domainZone: DOMAIN_ZONE,
      ecrRepoName: ECR_REPOSITORY_NAME,
    })

    const pipeline = new Pipeline(this, 'Pipeline', {
      githubRepoName: GITHUB_REPO_NAME,
      githubRepoOwner: GITHUB_REPO_OWNER,
      account: props.env!.account!,
      containerName: api.containerName,
      ecrRepo: api.ecrRepo,
      service: api.service,
    })
  }
}

const app = new cdk.App()

new FargateRollingStack(app, 'FargateStack', {
  stackName: 'fargate-rolling-deployment',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
