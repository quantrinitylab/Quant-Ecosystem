# QuantMail M08 Quanty — Testing

## Unit
- state machine
- tool risk classification
- approval expiry
- idempotency
- cancellation
- verification result mapping

## Integration
- tool authorization
- Mail command boundary
- Calendar boundary
- Drive boundary
- Contacts boundary
- event tracing
- reconnect/recovery

## Adversarial
- prompt injection in email
- malicious attachment instructions
- fake approval message
- tool parameter hallucination
- cross-user resource ID
- stale context
- replayed tool call
- unauthorized tool discovery

## E2E
1. ask read-only question
2. run multi-step read task
3. request draft
4. approve low-risk mutation
5. require high-risk approval
6. deny approval
7. simulate tool failure
8. reconnect during execution
9. verify result
10. inspect memory decision

## Completion

Agent is never marked complete without persisted verified state.
