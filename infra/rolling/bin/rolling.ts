#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { PipelineStack } from '../lib/pipeline-stack'

const GITHUB_REPO_NAME = 'deploy-on-fargate'
const GITHUB_REPO_OWNER = 'SekibOmazic'

const app = new cdk.App()

new PipelineStack(app, 'fargate-rolling-pipeline', {
  stackName: 'deploy-on-fargate-rolling-pipeline',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  repoName: GITHUB_REPO_NAME,
  repoOwner: GITHUB_REPO_OWNER,
})
