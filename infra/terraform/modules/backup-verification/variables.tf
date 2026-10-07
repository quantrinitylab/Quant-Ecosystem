variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encrypting backups"
  type        = string
  default     = null
}

variable "rds_arns" {
  description = "List of RDS instance ARNs to back up"
  type        = list(string)
}

variable "alert_email" {
  description = "Email address for backup failure notifications"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
