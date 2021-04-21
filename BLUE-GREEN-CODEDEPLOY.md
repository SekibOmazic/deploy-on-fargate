# Blue-Green deployment using CodeDeploy

## Pre-requisites

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

3. Create a secret in AWS Secrets Manager and store your Github OAuth token. Secrets Manager stores seceret as a JSON file. For example, my secret is stored under the name `/github.com/sekibomazic` and has one field "token". For more details see [pipeline.ts](infra/blue-green-with-codedeploy/lib/pipeline/pipeline.ts)

4. Check out [this repo](https://github.com/SekibOmazic/codedeploy-lifecycle-event-hooks) and deploy it. Please use the same domain name for your service as in Step 1. This will ensure you have a Lambda Hook that gets triggered on each deployment.

5. Create an account with dockerhub and get your username and password. We use it to aviod hitting rate limit when building the docker image.

6. There are 3 scripts you will use to deploy your stack:

   [deploy-ecr-codebuild-stack.sh](infra/blue-green-with-codedeploy/bin/scripts/deploy-ecr-codebuild-stack.sh)

   [deploy-pipeline-stack.sh](infra/blue-green-with-codedeploy/bin/scripts/deploy-pipeline-stack.sh)

   [destroy.sh](infra/blue-green-with-codedeploy/bin/scripts/destroy.sh)

Open each and update environment variables accordingly (all starting with <YOUR\_...>)

7. Install `aws-cdk` on your machine. Easiest way for MacOS is using `brew`:

```
brew install aws-cdk
```

or update it to the newest version

```
brew upgrade
```

## Deploy the stack

1. from your terminal:

```
cd infra/blue-green-with-codedeploy
npm i
npm run build
npm run test
```

2. deploy stacks:

```
./bin/scripts/deploy-ecr-codebuild-stack.sh
```

and then

```
./bin/scripts/deploy-pipeline-stack.sh
```

The first script creates an ECR repo and the CodeBuild project. The second script builds the docker image and stores it into ECR and then it starts provisioning AWS resources.

## Testing your deployment

To get the "blue" page point your browser to

```
https://<API_NAME>.<HOSTED_ZONE_NAME>
```

In the second browser tab/window open

```
https://<API_NAME>.<HOSTED_ZONE_NAME>:9000
```

Now change the color of your page to green. Just change line 13 of [index.js](src/index.js) to
`const color = GREEN` and push the new commit.
This will trigger a new build which you can see in AWS Console (CodePipeline). Under CodeDeploy you can see a lot of information about your current build. Once the replacement group is built start refreshing the second browser tab (port 9000) and you'll see the green page. The original (production) group will still show the blue page.
When the CodeDeploy starts shifting the traffic you coud start refreshing the first browser tab (port 443) and you'll start seeing the blue and green page.
Once the deployment is completed you'll only receive the green page.

## Testing Rollback

Now it's time to see Lambda trigger in action. Just change line 13 of [index.js](src/index.js) to `const color = RED` and push the new commit.
Once the replacement group is built start refreshing the second browser tab (port 9000) and you'll see the red page. The original (production) group will still show the green page.
Our Lambda hook will get triggered in the `AfterAllowTestTraffic` phase of deployment and it will check if the service return the "right" color (only blue or green colors are accepted) and if not, it will signal CodeDeploy that the deployment has failed.
The replacement group will be destroyed and your original group will never serve the "red" page

## Cleanup

```
cd infra/blue-green-with-codedeploy
./bin/scripts/destroy.sh
```

For some reason deleting of ELB and target groups doesn't work and those resources must be deleted manually.
You also need to manually remove S3 bucket.
