#!/usr/bin/env node
import * as cdk from '@aws-cdk/core'
import { PipelineStack } from '../lib/pipeline-stack'
import { ServiceStack } from '../lib/service-stack'

const GITHUB_REPO_OWNER = '<YOUR_REPO_OWNER>'
const GITHUB_REPO_NAME = '<YOUR_REPO_NAME>'

const API_NAME = '<YOUR_SUBDOMAIN>'
const HOSTED_ZONE_NAME = '<YOUR_HOSTED_ZONE_NAME>'

const app = new cdk.App()

new ServiceStack(app, 'SimpleApi', {
  stackName: 'SimpleApi',
  apiName: API_NAME,
  hostedZoneName: HOSTED_ZONE_NAME,
  ecrRepoName: GITHUB_REPO_NAME, // just a convention I like: github repo and ECR have the same name
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})

new PipelineStack(app, 'Pipeline', {
  stackName: 'SimpleApi-pipeline',
  githubRepoName: GITHUB_REPO_NAME,
  githubRepoOwner: GITHUB_REPO_OWNER,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
