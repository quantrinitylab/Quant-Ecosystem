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
  description = "VPC ID where ElastiCache will be deployed"
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for the ElastiCache subnet group"
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks of private subnets allowed to connect"
}

variable "node_type" {
  type        = string
  description = "ElastiCache node type"
  default     = "cache.t3.medium"
}

variable "num_shards" {
  type        = number
  description = "Number of shards (node groups) in the cluster"
  default     = 3
}

variable "replicas_per_shard" {
  type        = number
  description = "Number of replica nodes per shard"
  default     = 2
}

variable "multi_az_enabled" {
  type        = bool
  description = "Whether to enable Multi-AZ"
  default     = true
}

variable "auth_token" {
  type        = string
  description = "Auth token (password) for Redis authentication"
  sensitive   = true
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain automatic snapshots"
  default     = 7
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}
