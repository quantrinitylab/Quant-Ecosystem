output "sns_topic_arn" {
  description = "ARN of the SNS alerting topic"
  value       = aws_sns_topic.alerts.arn
}

output "log_group_names" {
  description = "Map of service name to CloudWatch log group name"
  value       = { for k, v in aws_cloudwatch_log_group.services : k => v.name }
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "cpu_alarm_arn" {
  description = "ARN of the CPU utilization alarm"
  value       = aws_cloudwatch_metric_alarm.cpu_high.arn
}

output "memory_alarm_arn" {
  description = "ARN of the memory utilization alarm"
  value       = aws_cloudwatch_metric_alarm.memory_high.arn
}

output "error_5xx_alarm_arn" {
  description = "ARN of the 5xx error alarm"
  value       = aws_cloudwatch_metric_alarm.error_5xx.arn
}

output "latency_p99_alarm_arn" {
  description = "ARN of the P99 latency alarm"
  value       = aws_cloudwatch_metric_alarm.latency_p99.arn
}
