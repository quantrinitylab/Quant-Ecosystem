# @quant/smtp-submission

RFC 6409 authenticated SMTP submission daemon listening on port 587 (and port 465 for legacy SMTPS).

## Architecture

- **STARTTLS Negotiation**: Enforces TLS 1.3 encryption on connection.
- **SASL Authentication**: Authenticates external clients (Apple Mail, Thunderbird, Outlook) via `PLAIN`, `LOGIN`, and `XOAUTH2` against `prisma.user` using `argon2.verify`.
- **RFC 6409 Compliance**: Injects `Received: from [client] by submission.quantmail.in with ESMTPSA...` headers and enforces strict sender authorization (envelope `MAIL FROM` must match authenticated user account or verified alias).
- **Outbound Enqueue**: Pushes validated outgoing mail to BullMQ `outbound-delivery` queue for DKIM signing and MTA delivery.
