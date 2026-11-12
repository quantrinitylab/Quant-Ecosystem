# Stalwart Mail Server Integration

This directory contains configuration and operational documentation for the **Stalwart Mail Server** open-source mail engine in the Quant Ecosystem.

## Overview

Stalwart Mail Server is an open-source, all-in-one mail server written in Rust, providing native support for modern internet mail protocols:
- **JMAP (JSON Meta Application Protocol)**: RFC 8620 (Core), RFC 8621 (Mail), RFC 8622 (Submission)
- **IMAP4rev2**: RFC 9051 with IDLE, COMPRESS, and CONDSTORE extensions
- **SMTP & Submission**: RFC 5321 (MTA), RFC 6409 (Client Submission on port 587/465)
- **Sieve Scripting**: RFC 5228 for automated rules and vacation responders
- **DKIM / SPF / DMARC / ARC**: Automated cryptographic signature and validation
- **Distributed Storage**: PostgreSQL for directory/metadata + S3/Cloudflare R2 for raw MIME/blob storage

## Architecture & Topology

```
                  +-------------------------------------------------+
                  |                QuantMail Backend                |
                  |  (IMailEngineAdapter: StalwartMailEngineAdapter)|
                  +-------------------------------------------------+
                         |                          |
               JMAP (RFC 8620/8621)         REST Management (/api)
               HTTP Port 8080               Port 8081 / Admin Token
                         v                          v
                  +-------------------------------------------------+
                  |               Stalwart Mail Server              |
                  |                (Rust Mail Engine)               |
                  +-------------------------------------------------+
                    /             |              \             \
                   v              v               v             v
             PostgreSQL       S3 / R2 Blobs     SMTP/SUB      IMAP4rev2
            (Directory/      (Object Storage     (587/465/    (143/993)
             Metadata)       quantmail-blobs)       25)
```

## Protocol Specifications

### JMAP (RFC 8620 / 8621 / 8622)
- Discovery URL: `/.well-known/jmap` (returns endpoint map, capabilities, account list)
- API endpoint: `/jmap`
- Method invocation: `Email/set` creates drafts, `EmailSubmission/set` transmits atomically

### Management REST API
- Base path: `/api/principal`
- Provisioning endpoint: `POST /api/principal`
- Authentication: `Bearer ${STALWART_ADMIN_SECRET}`
- JSON schema:
  ```json
  {
    "type": "individual",
    "name": "username",
    "emails": ["user@quantmail.app"],
    "secrets": ["password_or_hash"],
    "quota": 10737418240,
    "roles": ["user"]
  }
  ```

### SMTP Submission Fallback
When JMAP endpoints are temporarily unreachable, `StalwartMailEngineAdapter` seamlessly falls back to RFC 6409 SMTP submission on port 587/465 via `NetSmtpTransport` with `AUTH PLAIN`.

## Configuration (`config.toml`)

The configuration file `config.toml` configures Stalwart's server parameters using environment variables:
- `STALWART_HOSTNAME`: FQDN for the mail server (e.g. `mail.quantmail.internal`)
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`: PostgreSQL connection
- `STALWART_S3_BUCKET`, `STALWART_S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: S3/R2 storage
- `STALWART_ADMIN_SECRET`: Secret token for REST management API
- `MAIL_SENDER_DOMAIN`, `DKIM_SELECTOR`, `DKIM_PRIVATE_KEY_PATH`: Outbound DKIM signing

## QuantMail Adapter Configuration

To enable Stalwart in QuantMail backend, configure the following environment variables:
```bash
MAIL_ENGINE_ADAPTER=stalwart
STALWART_URL=http://stalwart:8080
STALWART_ADMIN_SECRET=secret-token-here
STALWART_SMTP_HOST=stalwart
STALWART_SMTP_PORT=587
STALWART_FALLBACK_TO_SMTP=true
```

When `MAIL_ENGINE_ADAPTER` is omitted or set to `ses`, QuantMail defaults to AWS SES, preserving backward compatibility.
