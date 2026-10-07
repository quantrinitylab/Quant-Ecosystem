variable "project" {
  type        = string
  description = "Project name used for resource naming and tagging"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g. production, staging)"
}

variable "aws_region" {
  type        = string
  description = "AWS region for dashboard metrics"
}

variable "cluster_name" {
  type        = string
  description = "EKS cluster name for metrics dimensions"
}

variable "service_names" {
  type        = list(string)
  description = "List of service names for log group creation"
}

variable "log_retention_days" {
  type        = number
  description = "Number of days to retain CloudWatch logs"
  default     = 30
}

variable "alb_arn_suffix" {
  type        = string
  description = "ARN suffix of the Application Load Balancer"
  default     = ""
}

variable "rds_instance_id" {
  type        = string
  description = "RDS instance identifier for metrics"
  default     = ""
}

variable "elasticache_replication_group_id" {
  type        = string
  description = "ElastiCache replication group ID for metrics"
  default     = ""
}

variable "alert_email" {
  type        = string
  description = "Email address for alarm notifications"
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}
