#!/usr/bin/env bash

GREEN="\033[1;32m"

echo -e "${GREEN}Building Cdk project ...."
npm i
npm run build
npm run test

echo -e "${GREEN}Deploying stack ...."
cdk deploy Pipeline --require-approval never

echo -e "${GREEN}Deployment completed"
