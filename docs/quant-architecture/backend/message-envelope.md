# Message Envelope

Required:
- messageId
- productId
- purpose
- recipient scope
- channel
- template/version
- locale
- priority
- consent basis
- idempotency key
- correlation ID
- expiration

Payload is classified and minimized.

The envelope is immutable after dispatch preparation except for explicitly versioned retry metadata.
