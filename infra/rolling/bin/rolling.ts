#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { PipelineStack } from '../lib/pipeline-stack'
import { ServiceStack } from '../lib/service-stack'

const GITHUB_REPO_NAME = 'deploy-on-fargate'
const GITHUB_REPO_OWNER = 'SekibOmazic'
const DOMAIN_NAME = 'simple-api.delta-comsysto-reply.de'
const DOMAIN_ZONE = 'delta-comsysto-reply.de'
const ECR_REPOSITORY_NAME = 'simple-api'

const app = new cdk.App()

new ServiceStack(app, 'SimpleApi', {
  domainName: DOMAIN_NAME,
  domainZone: DOMAIN_ZONE,
  ecrRepoName: ECR_REPOSITORY_NAME,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})

new PipelineStack(app, 'Pipeline', {
  stackName: 'fargate-rolling-deployment-pipeline',
  githubRepoName: GITHUB_REPO_NAME,
  githubRepoOwner: GITHUB_REPO_OWNER,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
