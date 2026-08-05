output "aws_account_id" {
  description = "AWS account verified by the fail-closed guard"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "Single production region"
  value       = var.aws_region
}

output "vpc_id" {
  description = "Production VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Private EKS API endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "PostgreSQL endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "redis_primary_endpoint" {
  description = "Redis primary endpoint"
  value       = module.elasticache.primary_endpoint_address
  sensitive   = true
}

output "s3_bucket_ids" {
  description = "Service bucket IDs"
  value       = module.s3.bucket_ids
}
