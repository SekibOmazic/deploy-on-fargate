import * as https from 'https'
import * as url from 'url'
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda'

export const SUCCESS = 'SUCCESS'
export const FAILED = 'FAILED'
export type ResponseStatus = typeof SUCCESS | typeof FAILED

/**
 * IMPORTANT: following code is "borrowed" from:
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponsemodule.html#w2ab1c27c23c16b9c15
 *
 * good artist copy great artist steal ;-)
 */

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

export const send = (
  event: CloudFormationCustomResourceEvent,
  context: Context,
  responseStatus: 'SUCCESS' | 'FAILED',
  responseData?: any,
  physicalResourceId?: string,
  noEcho?: boolean
) =>
  new Promise((resolve, reject) => {
    const responseBody = JSON.stringify({
      Status: responseStatus,
      Reason:
        'See the details in CloudWatch Log Stream: ' + context.logStreamName,
      PhysicalResourceId: physicalResourceId || context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      NoEcho: noEcho || false,
      Data: responseData,
    })

    var parsedUrl = url.parse(event.ResponseURL)
    var options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': responseBody.length,
      },
    }

    console.log('Request Options:\n', JSON.stringify(options))

    var request = https.request(options, (response) => {
      console.log('Status code: ' + response.statusCode)
      console.log('Status message: ' + response.statusMessage)

      resolve({ code: response.statusCode, message: response.statusMessage })
    })

    request.on('error', (error) => {
      console.error('send(..) failed executing https.request(..): ' + error)
      reject(error.message)
    })

    request.write(responseBody)
    request.end()
  })
