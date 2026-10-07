locals {
  common_tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ------------------------------------------------------------------------------
# AWS Backup Vault
# ------------------------------------------------------------------------------

resource "aws_backup_vault" "main" {
  name        = "${var.project}-${var.environment}-backup-vault"
  kms_key_arn = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-backup-vault"
  })
}

# ------------------------------------------------------------------------------
# AWS Backup Plan
# ------------------------------------------------------------------------------

resource "aws_backup_plan" "main" {
  name = "${var.project}-${var.environment}-backup-plan"

  # Daily RDS snapshots - retained for 7 days
  rule {
    rule_name         = "daily-rds-snapshots"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 3 * * ? *)"
    start_window      = 60
    completion_window = 180

    lifecycle {
      delete_after = 7
    }

    recovery_point_tags = merge(local.common_tags, {
      BackupType = "daily"
    })
  }

  # Weekly full backups - retained for 30 days
  rule {
    rule_name         = "weekly-full-backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 ? * SUN *)"
    start_window      = 120
    completion_window = 360

    lifecycle {
      delete_after = 30
    }

    recovery_point_tags = merge(local.common_tags, {
      BackupType = "weekly"
    })
  }

  # Monthly long-term backups - retained for 365 days
  rule {
    rule_name         = "monthly-long-term"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 1 1 * ? *)"
    start_window      = 120
    completion_window = 720

    lifecycle {
      cold_storage_after = 30
      delete_after       = 365
    }

    recovery_point_tags = merge(local.common_tags, {
      BackupType = "monthly-long-term"
    })
  }

  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-backup-plan"
  })
}

# ------------------------------------------------------------------------------
# Backup Selection (RDS instances)
# ------------------------------------------------------------------------------

resource "aws_backup_selection" "rds" {
  name         = "${var.project}-${var.environment}-rds-selection"
  plan_id      = aws_backup_plan.main.id
  iam_role_arn = aws_iam_role.backup.arn

  resources = var.rds_arns
}

# ------------------------------------------------------------------------------
# IAM Role for AWS Backup
# ------------------------------------------------------------------------------

resource "aws_iam_role" "backup" {
  name = "${var.project}-${var.environment}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# ------------------------------------------------------------------------------
# SNS Topic for Backup Notifications
# ------------------------------------------------------------------------------

resource "aws_sns_topic" "backup_notifications" {
  name = "${var.project}-${var.environment}-backup-notifications"

  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-backup-notifications"
  })
}

resource "aws_sns_topic_subscription" "backup_email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.backup_notifications.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_backup_vault_notifications" "main" {
  backup_vault_name   = aws_backup_vault.main.name
  sns_topic_arn       = aws_sns_topic.backup_notifications.arn
  backup_vault_events = ["BACKUP_JOB_FAILED", "RESTORE_JOB_FAILED", "BACKUP_JOB_EXPIRED"]
}

# ------------------------------------------------------------------------------
# Restore Testing Lambda
# ------------------------------------------------------------------------------

resource "aws_iam_role" "restore_test_lambda" {
  name = "${var.project}-${var.environment}-restore-test-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "restore_test_lambda" {
  name = "${var.project}-${var.environment}-restore-test-policy"
  role = aws_iam_role.restore_test_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "backup:StartRestoreJob",
          "backup:DescribeRestoreJob",
          "backup:ListRecoveryPointsByBackupVault",
          "rds:DescribeDBInstances",
          "rds:DeleteDBInstance",
          "sns:Publish",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "restore_test" {
  function_name = "${var.project}-${var.environment}-backup-restore-test"
  role          = aws_iam_role.restore_test_lambda.arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 900
  memory_size   = 256

  filename         = "${path.module}/lambda/restore-test.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/restore-test.zip")

  environment {
    variables = {
      BACKUP_VAULT_NAME = aws_backup_vault.main.name
      SNS_TOPIC_ARN     = aws_sns_topic.backup_notifications.arn
      ENVIRONMENT       = var.environment
      PROJECT           = var.project
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-backup-restore-test"
  })
}

# Schedule weekly restore test
resource "aws_cloudwatch_event_rule" "restore_test_schedule" {
  name                = "${var.project}-${var.environment}-restore-test-schedule"
  description         = "Trigger weekly backup restore verification"
  schedule_expression = "cron(0 4 ? * MON *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "restore_test" {
  rule = aws_cloudwatch_event_rule.restore_test_schedule.name
  arn  = aws_lambda_function.restore_test.arn
}

resource "aws_lambda_permission" "restore_test_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.restore_test.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.restore_test_schedule.arn
}
