# Quant Memory Privacy Architecture

## Principle

Personalization must not become surveillance.

## Controls

- purpose-bound retrieval
- least-privilege agent capabilities
- sensitivity-aware filtering
- user controls
- source-level permissions
- retention/expiry
- provenance
- audit trail
- deletion propagation
- restricted-memory classes

## Sensitive inference

Potential mood, health, sexuality, religion, politics, finances, or similarly sensitive characteristics must not be treated as ordinary preference memory. The system should minimize collection and avoid durable storage unless a clear authorized purpose and policy supports it.

## Feed personalization

Recommendation systems can use bounded behavioral/context signals without exposing sensitive inferred labels to users or downstream products as facts. A feed should personalize content, not diagnose the person.

## Quanty

Quanty cannot use memory to bypass a product's authorization boundary. Memory retrieval is always subordinate to source permissions and current policy.
