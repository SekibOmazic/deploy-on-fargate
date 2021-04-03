# Rolling deployment

## Pre-requisites

Make sure you have a domain and a certificate registered with ACM. Create an SSM Parameter named "CertificateArn-<DOMAIN_NAME>" and store the certificate Arn.

Create a secret in AWS Secrets Manager and store your Github OAuth token (for more details see [pipeline-stack.ts](infra/rolling/lib/pipeline-stack.ts) )

Change the variables in [rolling.ts](infra/rolling/bin/rolling.ts)

## Deploy

```
npm i
cd infra/rolling
npm i
npm run build
cdk deploy Pipeline --require-approval never
```

This will first trigger the Pipeline stack which will pull the source from Github, build it and deploy it on ECS using rolling deployment.

IMPORTANT: Build stage of the CodePipeline will create a CloudFormation template (using cdk synth) which will then be used by the Deployment stage to create SimpleApi stack.

After both stacks are created just point the browser to https://DOMAIN_NAME

## Cleanup

```
cdk destroy SimpleApi --require-approval never
cdk destroy Pipeline --require-approval never
```
