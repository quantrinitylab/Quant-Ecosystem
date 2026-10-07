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
    bucket         = "quant-terraform-state-staging"
    key            = "staging/terraform.tfstate"
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
  vpc_cidr             = "10.1.0.0/16"
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
  private_subnet_cidrs = ["10.1.10.0/24", "10.1.11.0/24", "10.1.12.0/24"]
  database_subnet_cidrs = ["10.1.20.0/24", "10.1.21.0/24", "10.1.22.0/24"]
  enable_nat_gateway_per_az = false
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
  private_subnet_cidrs = module.vpc.private_subnet_cidrs

  endpoint_public_access     = true
  system_node_instance_types = ["t3.medium"]
  system_node_desired_size   = 2
  system_node_min_size       = 2
  system_node_max_size       = 3
  app_node_instance_types    = ["t3.large"]
  app_node_desired_size      = 2
  app_node_min_size          = 2
  app_node_max_size          = 5
  app_node_capacity_type     = "SPOT"
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
  private_subnet_cidrs = module.vpc.private_subnet_cidrs

  instance_class        = "db.t3.medium"
  allocated_storage     = 50
  max_allocated_storage = 200
  database_name         = "quantdb"
  master_username       = var.db_master_username
  master_password       = var.db_master_password
  multi_az              = false
  backup_retention_period = 7
  deletion_protection   = false
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
  private_subnet_cidrs = module.vpc.private_subnet_cidrs

  node_type          = "cache.t3.medium"
  num_shards         = 1
  replicas_per_shard = 1
  multi_az_enabled   = false
  auth_token         = var.redis_auth_token
  snapshot_retention_limit = 3
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
  waf_web_acl_id        = null
  price_class           = "PriceClass_100"
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
  log_retention_days               = 7
  alb_arn_suffix                   = var.alb_arn_suffix
  rds_instance_id                  = module.rds.db_instance_id
  elasticache_replication_group_id = module.elasticache.replication_group_id
  alert_email                      = var.alert_email
}

# ------------------------------------------------------------------------------
# Backup Verification
# ------------------------------------------------------------------------------

module "backup_verification" {
  source = "../../modules/backup-verification"

  project     = var.project
  environment = var.environment
  rds_arns    = [module.rds.db_instance_arn]
  alert_email = var.alert_email
}

# ------------------------------------------------------------------------------
# Synthetic Monitoring
# ------------------------------------------------------------------------------

module "synthetic_monitoring" {
  source = "../../modules/synthetic-monitoring"

  project     = var.project
  environment = var.environment
  aws_region  = var.aws_region

  service_endpoints = [
    { name = "identity",  url = "https://staging.quant.dev/api/identity/health",  expected_status = 200 },
    { name = "chat-api",  url = "https://staging.quant.dev/api/chat/health",      expected_status = 200 },
    { name = "mail-api",  url = "https://staging.quant.dev/api/mail/health",      expected_status = 200 },
    { name = "ai-api",    url = "https://staging.quant.dev/api/ai/health",        expected_status = 200 },
    { name = "sync-api",  url = "https://staging.quant.dev/api/sync/health",      expected_status = 200 },
    { name = "ads-api",   url = "https://staging.quant.dev/api/ads/health",       expected_status = 200 },
    { name = "tube-api",  url = "https://staging.quant.dev/api/tube/health",      expected_status = 200 },
    { name = "neon-api",  url = "https://staging.quant.dev/api/neon/health",      expected_status = 200 },
    { name = "edits-api", url = "https://staging.quant.dev/api/edits/health",     expected_status = 200 },
    { name = "max-api",   url = "https://staging.quant.dev/api/max/health",       expected_status = 200 },
    { name = "ws-gw",     url = "https://staging.quant.dev/api/ws/health",        expected_status = 200 },
  ]

  sns_topic_arn = module.monitoring.sns_topic_arn
}
