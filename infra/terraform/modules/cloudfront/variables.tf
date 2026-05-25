variable "project" {
  type        = string
  description = "Project name used for resource naming and tagging"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g. production, staging)"
}

variable "s3_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket to use as origin"
}

variable "s3_bucket_id" {
  type        = string
  description = "ID of the S3 bucket to use as origin"
}

variable "s3_bucket_domain_name" {
  type        = string
  description = "Regional domain name of the S3 bucket"
}

variable "domain_aliases" {
  type        = list(string)
  description = "Custom domain names (CNAMEs) for the distribution"
  default     = []
}

variable "acm_certificate_arn" {
  type        = string
  description = "ARN of the ACM certificate for HTTPS (must be in us-east-1)"
  default     = ""
}

variable "waf_web_acl_id" {
  type        = string
  description = "ID of the WAF web ACL to associate with the distribution"
  default     = null
}

variable "price_class" {
  type        = string
  description = "CloudFront price class"
  default     = "PriceClass_100"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}
