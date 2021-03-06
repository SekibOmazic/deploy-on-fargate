import * as cdk from '@aws-cdk/core'
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import * as cloudWatch from '@aws-cdk/aws-cloudwatch'

export interface EcsServiceAlarmsProps {
  readonly blueTargetGroup?: elb.ApplicationTargetGroup
  readonly greenTargetGroup?: elb.ApplicationTargetGroup
  readonly alb?: elb.ApplicationLoadBalancer
  readonly apiName?: string
}

export class TargetGroupAlarm {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

export class EcsServiceAlarms extends cdk.Construct {
  public readonly targetGroupAlarms?: TargetGroupAlarm[] = []
  private readonly alarms: cloudWatch.Alarm[] = []
  private readonly prefix: string

  constructor(
    scope: cdk.Construct,
    id: string,
    props: EcsServiceAlarmsProps = {}
  ) {
    super(scope, id)

    this.prefix = props.apiName!

    // CloudWatch Metrics for UnhealthyHost and 5XX errors
    const blueUnhealthyHostMetric = EcsServiceAlarms.createUnhealthyHostMetric(
      props.blueTargetGroup!,
      props.alb!
    )
    const blue5xxMetric = EcsServiceAlarms.create5xxMetric(
      props.blueTargetGroup!,
      props.alb!
    )
    const greenUnhealthyHostMetric = EcsServiceAlarms.createUnhealthyHostMetric(
      props.greenTargetGroup!,
      props.alb!
    )
    const green5xxMetric = EcsServiceAlarms.create5xxMetric(
      props.greenTargetGroup!,
      props.alb!
    )

    // CloudWatch Alarms for UnhealthyHost and 5XX errors
    const blueGroupUnhealthyHostAlarm = this.createAlarm(
      blueUnhealthyHostMetric,
      'blue',
      'UnhealthyHost',
      2
    )
    const blueGroup5xxAlarm = this.createAlarm(blue5xxMetric, 'blue', '5xx', 1)
    const greenGroupUnhealthyHostAlarm = this.createAlarm(
      greenUnhealthyHostMetric,
      'green',
      'UnhealthyHost',
      2
    )
    const greenGroup5xxAlarm = this.createAlarm(
      green5xxMetric,
      'green',
      '5xx',
      1
    )

    this.alarms.push(blueGroupUnhealthyHostAlarm)
    this.alarms.push(blueGroup5xxAlarm)
    this.alarms.push(greenGroupUnhealthyHostAlarm)
    this.alarms.push(greenGroup5xxAlarm)

    this.targetGroupAlarms = this.alarms.map(
      (item) => new TargetGroupAlarm(item.alarmName)
    )
  }

  private static createUnhealthyHostMetric(
    targetGroup: elb.ApplicationTargetGroup,
    alb: elb.ApplicationLoadBalancer
  ) {
    return new cloudWatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'UnHealthyHostCount',
      dimensions: {
        TargetGroup: targetGroup.targetGroupFullName,
        LoadBalancer: alb.loadBalancerFullName,
      },
      statistic: cloudWatch.Statistic.AVERAGE,
      period: cdk.Duration.seconds(300),
    })
  }

  private static create5xxMetric(
    targetGroup: elb.ApplicationTargetGroup,
    alb: elb.ApplicationLoadBalancer
  ) {
    return new cloudWatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensions: {
        TargetGroup: targetGroup.targetGroupFullName,
        LoadBalancer: alb.loadBalancerFullName,
      },
      statistic: cloudWatch.Statistic.SUM,
      period: cdk.Duration.seconds(300),
    })
  }

  private createAlarm(
    metric: cloudWatch.Metric,
    targetGroupName: string,
    errorType: string,
    evaluationPeriods: number
  ) {
    const alarmName = this.prefix
      .concat(targetGroupName)
      .concat(errorType)
      .concat('Alarm')
    return new cloudWatch.Alarm(this, alarmName, {
      alarmName: alarmName,
      alarmDescription: 'CloudWatch Alarm for the '
        .concat(errorType)
        .concat(' errors of ')
        .concat(targetGroupName)
        .concat(' target group'),
      metric: metric,
      threshold: 1,
      evaluationPeriods: evaluationPeriods,
    })
  }
}
