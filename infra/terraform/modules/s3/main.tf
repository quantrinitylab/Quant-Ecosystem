locals {
  common_tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ------------------------------------------------------------------------------
# S3 Buckets (one per service)
# ------------------------------------------------------------------------------

resource "aws_s3_bucket" "service" {
  for_each = toset(var.bucket_names)

  bucket = "${var.project}-${var.environment}-${each.key}"

  tags = merge(local.common_tags, {
    Name    = "${var.project}-${var.environment}-${each.key}"
    Service = each.key
  })
}

# ------------------------------------------------------------------------------
# Versioning
# ------------------------------------------------------------------------------

resource "aws_s3_bucket_versioning" "service" {
  for_each = toset(var.bucket_names)

  bucket = aws_s3_bucket.service[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

# ------------------------------------------------------------------------------
# Server-Side Encryption
# ------------------------------------------------------------------------------

resource "aws_s3_bucket_server_side_encryption_configuration" "service" {
  for_each = toset(var.bucket_names)

  bucket = aws_s3_bucket.service[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# ------------------------------------------------------------------------------
# Block Public Access
# ------------------------------------------------------------------------------

resource "aws_s3_bucket_public_access_block" "service" {
  for_each = toset(var.bucket_names)

  bucket = aws_s3_bucket.service[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ------------------------------------------------------------------------------
# Lifecycle Rules
# ------------------------------------------------------------------------------

resource "aws_s3_bucket_lifecycle_configuration" "service" {
  for_each = toset(var.bucket_names)

  bucket = aws_s3_bucket.service[each.key].id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ------------------------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------------------------

resource "aws_s3_bucket_cors_configuration" "service" {
  for_each = toset(var.bucket_names)

  bucket = aws_s3_bucket.service[each.key].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag", "Content-Length"]
    max_age_seconds = 3600
  }
}
