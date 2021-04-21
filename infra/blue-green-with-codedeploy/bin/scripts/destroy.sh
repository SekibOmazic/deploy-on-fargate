#!/usr/bin/env bash

GREEN="\033[1;32m"
YELLOW="\033[1;33m"

echo -e "${GREEN}Start cleanup..."

export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)

export GITHUB_REPO_OWNER=<YOUR_GITHUB_NAME>
export GITHUB_REPO_NAME=<YOUR_GITHUB_REPO>
export DOCKERHUB_USERNAME=<YOUR_DOCKERHUB_USERNAME>
export DOCKERHUB_PASSWORD=<YOUR_DOCKERHUB_PASSWORD>
export API_NAME=<YOUR_API_NAME>

export CONTAINER_PORT=80

export ECR_REPO_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecrRepoName`].OutputValue' --output text)
export CODE_BUILD_PROJECT_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`codeBuildProjectName`].OutputValue' --output text)
export ECS_TASK_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecsTaskRoleArn`].OutputValue' --output text)

cdk --app "npx ts-node bin/pipeline-stack.ts" destroy --require-approval never
cdk --app "npx ts-node bin/ecr-codebuild-stack.ts" destroy --require-approval never

echo -e "${GREEN}Cleanup completed..."
