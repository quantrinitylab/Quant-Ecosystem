variable "expected_aws_account_id" {
  type        = string
  description = "Only AWS account in which this root may operate"
  default     = "266176113726"

  validation {
    condition     = var.expected_aws_account_id == "266176113726"
    error_message = "The production-v2 root is pinned to AWS account 266176113726."
  }
}

variable "aws_region" {
  type        = string
  description = "Single bootstrap region"
  default     = "us-east-1"

  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "The production-v2 bootstrap is pinned to us-east-1."
  }
}

variable "project" {
  type        = string
  description = "Project name used for resource naming"
  default     = "quant"
}

variable "environment" {
  type        = string
  description = "Environment name"
  default     = "production"
}

variable "application_domain" {
  type        = string
  description = "Canonical application domain"
  default     = "quantrinity.in"

  validation {
    condition     = var.application_domain == "quantrinity.in"
    error_message = "The canonical application domain must be quantrinity.in."
  }
}

variable "public_dns_provider" {
  type        = string
  description = "Authoritative public DNS provider"
  default     = "cloudflare"

  validation {
    condition     = var.public_dns_provider == "cloudflare"
    error_message = "Cloudflare must remain authoritative for public DNS."
  }
}

variable "enable_multi_region" {
  type        = bool
  description = "Multi-region is intentionally disabled for bootstrap"
  default     = false

  validation {
    condition     = !var.enable_multi_region
    error_message = "The production-v2 bootstrap must remain single-region."
  }
}

variable "bootstrap_root_approved" {
  type        = bool
  description = "Fail-closed switch; may be enabled only in a separate reviewed change after state, cost, and migration approval"
  default     = false
}

variable "eks_kubernetes_version" {
  type        = string
  description = "EKS Kubernetes version confirmed as supported in the target account immediately before planning; intentionally has no default"

  validation {
    condition     = can(regex("^1\\.[0-9]+$", var.eks_kubernetes_version))
    error_message = "Use an explicit Kubernetes minor version such as 1.xx after checking target-account EKS support."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the single production VPC"
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "Three us-east-1 availability zones"
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]

  validation {
    condition     = length(var.availability_zones) == 3 && alltrue([for az in var.availability_zones : startswith(az, "us-east-1")])
    error_message = "Exactly three us-east-1 availability zones are required."
  }
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "Public subnet CIDRs, one per availability zone"
  default     = ["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 3
    error_message = "Exactly three public subnet CIDRs are required."
  }
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "Private application subnet CIDRs, one per availability zone"
  default     = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == 3
    error_message = "Exactly three private subnet CIDRs are required."
  }
}

variable "database_subnet_cidrs" {
  type        = list(string)
  description = "Isolated database subnet CIDRs, one per availability zone"
  default     = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]

  validation {
    condition     = length(var.database_subnet_cidrs) == 3
    error_message = "Exactly three database subnet CIDRs are required."
  }
}

variable "system_node_instance_types" {
  type        = list(string)
  description = "Cost-controlled on-demand EKS system node types"
  default     = ["t3.medium"]
}

variable "app_node_instance_types" {
  type        = list(string)
  description = "EKS application node types"
  default     = ["t3.large"]
}

variable "app_node_capacity_type" {
  type        = string
  description = "Capacity type for application nodes"
  default     = "SPOT"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.app_node_capacity_type)
    error_message = "Application node capacity type must be ON_DEMAND or SPOT."
  }
}

variable "rds_instance_class" {
  type        = string
  description = "Bootstrap RDS instance class"
  default     = "db.t4g.medium"
}

variable "rds_multi_az" {
  type        = bool
  description = "RDS Multi-AZ switch; cost review must explicitly approve enabling it"
  default     = false
}

variable "database_name" {
  type        = string
  description = "Default PostgreSQL database name"
  default     = "quantdb"
}

variable "db_master_username" {
  type        = string
  description = "PostgreSQL master username, supplied through protected CI variables"
}

variable "db_master_password" {
  type        = string
  description = "PostgreSQL master password, supplied through TF_VAR_db_master_password"
  sensitive   = true

  validation {
    condition     = length(var.db_master_password) >= 16
    error_message = "The database master password must be at least 16 characters."
  }
}

variable "redis_node_type" {
  type        = string
  description = "Bootstrap ElastiCache node type"
  default     = "cache.t4g.small"
}

variable "redis_auth_token" {
  type        = string
  description = "Redis auth token, supplied through TF_VAR_redis_auth_token"
  sensitive   = true

  validation {
    condition     = length(var.redis_auth_token) >= 16 && length(var.redis_auth_token) <= 128
    error_message = "The Redis auth token must contain between 16 and 128 characters."
  }
}

variable "browser_origins" {
  type        = list(string)
  description = "Explicit browser origins allowed to access service buckets; wildcard origins are forbidden"
  default     = ["https://quantrinity.in"]

  validation {
    condition     = length(var.browser_origins) > 0 && alltrue([for origin in var.browser_origins : startswith(origin, "https://") && !strcontains(origin, "*")])
    error_message = "Every browser origin must be an explicit HTTPS origin without a wildcard."
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional tags applied to all resources"
  default     = {}
}
