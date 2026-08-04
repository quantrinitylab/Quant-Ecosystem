# Fail-closed production guard.
#
# The existing production root is intentionally blocked until issue #129's
# single-region redesign is complete and reviewed. This guard must not be
# removed or enabled merely to obtain a successful apply.

data "aws_caller_identity" "current" {}

variable "expected_aws_account_id" {
  type        = string
  description = "Only AWS account permitted for the production environment."
  default     = "266176113726"

  validation {
    condition     = var.expected_aws_account_id == "266176113726"
    error_message = "Production is restricted to AWS account 266176113726; the closed legacy account must never be used."
  }
}

variable "application_domain" {
  type        = string
  description = "Canonical public application domain."
  default     = "quantrinity.in"

  validation {
    condition     = var.application_domain == "quantrinity.in"
    error_message = "The production application domain must be quantrinity.in."
  }
}

variable "public_dns_provider" {
  type        = string
  description = "Authoritative public DNS provider."
  default     = "cloudflare"

  validation {
    condition     = var.public_dns_provider == "cloudflare"
    error_message = "Cloudflare owns the public DNS boundary; this root must not create Route53 application cutover records."
  }
}

variable "enable_multi_region" {
  type        = bool
  description = "Multi-region infrastructure is opt-in only after separate capacity, cost, and recovery review."
  default     = false

  validation {
    condition     = var.enable_multi_region == false
    error_message = "Multi-region production is not approved. Keep enable_multi_region false."
  }
}

variable "production_root_redesigned" {
  type        = bool
  description = "Fail-closed acknowledgement set only after issue #129's unsafe legacy topology has been replaced and reviewed."
  default     = false
}

resource "terraform_data" "production_safety_guard" {
  input = {
    actual_account_id   = data.aws_caller_identity.current.account_id
    expected_account_id = var.expected_aws_account_id
    application_domain  = var.application_domain
    public_dns_provider = var.public_dns_provider
    multi_region        = var.enable_multi_region
  }

  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.expected_aws_account_id
      error_message = "Refusing production plan/apply outside AWS account 266176113726."
    }

    precondition {
      condition     = var.application_domain == "quantrinity.in"
      error_message = "Refusing production plan/apply with a stale or unapproved application domain."
    }

    precondition {
      condition     = var.public_dns_provider == "cloudflare"
      error_message = "Refusing production plan/apply unless Cloudflare remains the public DNS authority."
    }

    precondition {
      condition     = var.enable_multi_region == false
      error_message = "Refusing accidental multi-region production provisioning."
    }

    precondition {
      condition     = var.production_root_redesigned
      error_message = "BLOCKED: this legacy production Terraform root is unsafe. Complete and review issue #129's single-region redesign before planning or applying it."
    }
  }
}
