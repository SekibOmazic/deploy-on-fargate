#!/usr/bin/env bash

GREEN="\033[1;32m"

echo -e "${GREEN}Exporting github repo name and owner ...."
export GITHUB_REPO_OWNER=<YOUR_GITHUB_NAME>
export GITHUB_REPO_NAME=<YOUR_GITHUB_REPO>

echo -e "${GREEN}Exporting DockerHub credentials ...."
export DOCKERHUB_USERNAME=<YOUR_DOCKERHUB_USERNAME>
export DOCKERHUB_PASSWORD=<YOUR_DOCKERHUB_PASSWORD>

echo -e "${GREEN}Start building the container image stack resources...."
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)

cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_DEFAULT_REGION

cdk --app "npx ts-node bin/ecr-codebuild-stack.ts" deploy --require-approval never

echo -e "${GREEN}Completed building the container image stack resources...."
