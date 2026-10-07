# ==============================================================================
# Cloudflare DNS Records — QuantMail Enterprise Infrastructure
# RFC 6764 CalDAV and CardDAV Auto-Discovery Service Records (SRV)
# ==============================================================================

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare Zone ID for quantmail.in"
  default     = "023e105f4ecef8ad9ca31a8372d0c353"
}

variable "domain_name" {
  type        = string
  description = "Primary domain for QuantMail service"
  default     = "quantmail.in"
}

variable "mail_server_target" {
  type        = string
  description = "Target hostname for mail and DAV services"
  default     = "mail.quantmail.in"
}

# RFC 6764 CalDAV over TLS SRV record for automatic client discovery (macOS, iOS, DAVx5)
resource "cloudflare_record" "caldavs_srv" {
  zone_id = var.cloudflare_zone_id
  name    = "_caldavs._tcp.${var.domain_name}"
  type    = "SRV"

  data = {
    service  = "_caldavs"
    proto    = "_tcp"
    name     = var.domain_name
    priority = 0
    weight   = 1
    port     = 443
    target   = var.mail_server_target
  }

  comment = "RFC 6764 CalDAV TLS service record for automatic calendar discovery"
}

# RFC 6764 CardDAV over TLS SRV record for automatic client discovery (macOS, iOS, DAVx5)
resource "cloudflare_record" "carddavs_srv" {
  zone_id = var.cloudflare_zone_id
  name    = "_carddavs._tcp.${var.domain_name}"
  type    = "SRV"

  data = {
    service  = "_carddavs"
    proto    = "_tcp"
    name     = var.domain_name
    priority = 0
    weight   = 1
    port     = 443
    target   = var.mail_server_target
  }

  comment = "RFC 6764 CardDAV TLS service record for automatic address book discovery"
}
