project     = "quant"
environment = "production"
aws_region  = "us-east-1"

availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c"
]

cors_allowed_origins = [
  "https://quant.app",
  "https://*.quant.app"
]

alert_email = ""
