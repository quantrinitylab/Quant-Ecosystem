# QuantMail M08 Quanty — Security

## Threat model
- prompt injection in email bodies
- malicious attachments
- tool chaining abuse
- over-broad permissions
- stale context
- duplicate/replayed mutations
- approval spoofing
- confused-deputy attacks

## Controls

Least privilege:
Quanty receives only capabilities required for the current task.

Untrusted content:
Email content is data, never authority.

Approval:
High-risk operations require explicit approval.

Verification:
Every mutation has a deterministic verification strategy.

Idempotency:
Retryable tools define idempotency behavior.

Expiry:
Approval and high-risk execution capabilities expire.

Audit:
Record actor, agent identity, tool, target class, policy decision, approval, result and verification.

Never log secrets or unnecessary message content.

Agent systems should use least privilege, explicit tool control and human approval for consequential actions. 
