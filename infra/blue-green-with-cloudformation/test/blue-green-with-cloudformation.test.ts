import { expect as expectCDK, haveResource } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import * as serviceStack from '../lib/service-stack'
// import * as pipelineStack from '../lib/pipeline-stack'

test('SQS Queue Created', () => {
  const app = new cdk.App()
  // WHEN
  const stack = new serviceStack.ServiceStack(app, 'ServiceStack', {
    stackName: 'SimpleApi',
    apiName: 'simple-api',
    hostedZoneName: 'test.com',
    ecrRepoName: 'mock-repo',
    env: {
      account: 'mock-account',
      region: 'us-east-1',
    },
  })
  // THEN
  // expectCDK(stack).to(haveResource("AWS::SQS::Queue",{
  //   VisibilityTimeout: 300
  // }));
})

// test('SNS Topic Created', () => {
//   const app = new cdk.App();
//   // WHEN
//   const stack = new BlueGreenWithCloudformation.BlueGreenWithCloudformationStack(app, 'MyTestStack');
//   // THEN
//   expectCDK(stack).to(haveResource("AWS::SNS::Topic"));
// });
