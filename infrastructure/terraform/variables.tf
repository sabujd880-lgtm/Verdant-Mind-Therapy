variable "aws_region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS region (Mumbai default)"
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Deployment environment"
}

variable "custom_domain" {
  type        = string
  default     = "yourdomain.com"
  description = "Base domain name"
}

variable "bootstrap_admin_email" {
  type        = string
  default     = "sabujd880@gmail.com"
  description = "Initial Super Admin user email"
}

variable "mongodb_uri" {
  type        = string
  sensitive   = true
  default     = ""
  description = "MongoDB Atlas TLS connection string"
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Google OAuth 2.0 Web Client ID"
}

variable "google_client_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Google OAuth 2.0 Client Secret"
}

variable "brevo_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Brevo SMTP Transactional API Key"
}

variable "gemini_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Google Gemini Flash API Key"
}

