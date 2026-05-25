terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.0"
    }
  }

  backend "s3" {
    bucket         = "quant-terraform-state-production"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  cluster_name = "${var.project}-${var.environment}-eks"
  service_names = [
    "quantchat",
    "quantmail",
    "quantai",
    "quantsync",
    "quantads",
    "quantube",
    "quantneon",
    "quantedits",
    "quantmax",
    "ws-gateway",
    "identity",
  ]
  bucket_names = [
    "quantchat-uploads",
    "quantmail-attachments",
    "quantai-models",
    "quantsync-data",
    "quantads-media",
    "quantube-videos",
    "quantneon-assets",
    "quantedits-projects",
    "quantmax-storage",
  ]
}

# ------------------------------------------------------------------------------
# VPC
# ------------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  project              = var.project
  environment          = var.environment
  vpc_cidr             = "10.0.0.0/16"
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
  database_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
  enable_nat_gateway_per_az = true
  cluster_name         = local.cluster_name
}

# ------------------------------------------------------------------------------
# EKS
# ------------------------------------------------------------------------------

module "eks" {
  source = "../../modules/eks"

  project            = var.project
  environment        = var.environment
  cluster_name       = local.cluster_name
  kubernetes_version = "1.29"
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  public_subnet_ids  = module.vpc.public_subnet_ids
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]

  endpoint_public_access     = true
  system_node_instance_types = ["m5.large"]
  system_node_desired_size   = 3
  system_node_min_size       = 3
  system_node_max_size       = 6
  app_node_instance_types    = ["m5.xlarge"]
  app_node_desired_size      = 3
  app_node_min_size          = 3
  app_node_max_size          = 20
  app_node_capacity_type     = "ON_DEMAND"
}

# ------------------------------------------------------------------------------
# RDS (PostgreSQL with pgvector)
# ------------------------------------------------------------------------------

module "rds" {
  source = "../../modules/rds"

  project              = var.project
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  database_subnet_ids  = module.vpc.database_subnet_ids
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]

  instance_class        = "db.r6g.xlarge"
  allocated_storage     = 200
  max_allocated_storage = 1000
  database_name         = "quantdb"
  master_username       = var.db_master_username
  master_password       = var.db_master_password
  multi_az              = true
  backup_retention_period = 35
  deletion_protection   = true
}

# ------------------------------------------------------------------------------
# ElastiCache (Redis)
# ------------------------------------------------------------------------------

module "elasticache" {
  source = "../../modules/elasticache"

  project              = var.project
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  subnet_ids           = module.vpc.private_subnet_ids
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]

  node_type          = "cache.r6g.large"
  num_shards         = 3
  replicas_per_shard = 2
  multi_az_enabled   = true
  auth_token         = var.redis_auth_token
  snapshot_retention_limit = 7
}

# ------------------------------------------------------------------------------
# S3 (Per-service buckets)
# ------------------------------------------------------------------------------

module "s3" {
  source = "../../modules/s3"

  project      = var.project
  environment  = var.environment
  bucket_names = local.bucket_names
  cors_allowed_origins = var.cors_allowed_origins
}

# ------------------------------------------------------------------------------
# CloudFront (CDN)
# ------------------------------------------------------------------------------

module "cloudfront" {
  source = "../../modules/cloudfront"

  project               = var.project
  environment           = var.environment
  s3_bucket_arn         = module.s3.bucket_arns["quantube-videos"]
  s3_bucket_id          = module.s3.bucket_ids["quantube-videos"]
  s3_bucket_domain_name = module.s3.bucket_domain_names["quantube-videos"]
  domain_aliases        = var.cdn_domain_aliases
  acm_certificate_arn   = var.acm_certificate_arn
  waf_web_acl_id        = var.waf_web_acl_id
  price_class           = "PriceClass_All"
}

# ------------------------------------------------------------------------------
# Monitoring
# ------------------------------------------------------------------------------

module "monitoring" {
  source = "../../modules/monitoring"

  project                          = var.project
  environment                      = var.environment
  aws_region                       = var.aws_region
  cluster_name                     = local.cluster_name
  service_names                    = local.service_names
  log_retention_days               = 30
  alb_arn_suffix                   = var.alb_arn_suffix
  rds_instance_id                  = module.rds.db_instance_id
  elasticache_replication_group_id = module.elasticache.replication_group_id
  alert_email                      = var.alert_email
}
