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

# Secondary region provider for multi-region failover
provider "aws" {
  alias  = "secondary"
  region = "eu-west-1"

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Region      = "secondary"
    }
  }
}

locals {
  cluster_name = "${var.project}-${var.environment}-eks"
  primary_region   = "us-east-1"
  secondary_region = "eu-west-1"
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
  system_node_min_size       = 1
  system_node_max_size       = 4
  app_node_instance_types    = ["t3.large"]
  app_node_desired_size      = 2
  app_node_min_size          = 1
  app_node_max_size          = 10
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

  instance_class        = "db.t4g.medium"
  allocated_storage     = 20
  max_allocated_storage = 100
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
  private_subnet_cidrs = module.vpc.private_subnet_cidrs

  node_type          = "cache.t4g.micro"
  num_shards         = 1
  replicas_per_shard = 0
  multi_az_enabled   = false
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

# ------------------------------------------------------------------------------
# Multi-Region: Secondary VPC (eu-west-1) — CONDITIONAL
# Only created when enable_multi_region = true (currently blocked by safety.tf)
# ------------------------------------------------------------------------------

module "vpc_secondary" {
  count  = var.enable_multi_region ? 1 : 0
  source = "../../modules/vpc"

  providers = {
    aws = aws.secondary
  }

  project              = var.project
  environment          = "${var.environment}-secondary"
  vpc_cidr             = "10.2.0.0/16"
  availability_zones   = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
  public_subnet_cidrs  = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
  private_subnet_cidrs = ["10.2.10.0/24", "10.2.11.0/24", "10.2.12.0/24"]
  database_subnet_cidrs = ["10.2.20.0/24", "10.2.21.0/24", "10.2.22.0/24"]
  enable_nat_gateway_per_az = false
  cluster_name         = "${local.cluster_name}-secondary"
}

# ------------------------------------------------------------------------------
# Multi-Region: Cross-Region RDS Read Replica — CONDITIONAL
# ------------------------------------------------------------------------------

resource "aws_db_instance" "cross_region_replica" {
  count    = var.enable_multi_region ? 1 : 0
  provider = aws.secondary

  identifier          = "${var.project}-${var.environment}-replica-eu"
  replicate_source_db = module.rds.db_instance_arn
  instance_class      = "db.t4g.medium"
  storage_encrypted   = true
  multi_az            = false

  vpc_security_group_ids = [aws_security_group.rds_replica_secondary[0].id]
  db_subnet_group_name   = aws_db_subnet_group.secondary[0].name

  backup_retention_period = 7
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.project}-${var.environment}-replica-eu-final"

  tags = {
    Name        = "${var.project}-${var.environment}-rds-replica-eu"
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Region      = "secondary"
  }
}

resource "aws_db_subnet_group" "secondary" {
  count    = var.enable_multi_region ? 1 : 0
  provider = aws.secondary

  name       = "${var.project}-${var.environment}-secondary-db-subnet"
  subnet_ids = module.vpc_secondary[0].database_subnet_ids

  tags = {
    Name        = "${var.project}-${var.environment}-secondary-db-subnet"
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_security_group" "rds_replica_secondary" {
  count    = var.enable_multi_region ? 1 : 0
  provider = aws.secondary

  name_prefix = "${var.project}-${var.environment}-rds-replica-"
  vpc_id      = module.vpc_secondary[0].vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = module.vpc_secondary[0].private_subnet_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project}-${var.environment}-rds-replica-sg"
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ------------------------------------------------------------------------------
# Multi-Region: S3 Cross-Region Replication — CONDITIONAL
# ------------------------------------------------------------------------------

resource "aws_s3_bucket" "replication_destination" {
  count    = var.enable_multi_region ? 1 : 0
  provider = aws.secondary

  bucket = "${var.project}-${var.environment}-replication-eu"

  tags = {
    Name        = "${var.project}-${var.environment}-replication-eu"
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Region      = "secondary"
  }
}

resource "aws_s3_bucket_versioning" "replication_destination" {
  count    = var.enable_multi_region ? 1 : 0
  provider = aws.secondary

  bucket = aws_s3_bucket.replication_destination[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_iam_role" "s3_replication" {
  count = var.enable_multi_region ? 1 : 0
  name  = "${var.project}-${var.environment}-s3-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy" "s3_replication" {
  count = var.enable_multi_region ? 1 : 0
  name  = "${var.project}-${var.environment}-s3-replication-policy"
  role  = aws_iam_role.s3_replication[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Resource = values(module.s3.bucket_arns)
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Resource = [for arn in values(module.s3.bucket_arns) : "${arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Resource = "${aws_s3_bucket.replication_destination[0].arn}/*"
      }
    ]
  })
}

# ------------------------------------------------------------------------------
# Multi-Region: Route53 Health Checks & Failover — CONDITIONAL
# Uses quantrinity.in instead of stale quant.app
# ------------------------------------------------------------------------------

resource "aws_route53_health_check" "primary" {
  count             = var.enable_multi_region ? 1 : 0
  fqdn              = "quantrinity.in"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/identity/health"
  failure_threshold = 3
  request_interval  = 10

  tags = {
    Name        = "${var.project}-${var.environment}-primary-health-check"
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_route53_health_check" "secondary" {
  count             = var.enable_multi_region ? 1 : 0
  fqdn              = "eu.quantrinity.in"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/identity/health"
  failure_threshold = 3
  request_interval  = 10

  tags = {
    Name        = "${var.project}-${var.environment}-secondary-health-check"
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Note: Route53 failover records removed — Cloudflare owns public DNS.
# If multi-region is ever enabled, use Cloudflare load balancing instead.

# ------------------------------------------------------------------------------
# Synthetic Monitoring — uses quantrinity.in
# ------------------------------------------------------------------------------

module "synthetic_monitoring" {
  source = "../../modules/synthetic-monitoring"

  project     = var.project
  environment = var.environment
  aws_region  = var.aws_region

  service_endpoints = [
    { name = "identity",  url = "https://quantrinity.in/api/identity/health",  expected_status = 200 },
    { name = "chat-api",  url = "https://quantrinity.in/api/chat/health",      expected_status = 200 },
    { name = "mail-api",  url = "https://quantrinity.in/api/mail/health",      expected_status = 200 },
    { name = "ai-api",    url = "https://quantrinity.in/api/ai/health",        expected_status = 200 },
    { name = "sync-api",  url = "https://quantrinity.in/api/sync/health",      expected_status = 200 },
    { name = "ads-api",   url = "https://quantrinity.in/api/ads/health",       expected_status = 200 },
    { name = "tube-api",  url = "https://quantrinity.in/api/tube/health",      expected_status = 200 },
    { name = "neon-api",  url = "https://quantrinity.in/api/neon/health",      expected_status = 200 },
    { name = "edits-api", url = "https://quantrinity.in/api/edits/health",     expected_status = 200 },
    { name = "max-api",   url = "https://quantrinity.in/api/max/health",       expected_status = 200 },
    { name = "ws-gw",     url = "https://quantrinity.in/api/ws/health",        expected_status = 200 },
  ]

  sns_topic_arn = module.monitoring.sns_topic_arn
}
