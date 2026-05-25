project     = "quant"
environment = "staging"
aws_region  = "us-east-1"

availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c"
]

cors_allowed_origins = [
  "https://staging.quant.app",
  "https://*.staging.quant.app"
]

alert_email = ""
