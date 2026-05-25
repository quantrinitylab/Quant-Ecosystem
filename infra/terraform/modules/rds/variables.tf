variable "project" {
  type        = string
  description = "Project name used for resource naming and tagging"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g. production, staging)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where RDS will be deployed"
}

variable "database_subnet_ids" {
  type        = list(string)
  description = "List of isolated subnet IDs for the DB subnet group"
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks of private subnets allowed to connect"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  type        = number
  description = "Allocated storage in GB"
  default     = 100
}

variable "max_allocated_storage" {
  type        = number
  description = "Maximum storage for autoscaling in GB"
  default     = 500
}

variable "database_name" {
  type        = string
  description = "Name of the default database"
  default     = "quantdb"
}

variable "master_username" {
  type        = string
  description = "Master username for the database"
  default     = "quantadmin"
}

variable "master_password" {
  type        = string
  description = "Master password for the database"
  sensitive   = true
}

variable "multi_az" {
  type        = bool
  description = "Whether to enable Multi-AZ deployment"
  default     = true
}

variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain backups"
  default     = 35
}

variable "deletion_protection" {
  type        = bool
  description = "Whether to enable deletion protection"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}
