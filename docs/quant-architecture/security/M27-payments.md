# M27 Security — Payments

- Provider credentials use secret/workload identity controls.
- Payment callbacks require cryptographic verification and replay protection.
- Financial operations require least privilege and step-up/dual control where configured.
- Client state never authorizes financial effects.
- UNKNOWN outcomes cannot be blindly retried.
- Payment and invoice data use data minimization and access logging.
- Provider adapters are isolated from product code.
- Fraud decisions are versioned policy outcomes, not opaque model commands.
- Finance exports are scoped, audited, and time-limited.
