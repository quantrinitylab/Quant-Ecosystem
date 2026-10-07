output "canary_arns" {
  description = "Map of canary ARNs by service name"
  value       = { for k, v in aws_synthetics_canary.service_endpoints : k => v.arn }
}

output "canary_names" {
  description = "Map of canary names by service name"
  value       = { for k, v in aws_synthetics_canary.service_endpoints : k => v.name }
}

output "composite_alarm_arn" {
  description = "ARN of the 72-hour green threshold composite alarm"
  value       = aws_cloudwatch_composite_alarm.green_threshold.arn
}

output "dashboard_arn" {
  description = "ARN of the synthetics dashboard"
  value       = aws_cloudwatch_dashboard.synthetics.dashboard_arn
}

output "artifacts_bucket" {
  description = "S3 bucket name for canary artifacts"
  value       = aws_s3_bucket.canary_artifacts.id
}
