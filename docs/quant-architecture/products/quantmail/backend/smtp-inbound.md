# M13 — SMTP Inbound

## Receive pipeline

SMTP connection
-> transport/TLS policy
-> domain/recipient validation
-> connection/rate checks
-> SPF/DKIM/DMARC evaluation
-> spam/security classification
-> accepted-message persistence
-> attachment scanning
-> thread correlation
-> inbox event

## Trust

Authentication results are signals, not proof that message content is safe.

Inbound email content remains untrusted.

## Rejection

Reject at SMTP level only when policy permits and the rejection reason is safe.

Accepted mail must not be lost because downstream enrichment is unavailable.
