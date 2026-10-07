variable "project" {
  type        = string
  description = "Project name used for resource naming and tagging"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g. production, staging)"
}

variable "cluster_name" {
  type        = string
  description = "Name of the EKS cluster"
}

variable "kubernetes_version" {
  type        = string
  description = "Kubernetes version for the EKS cluster"
  default     = "1.29"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the cluster will be deployed"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for worker nodes"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "List of public subnet IDs for load balancers"
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks of private subnets for security group rules"
}

variable "endpoint_public_access" {
  type        = bool
  description = "Whether the EKS API endpoint is publicly accessible"
  default     = true
}

variable "system_node_instance_types" {
  type        = list(string)
  description = "Instance types for system node group"
  default     = ["t3.medium"]
}

variable "system_node_desired_size" {
  type        = number
  description = "Desired number of system nodes"
  default     = 2
}

variable "system_node_min_size" {
  type        = number
  description = "Minimum number of system nodes"
  default     = 2
}

variable "system_node_max_size" {
  type        = number
  description = "Maximum number of system nodes"
  default     = 4
}

variable "app_node_instance_types" {
  type        = list(string)
  description = "Instance types for application node group"
  default     = ["t3.large"]
}

variable "app_node_desired_size" {
  type        = number
  description = "Desired number of application nodes"
  default     = 3
}

variable "app_node_min_size" {
  type        = number
  description = "Minimum number of application nodes"
  default     = 2
}

variable "app_node_max_size" {
  type        = number
  description = "Maximum number of application nodes"
  default     = 10
}

variable "app_node_capacity_type" {
  type        = string
  description = "Capacity type for app nodes (ON_DEMAND or SPOT)"
  default     = "ON_DEMAND"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}
