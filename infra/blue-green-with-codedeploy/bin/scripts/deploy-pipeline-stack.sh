#!/usr/bin/env bash

GREEN="\033[1;32m"
YELLOW="\033[1;33m"

echo -e "${GREEN}Exporting domain data ...."
export API_NAME=<YOUR_API_NAME>
export HOSTED_ZONE_NAME=<YOUR_HOSTED_ZONE_NAME>
export DOMAIN_NAME=${API_NAME}.${HOSTED_ZONE_NAME}

echo -e "${GREEN}Exporting the github repo name and owner ...."
export GITHUB_REPO_OWNER=<YOUR_GITHUB_NAME>
export GITHUB_REPO_NAME=<YOUR_GITHUB_REPO>

echo -e "${GREEN}Exporting the cloudformation stack outputs...."
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)
export ECR_REPO_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecrRepoName`].OutputValue' --output text)
export CODE_BUILD_PROJECT_NAME=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`codeBuildProjectName`].OutputValue' --output text)
export ECS_TASK_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name BlueGreenContainerImageStack --query 'Stacks[*].Outputs[?ExportName==`ecsTaskRoleArn`].OutputValue' --output text)

echo -e "${GREEN}Initiating the code build to create the container image...."
export BUILD_ID=$(aws codebuild start-build --project-name $CODE_BUILD_PROJECT_NAME --query build.id --output text)
BUILD_STATUS=$(aws codebuild batch-get-builds --ids $BUILD_ID --query 'builds[*].buildStatus' --output text | xargs)

# Wait till the CodeBuild status is SUCCEEDED
while [ "$BUILD_STATUS" != "SUCCEEDED" ];
do
  sleep 10
  BUILD_STATUS=$(aws codebuild batch-get-builds --ids $BUILD_ID --query 'builds[*].buildStatus' --output text | xargs)
  echo -e "${YELLOW}Awaiting SUCCEEDED status....Current status: ${BUILD_STATUS}"
done

echo -e "${GREEN}Completed CodeBuild...ECR image is available"

echo -e "${GREEN}Start building the CodePipeline resources...."

export CONTAINER_PORT=80

cdk --app "npx ts-node bin/pipeline-stack.ts" deploy --require-approval never

echo -e "${GREEN}Completed building the CodePipeline resources...."

