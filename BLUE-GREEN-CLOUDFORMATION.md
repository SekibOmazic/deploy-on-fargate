# Blue-Green deployment using CloudFormation

This example is made using CDK. Check [this repo](https://github.com/SekibOmazic/blue-green-fargate) if you prefer YAML configuration.

## Pre-requisite

1. Make sure you have a domain and a certificate registered with ACM. Go to Route53 in your AWS Console and get the hosted zone name (HOSTED_ZONE_NAME hereafter)

For example:

```
delta-comsysto-reply.de
```

Define the subdomain name (API_NAME hereafter) you'll use for your service e.g. `simple-api`.

The full domain name (DOMAIN_NAME hereafter) will look like this:

```
<DOMAIN_NAME>=<API_NAME>.<HOSTED_ZONE_NAME>
```

In my case it is: https://simple-api.delta-comsysto-reply.de

2. Create an SSM Parameter named "CertificateArn-<DOMAIN_NAME>" and store the certificate Arn.

Example:

```
CertificateArn-simple-api.delta-comsysto-reply.de
```

3. Create a secret in AWS Secrets Manager and store your Github OAuth token. Secrets Manager stores seceret as a JSON file. For example, my secret is stored under the name `/github.com/sekibomazic` and has one field "token". For more details see [pipeline-stack.ts](infra/blue-green-with-cloudformation/lib/pipeline-stack.ts)

4. Check out [this repo](https://github.com/SekibOmazic/codedeploy-lifecycle-event-hooks) and deploy it. Please use the same domain name for your service as in Step 1. This will ensure you have a Lambda Hook that gets triggered on each deployment.

5. Open [blue-green-with-cloudformation.ts](infra/blue-green-with-cloudformation/bin/blue-green-with-cloudformation.ts) and update values of GITHUB_REPO_OWNER, GITHUB_REPO_NAME, API_NAME, HOSTED_ZONE_NAME
   When done, you'll need to push the code changes back to your Github!

6. Install `aws-cdk` on your machine. Easiest way for MacOS is using `brew`:

```
brew install aws-cdk
```

or update it to the newest version

```
brew upgrade
```

## Deploy the stack

From your terminal:

```
npm i
cd infra/blue-green-with-cloudformation
./bin/scripts/deploy.sh
```

## Cleanup

From AWS Console choose CloudFromation and manually delete resource stack and then pipeline stack. In my case stack names are `SimpleApi` and `SimpleApi-pipeline`.

You'll also need to manually delete S3 artifacts bucket and ECR Repo.

## Limitations

Blue-Green deployment using CloudFormation has some serious [limitations](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/blue-green.html#blue-green-considerations) making it not suitable for complex use cases
