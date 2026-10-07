# M26 Security — Economy

- Never store raw card/bank credentials.
- Treat payment-provider callbacks as untrusted until authenticated.
- Idempotency is mandatory for money/credit mutations.
- Separate product authorization from economic authorization.
- Protect invoices and payment metadata with least-privilege access.
- Credit adjustments require elevated role and reason.
- Refunds require policy-controlled authorization.
- Financial audit records are append-only.
- Quanty cannot approve its own high-risk economic action.
- Client-visible balances are derived views, never write targets.
- Fraud models cannot silently become policy without explicit versioned policy configuration.
