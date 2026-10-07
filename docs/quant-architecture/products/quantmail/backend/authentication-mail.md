# M13 — Mail Authentication

## Domain controls

Support operational state for:
- SPF
- DKIM
- DMARC
- MX
- TLS

## Ownership

DNS verification is platform infrastructure.
Mail owns mail-domain requirements and interpretation.
Secret infrastructure owns private signing keys.

## DKIM

Private keys never enter ordinary application logs, API responses or admin tables.

Signing occurs in the controlled outbound boundary.

## DMARC

Inbound authentication results are recorded as normalized signals.

Policy enforcement is explicit and versioned.
