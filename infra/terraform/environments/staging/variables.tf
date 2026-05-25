variable "project" {
  type        = string
  description = "Project name"
  default     = "quant"
}

variable "environment" {
  type        = string
  description = "Environment name"
  default     = "staging"
}

variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "us-east-1"
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability zones to use"
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "db_master_username" {
  type        = string
  description = "Master username for RDS"
  sensitive   = true
}

variable "db_master_password" {
  type        = string
  description = "Master password for RDS"
  sensitive   = true
}

variable "redis_auth_token" {
  type        = string
  description = "Auth token for Redis"
  sensitive   = true
}

variable "cors_allowed_origins" {
  type        = list(string)
  description = "Allowed origins for CORS"
  default     = ["https://staging.quant.app", "https://*.staging.quant.app"]
}

variable "cdn_domain_aliases" {
  type        = list(string)
  description = "Custom domain names for CloudFront"
  default     = []
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for CloudFront HTTPS"
  default     = ""
}

variable "alb_arn_suffix" {
  type        = string
  description = "ARN suffix of the ALB for monitoring"
  default     = ""
}

variable "alert_email" {
  type        = string
  description = "Email address for alarm notifications"
  default     = ""
}
