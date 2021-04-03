import * as cdk from '@aws-cdk/core'
import * as codeDeploy from '@aws-cdk/aws-codedeploy'
import * as iam from '@aws-cdk/aws-iam'
import * as lambda from '@aws-cdk/aws-lambda'
import * as path from 'path'

import { TargetGroupAlarm } from './alarms'

export interface EcsBlueGreenDeploymentGroupProps {
  /**
   * The physical, human-readable name of the CodeDeploy Deployment Group.
   *
   */
  readonly deploymentGroupName?: string

  /**
   * The Deployment Configuration this Deployment Group uses.
   *
   */
  readonly deploymentConfigName?: string

  /**
   * The termination wait time for the ECS TaskSet
   *
   */
  readonly terminationWaitTime?: number

  /**
   * Blue target group name
   */
  readonly blueTargetGroupName?: string

  /**
   * Green target group name
   */
  readonly greenTargetGroupName?: string

  /**
   * Target group alarm names
   */
  readonly targetGroupAlarms?: TargetGroupAlarm[]

  /**
   * Production listener ARN
   */
  readonly prodListenerArn?: string

  /**
   * Test listener ARN
   */
  readonly testListenerArn?: string

  /**
   * ECS cluster name
   */
  readonly ecsClusterName?: string

  /**
   * ECS service name
   */
  readonly ecsServiceName?: string
}

export class EcsBlueGreenDeploymentGroup extends cdk.Construct {
  public readonly ecsDeploymentGroup: codeDeploy.IEcsDeploymentGroup

  constructor(
    scope: cdk.Construct,
    id: string,
    props: EcsBlueGreenDeploymentGroupProps = {}
  ) {
    super(scope, id)

    const ecsApplication = new codeDeploy.EcsApplication(this, 'ecsApplication')

    const codeDeployServiceRole = new iam.Role(
      this,
      'ecsCodeDeployServiceRole',
      {
        assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      }
    )

    codeDeployServiceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployRoleForECS')
    )

    // IAM role for custom lambda function
    const customLambdaServiceRole = new iam.Role(
      this,
      'codeDeployCustomLambda',
      {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      }
    )

    const inlinePolicyForLambda = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:PassRole',
        'sts:AssumeRole',
        'codedeploy:List*',
        'codedeploy:Get*',
        'codedeploy:UpdateDeploymentGroup',
        'codedeploy:CreateDeploymentGroup',
        'codedeploy:DeleteDeploymentGroup',
      ],
      resources: ['*'],
    })

    customLambdaServiceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicExecutionRole'
      )
    )
    customLambdaServiceRole.addToPolicy(inlinePolicyForLambda)

    // Custom resource to create the deployment group
    const createDeploymentGroupLambda = new lambda.Function(
      this,
      'createDeploymentGroupLambda',
      {
        code: lambda.Code.fromAsset(
          path.join(__dirname, 'deployment-group-lambda')
        ),
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: 'index.handler',
        role: customLambdaServiceRole,
        description: 'Custom resource to create ECS deployment group',
        memorySize: 128,
        timeout: cdk.Duration.seconds(60),
        functionName: 'deployment-group-lambda',
      }
    )

    new cdk.CustomResource(this, 'customEcsDeploymentGroup', {
      serviceToken: createDeploymentGroupLambda.functionArn,
      properties: {
        ApplicationName: ecsApplication.applicationName,
        DeploymentGroupName: props.deploymentGroupName,
        DeploymentConfigName: props.deploymentConfigName,
        ServiceRoleArn: codeDeployServiceRole.roleArn,
        BlueTargetGroup: props.blueTargetGroupName,
        GreenTargetGroup: props.greenTargetGroupName,
        ProdListenerArn: props.prodListenerArn,
        TestListenerArn: props.testListenerArn,
        TargetGroupAlarms: props.targetGroupAlarms?.map((alarm) => alarm.name),
        EcsClusterName: props.ecsClusterName,
        EcsServiceName: props.ecsServiceName,
        TerminationWaitTime: props.terminationWaitTime,
      },
    })

    this.ecsDeploymentGroup = codeDeploy.EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(
      this,
      'ecsDeploymentGroup',
      {
        application: ecsApplication,
        deploymentGroupName: props.deploymentGroupName!,
        deploymentConfig: codeDeploy.EcsDeploymentConfig.fromEcsDeploymentConfigName(
          this,
          'ecsDeploymentConfig',
          props.deploymentConfigName!
        ),
      }
    )
  }
}
