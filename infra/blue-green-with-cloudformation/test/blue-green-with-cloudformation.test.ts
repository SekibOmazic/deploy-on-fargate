import { countResources, expect as expectCDK } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import * as serviceStack from '../lib/service-stack'

test('ServiceStack Created', () => {
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
  expectCDK(stack).to(countResources('AWS::ECS::Service', 1))
  expectCDK(stack).to(
    countResources('AWS::ElasticLoadBalancingV2::LoadBalancer', 1)
  )
  expectCDK(stack).to(
    countResources('AWS::ElasticLoadBalancingV2::Listener', 2)
  )
  expectCDK(stack).to(
    countResources('AWS::ElasticLoadBalancingV2::TargetGroup', 2)
  )
})
