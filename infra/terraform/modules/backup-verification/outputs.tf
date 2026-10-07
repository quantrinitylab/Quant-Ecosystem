output "backup_vault_arn" {
  description = "ARN of the backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_vault_name" {
  description = "Name of the backup vault"
  value       = aws_backup_vault.main.name
}

output "backup_plan_id" {
  description = "ID of the backup plan"
  value       = aws_backup_plan.main.id
}

output "backup_plan_arn" {
  description = "ARN of the backup plan"
  value       = aws_backup_plan.main.arn
}

output "sns_topic_arn" {
  description = "ARN of the backup notifications SNS topic"
  value       = aws_sns_topic.backup_notifications.arn
}

output "restore_test_lambda_arn" {
  description = "ARN of the restore test Lambda function"
  value       = aws_lambda_function.restore_test.arn
}
