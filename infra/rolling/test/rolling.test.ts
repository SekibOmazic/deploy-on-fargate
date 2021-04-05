import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import * as Rolling from '../lib/service-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const stack = new Rolling.ServiceStack(app, 'MyTestStack', {
    domainName: 'someDomainName',
    domainZone: 'someDomainZone',
    ecrRepoName: 'someRepoName',
  })
  // THEN
  expectCDK(stack).to(
    matchTemplate(
      {
        Resources: {},
      },
      MatchStyle.EXACT
    )
  )
})
