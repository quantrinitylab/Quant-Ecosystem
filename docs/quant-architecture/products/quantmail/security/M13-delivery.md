# M13 — Delivery Security

## Threats

- unauthorized outbound mail
- spoofed delivery callbacks
- credential/key leakage
- replayed send
- duplicate delivery
- recipient enumeration
- SMTP abuse
- domain takeover
- malicious inbound content

## Controls

- authenticated send preparation
- short-lived confirmation
- idempotency
- signed/authenticated provider callbacks
- secret-manager boundary
- DKIM key isolation
- recipient/rate controls
- TLS policy
- inbound content isolation
- audit sensitive delivery operations

Provider events are untrusted until authenticated and validated.
