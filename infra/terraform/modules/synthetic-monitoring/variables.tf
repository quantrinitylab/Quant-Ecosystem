variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for the resources"
  type        = string
  default     = "us-east-1"
}

variable "service_endpoints" {
  description = "List of service endpoints to monitor with synthetic canaries"
  type = list(object({
    name            = string
    url             = string
    expected_status = number
  }))
}

variable "canary_interval_minutes" {
  description = "Interval between canary runs in minutes"
  type        = number
  default     = 5
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for alerting on canary failures"
  type        = string
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
