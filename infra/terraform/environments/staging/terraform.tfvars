project     = "quant"
environment = "staging"
aws_region  = "us-east-1"

availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c"
]

cors_allowed_origins = [
  "https://staging.quantrinity.in",
  "https://staging.quantmail.quantrinity.in",
  "https://staging.quantchat.quantrinity.in",
  "https://staging.quantai.quantrinity.in"
]

alert_email = ""
