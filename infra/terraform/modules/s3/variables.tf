variable "project" {
  type        = string
  description = "Project name used for resource naming and tagging"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g. production, staging)"
}

variable "bucket_names" {
  type        = list(string)
  description = "List of bucket name suffixes to create (one per service)"
}

variable "cors_allowed_origins" {
  type        = list(string)
  description = "Allowed origins for CORS configuration"
  default     = ["*"]
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}
