terraform {
  required_version = ">= 1.12.0, < 1.13.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.0, < 5.0"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.expected_aws_account_id]

  default_tags {
    tags = merge(var.tags, {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Root        = "production-v2"
    })
  }
}

data "aws_caller_identity" "current" {}

locals {
  cluster_name = "${var.project}-${var.environment}-eks"
  bucket_names = [
    "quantmail-attachments",
    "quantdrive-files",
    "quantube-videos",
    "quantcode-artifacts",
    "quantmeet-recordings",
    "quantads-assets",
    "quantfinance-documents",
    "quantanalytics-exports",
    "backups",
  ]
  common_tags = merge(var.tags, {
    BootstrapProfile = "single-region-v2"
    CanonicalDomain  = var.application_domain
    PublicDNS        = var.public_dns_provider
  })
}

# This root is intentionally unable to plan or apply until a separate reviewed
# change flips bootstrap_root_approved after state, cost, and migration review.
resource "terraform_data" "production_v2_guard" {
  input = {
    expected_account_id = var.expected_aws_account_id
    actual_account_id   = data.aws_caller_identity.current.account_id
    region              = var.aws_region
    domain              = var.application_domain
    public_dns          = var.public_dns_provider
    kubernetes_version  = var.eks_kubernetes_version
  }

  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.expected_aws_account_id
      error_message = "Refusing to operate outside target AWS account ${var.expected_aws_account_id}."
    }

    precondition {
      condition     = var.aws_region == "us-east-1"
      error_message = "The production-v2 bootstrap is approved only for us-east-1."
    }

    precondition {
      condition     = var.application_domain == "quantrinity.in"
      error_message = "The canonical production domain must remain quantrinity.in."
    }

    precondition {
      condition     = var.public_dns_provider == "cloudflare"
      error_message = "Cloudflare must remain authoritative for public DNS."
    }

    precondition {
      condition     = !var.enable_multi_region
      error_message = "The bootstrap root must remain single-region."
    }

    precondition {
      condition     = var.bootstrap_root_approved
      error_message = "production-v2 is validation-only. Approve state, cost, migration, and an authoritative EKS version in a separate reviewed change before planning."
    }
  }
}

module "vpc" {
  source = "../../modules/vpc"

  project                   = var.project
  environment               = var.environment
  vpc_cidr                  = var.vpc_cidr
  availability_zones        = var.availability_zones
  public_subnet_cidrs       = var.public_subnet_cidrs
  private_subnet_cidrs      = var.private_subnet_cidrs
  database_subnet_cidrs     = var.database_subnet_cidrs
  enable_nat_gateway_per_az = false
  cluster_name              = local.cluster_name
  tags                      = local.common_tags

  depends_on = [terraform_data.production_v2_guard]
}

module "eks" {
  source = "../../modules/eks"

  project                    = var.project
  environment                = var.environment
  cluster_name               = local.cluster_name
  kubernetes_version         = var.eks_kubernetes_version
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  public_subnet_ids          = module.vpc.public_subnet_ids
  private_subnet_cidrs       = var.private_subnet_cidrs
  endpoint_public_access     = false
  system_node_instance_types = var.system_node_instance_types
  system_node_desired_size   = 2
  system_node_min_size       = 2
  system_node_max_size       = 3
  app_node_instance_types    = var.app_node_instance_types
  app_node_desired_size      = 1
  app_node_min_size          = 1
  app_node_max_size          = 4
  app_node_capacity_type     = var.app_node_capacity_type
  tags                       = local.common_tags

  depends_on = [terraform_data.production_v2_guard]
}

module "rds" {
  source = "../../modules/rds"

  project                 = var.project
  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  database_subnet_ids     = module.vpc.database_subnet_ids
  private_subnet_cidrs    = var.private_subnet_cidrs
  instance_class          = var.rds_instance_class
  allocated_storage       = 50
  max_allocated_storage   = 200
  database_name           = var.database_name
  master_username         = var.db_master_username
  master_password         = var.db_master_password
  multi_az                = var.rds_multi_az
  backup_retention_period = 14
  deletion_protection     = true
  tags                    = local.common_tags

  depends_on = [terraform_data.production_v2_guard]
}

module "elasticache" {
  source = "../../modules/elasticache"

  project                  = var.project
  environment              = var.environment
  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.database_subnet_ids
  private_subnet_cidrs     = var.private_subnet_cidrs
  node_type                = var.redis_node_type
  num_shards               = 1
  replicas_per_shard       = 1
  multi_az_enabled         = true
  auth_token               = var.redis_auth_token
  snapshot_retention_limit = 7
  tags                     = local.common_tags

  depends_on = [terraform_data.production_v2_guard]
}

module "s3" {
  source = "../../modules/s3"

  project              = var.project
  environment          = var.environment
  bucket_names         = local.bucket_names
  cors_allowed_origins = var.browser_origins
  tags                 = local.common_tags

  depends_on = [terraform_data.production_v2_guard]
}
