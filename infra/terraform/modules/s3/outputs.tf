output "bucket_ids" {
  description = "Map of service name to S3 bucket ID"
  value       = { for k, v in aws_s3_bucket.service : k => v.id }
}

output "bucket_arns" {
  description = "Map of service name to S3 bucket ARN"
  value       = { for k, v in aws_s3_bucket.service : k => v.arn }
}

output "bucket_domain_names" {
  description = "Map of service name to S3 bucket domain name"
  value       = { for k, v in aws_s3_bucket.service : k => v.bucket_regional_domain_name }
}
