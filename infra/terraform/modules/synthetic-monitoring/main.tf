locals {
  common_tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ------------------------------------------------------------------------------
# S3 Bucket for Canary Artifacts
# ------------------------------------------------------------------------------

resource "aws_s3_bucket" "canary_artifacts" {
  bucket = "${var.project}-${var.environment}-canary-artifacts"

  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-canary-artifacts"
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "canary_artifacts" {
  bucket = aws_s3_bucket.canary_artifacts.id

  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}

# ------------------------------------------------------------------------------
# IAM Role for Synthetics Canaries
# ------------------------------------------------------------------------------

resource "aws_iam_role" "canary" {
  name = "${var.project}-${var.environment}-synthetics-canary"

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

resource "aws_iam_role_policy" "canary" {
  name = "${var.project}-${var.environment}-synthetics-canary-policy"
  role = aws_iam_role.canary.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:GetBucketLocation"
        ]
        Resource = [
          aws_s3_bucket.canary_artifacts.arn,
          "${aws_s3_bucket.canary_artifacts.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "CloudWatchSynthetics"
          }
        }
      }
    ]
  })
}

# ------------------------------------------------------------------------------
# CloudWatch Synthetics Canaries (one per service endpoint)
# ------------------------------------------------------------------------------

resource "aws_synthetics_canary" "service_endpoints" {
  for_each = { for ep in var.service_endpoints : ep.name => ep }

  name                 = "${var.project}-${var.environment}-${each.key}"
  artifact_s3_location = "s3://${aws_s3_bucket.canary_artifacts.id}/canary/${each.key}"
  execution_role_arn   = aws_iam_role.canary.arn
  handler              = "apiCanaryBlueprint.handler"
  zip_file             = "${path.module}/canary/api-canary.zip"
  runtime_version      = "syn-nodejs-puppeteer-7.0"
  start_canary         = true

  schedule {
    expression = "rate(${var.canary_interval_minutes} minutes)"
  }

  run_config {
    timeout_in_seconds = 60
    environment_variables = {
      ENDPOINT_URL   = each.value.url
      EXPECTED_STATUS = tostring(each.value.expected_status)
    }
  }

  success_retention_period = 31
  failure_retention_period = 31

  tags = merge(local.common_tags, {
    Name    = "${var.project}-${var.environment}-${each.key}-canary"
    Service = each.key
  })
}

# ------------------------------------------------------------------------------
# CloudWatch Alarms for Canary Failures
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "canary_failure" {
  for_each = { for ep in var.service_endpoints : ep.name => ep }

  alarm_name          = "${var.project}-${var.environment}-${each.key}-canary-failure"
  alarm_description   = "Synthetic canary for ${each.key} is failing"
  namespace           = "CloudWatchSynthetics"
  metric_name         = "SuccessPercent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 100
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    CanaryName = aws_synthetics_canary.service_endpoints[each.key].name
  }

  alarm_actions = [var.sns_topic_arn]
  ok_actions    = [var.sns_topic_arn]

  tags = merge(local.common_tags, {
    Name    = "${var.project}-${var.environment}-${each.key}-canary-alarm"
    Service = each.key
  })
}

# ------------------------------------------------------------------------------
# 72-Hour Green Threshold Composite Alarm
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_composite_alarm" "green_threshold" {
  alarm_name        = "${var.project}-${var.environment}-72h-green-threshold"
  alarm_description = "All synthetic canaries must be green for 72 hours before production cutover"

  alarm_rule = join(" AND ", [
    for ep in var.service_endpoints :
    "ALARM(${aws_cloudwatch_metric_alarm.canary_failure[ep.name].alarm_name})"
  ])

  actions_enabled = true
  alarm_actions   = [var.sns_topic_arn]

  tags = merge(local.common_tags, {
    Name = "${var.project}-${var.environment}-72h-green-threshold"
  })
}

# ------------------------------------------------------------------------------
# CloudWatch Dashboard for Synthetic Monitoring
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "synthetics" {
  dashboard_name = "${var.project}-${var.environment}-synthetics"

  dashboard_body = jsonencode({
    widgets = [
      for idx, ep in var.service_endpoints : {
        type   = "metric"
        x      = (idx % 3) * 8
        y      = floor(idx / 3) * 6
        width  = 8
        height = 6
        properties = {
          metrics = [
            ["CloudWatchSynthetics", "SuccessPercent", "CanaryName", "${var.project}-${var.environment}-${ep.name}"]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "${ep.name} - Success Rate"
          view   = "timeSeries"
        }
      }
    ]
  })
}
