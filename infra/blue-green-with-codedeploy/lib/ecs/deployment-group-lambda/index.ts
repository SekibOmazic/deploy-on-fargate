import type {
  Context,
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda'
import { CodeDeploy } from 'aws-sdk'
import * as response from './sender'

enum RollbackEvent {
  DEPLOYMENT_FAILURE = 'DEPLOYMENT_FAILURE',
  DEPLOYMENT_STOP_ON_ALARM = 'DEPLOYMENT_STOP_ON_ALARM',
  DEPLOYMENT_STOP_ON_REQUEST = 'DEPLOYMENT_STOP_ON_REQUEST',
}

export interface EcsDeploymentGroupProps {
  applicationName: string
  deploymentGroupName: string
  deploymentConfigName: string
  serviceRoleArn: string
  blueTargetGroup: string
  greenTargetGroup: string
  prodListenerArn: string
  testListenerArn: string
  clusterName: string
  serviceName: string
  terminationWaitTimeInMinutes: number
  targetGroupAlarms: string[] // list of alarm names
}

const codeDeploy = new CodeDeploy()

const getProperties = (
  props:
    | CloudFormationCustomResourceEvent['ResourceProperties']
    | CloudFormationCustomResourceUpdateEvent['OldResourceProperties']
): EcsDeploymentGroupProps => ({
  applicationName: props.ApplicationName,
  deploymentGroupName: props.DeploymentGroupName,
  deploymentConfigName: props.DeploymentConfigName,
  serviceRoleArn: props.ServiceRoleArn,
  blueTargetGroup: props.BlueTargetGroup,
  greenTargetGroup: props.GreenTargetGroup,
  prodListenerArn: props.ProdListenerArn,
  testListenerArn: props.TestListenerArn,
  clusterName: props.EcsClusterName,
  serviceName: props.EcsServiceName,
  terminationWaitTimeInMinutes: props.TerminationWaitTime,
  targetGroupAlarms: props.TargetGroupAlarms,
})

const onCreate = async (
  event: CloudFormationCustomResourceCreateEvent,
  context: Context
): Promise<void> => {
  const {
    applicationName,
    deploymentGroupName,
    deploymentConfigName,
    serviceRoleArn,
    blueTargetGroup,
    greenTargetGroup,
    prodListenerArn,
    testListenerArn,
    clusterName,
    serviceName,
    terminationWaitTimeInMinutes,
    targetGroupAlarms,
  } = getProperties(event.ResourceProperties)

  const input = {
    applicationName,
    deploymentGroupName,
    deploymentConfigName,
    serviceRoleArn,
    deploymentStyle: {
      deploymentType: 'BLUE_GREEN',
      deploymentOption: 'WITH_TRAFFIC_CONTROL',
    },
    blueGreenDeploymentConfiguration: {
      terminateBlueInstancesOnDeploymentSuccess: {
        action: 'TERMINATE',
        terminationWaitTimeInMinutes,
      },
      deploymentReadyOption: {
        actionOnTimeout: 'CONTINUE_DEPLOYMENT',
      },
    },
    alarmConfiguration: {
      enabled: true,
      ignorePollAlarmFailure: false,
      alarms: targetGroupAlarms.map((name) => ({ name: name })),
    },
    autoRollbackConfiguration: {
      enabled: true,
      events: [
        RollbackEvent.DEPLOYMENT_FAILURE,
        RollbackEvent.DEPLOYMENT_STOP_ON_REQUEST,
        RollbackEvent.DEPLOYMENT_STOP_ON_ALARM,
      ],
    },
    ecsServices: [
      {
        clusterName: clusterName,
        serviceName: serviceName,
      },
    ],
    loadBalancerInfo: {
      targetGroupPairInfoList: [
        {
          prodTrafficRoute: {
            listenerArns: [prodListenerArn],
          },
          testTrafficRoute: {
            listenerArns: [testListenerArn],
          },
          targetGroups: [{ name: blueTargetGroup }, { name: greenTargetGroup }],
        },
      ],
    },
  }

  console.log(JSON.stringify(input))

  try {
    await codeDeploy.createDeploymentGroup(input).promise()

    const data = {
      event: 'Resource created',
      deploymentGroupName,
    }

    await response.send(
      event,
      context,
      response.SUCCESS,
      data,
      deploymentGroupName
    )
  } catch (error) {
    await response.send(
      event,
      context,
      response.FAILED,
      {},
      deploymentGroupName
    )
  }
}

const onUpdate = async (
  event: CloudFormationCustomResourceUpdateEvent,
  context: Context
): Promise<void> => {
  const newProps = getProperties(event.ResourceProperties)
  const oldProps = getProperties(event.OldResourceProperties)

  const deploymentGroupName = newProps.deploymentGroupName

  const input = {
    applicationName: oldProps.applicationName,
    currentDeploymentGroupName: oldProps.deploymentGroupName,
    newDeploymentGroupName: newProps.deploymentGroupName,
    deploymentConfigName: newProps.deploymentConfigName,
    serviceRoleArn: newProps.serviceRoleArn,
    deploymentStyle: {
      deploymentType: 'BLUE_GREEN',
      deploymentOption: 'WITH_TRAFFIC_CONTROL',
    },
    blueGreenDeploymentConfiguration: {
      terminateBlueInstancesOnDeploymentSuccess: {
        action: 'TERMINATE',
        terminationWaitTimeInMinutes: newProps.terminationWaitTimeInMinutes,
      },
      deploymentReadyOption: {
        actionOnTimeout: 'CONTINUE_DEPLOYMENT',
      },
    },
    alarmConfiguration: {
      enabled: true,
      ignorePollAlarmFailure: false,
      alarms: newProps.targetGroupAlarms.map((name) => ({ name })),
    },
    autoRollbackConfiguration: {
      enabled: true,
      events: [
        RollbackEvent.DEPLOYMENT_FAILURE,
        RollbackEvent.DEPLOYMENT_STOP_ON_REQUEST,
        RollbackEvent.DEPLOYMENT_STOP_ON_ALARM,
      ],
    },
    ecsServices: [
      {
        clusterName: newProps.clusterName,
        serviceName: newProps.serviceName,
      },
    ],
    loadBalancerInfo: {
      targetGroupPairInfoList: [
        {
          prodTrafficRoute: {
            listenerArns: [newProps.prodListenerArn],
          },
          testTrafficRoute: {
            listenerArns: [newProps.testListenerArn],
          },
          targetGroups: [
            { name: newProps.blueTargetGroup },
            { name: newProps.greenTargetGroup },
          ],
        },
      ],
    },
  }

  try {
    await codeDeploy.updateDeploymentGroup(input).promise()

    const data = {
      event: 'Resource updated',
      deploymentGroupName,
    }

    await response.send(
      event,
      context,
      response.SUCCESS,
      data,
      deploymentGroupName
    )
  } catch (error) {
    await response.send(
      event,
      context,
      response.FAILED,
      {},
      deploymentGroupName
    )
  }
}

const onDelete = async (
  event: CloudFormationCustomResourceDeleteEvent,
  context: Context
): Promise<void> => {
  const { applicationName, deploymentGroupName } = getProperties(
    event.ResourceProperties
  )

  try {
    await codeDeploy
      .deleteDeploymentGroup({
        applicationName,
        deploymentGroupName,
      })
      .promise()

    const data = {
      event: 'Resource deleted',
      deploymentGroupName,
    }

    await response.send(
      event,
      context,
      response.SUCCESS,
      data,
      deploymentGroupName
    )
  } catch (error) {
    await response.send(
      event,
      context,
      response.FAILED,
      {},
      deploymentGroupName
    )
  }
}

export const handler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context
): Promise<void> => {
  console.log(event)

  const requestType = event.RequestType

  switch (requestType) {
    case 'Create':
      return onCreate(event as CloudFormationCustomResourceCreateEvent, context)
    case 'Update':
      return onUpdate(event as CloudFormationCustomResourceUpdateEvent, context)
    case 'Delete':
      return onDelete(event as CloudFormationCustomResourceDeleteEvent, context)
    default:
      throw new Error(`Invalid request type: ${requestType}`)
  }
}
