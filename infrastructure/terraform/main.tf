terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# 1. Private S3 Audio Recording Bucket (ap-south-1 Mumbai)
resource "aws_s3_bucket" "audio_recordings" {
  bucket        = "counselling-recordings-private-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = {
    Environment = var.environment
    Application = "CounsellingPortal"
    Compliance  = "HIPAA-DPDP"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio_encryption" {
  bucket = aws_s3_bucket.audio_recordings.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "audio_block_public" {
  bucket                  = aws_s3_bucket.audio_recordings.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "audio_versioning" {
  bucket = aws_s3_bucket.audio_recordings.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audio_retention" {
  bucket = aws_s3_bucket.audio_recordings.id
  rule {
    id     = "HealthcareSevenYearRetention"
    status = "Enabled"
    expiration {
      days = 2555 # 7 years
    }
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# 2. Production AWS Secrets Manager Secret
resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "counselling-portal/${var.environment}"
  description = "Production credentials for Counselling Management Portal"
}

resource "aws_secretsmanager_secret_version" "app_secrets_val" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    NODE_ENV              = "production"
    PORT                  = "5000"
    FRONTEND_URL          = "https://counselling.${var.custom_domain}"
    API_URL               = "https://api.${var.custom_domain}"
    GOOGLE_CALLBACK_URL   = "https://api.${var.custom_domain}/api/auth/google/callback"
    AWS_REGION            = var.aws_region
    BOOTSTRAP_ADMIN_EMAIL = var.bootstrap_admin_email
    SESSION_SECRET        = random_password.session_secret.result
    GOOGLE_CLIENT_ID      = var.google_client_id
    GOOGLE_CLIENT_SECRET  = var.google_client_secret
    MONGODB_URI           = var.mongodb_uri
    BREVO_API_KEY         = var.brevo_api_key
    GEMINI_API_KEY        = var.gemini_api_key
  })
}

resource "random_password" "session_secret" {
  length  = 64
  special = false
}

data "aws_caller_identity" "current" {}

