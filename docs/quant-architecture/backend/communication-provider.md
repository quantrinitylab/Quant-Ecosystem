# Communication Provider Abstraction

Provider adapters expose normalized:
- send
- status
- suppress
- unsubscribe
- health
- quota

Provider-specific APIs never leak into product code.

Provider selection is policy-controlled and persisted for a message once delivery begins.
