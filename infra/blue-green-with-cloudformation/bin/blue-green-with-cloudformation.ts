#!/usr/bin/env node
import * as cdk from '@aws-cdk/core'
import { PipelineStack } from '../lib/pipeline-stack'
import { ServiceStack } from '../lib/service-stack'

const app = new cdk.App()

new ServiceStack(app, 'SimpleApi', {
  stackName: 'SimpleApi',
  apiName: process.env.API_NAME!,
  hostedZoneName: process.env.HOSTED_ZONE_NAME!,
  ecrRepoName: process.env.GITHUB_REPO_NAME!, // just a convention I like: github repo and ECR have the same name
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})

new PipelineStack(app, 'Pipeline', {
  stackName: 'SimpleApi-pipeline',
  githubRepoName: process.env.GITHUB_REPO_NAME!,
  githubRepoOwner: process.env.GITHUB_REPO_OWNER!,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
