# M23 — Public API Domain

## Ownership
Developer Platform owns app registrations, API credentials, public API lifecycle, quotas, developer documentation metadata, webhook subscriptions, and developer-facing audit records.

Product domains own the actual resources exposed through APIs.

## API resource model
Every public resource maps to an owned domain resource through a stable public identifier. Internal database IDs are never required to be public identifiers.

## Contract
Each operation defines:
- method/path
- request schema
- response schema
- authorization scopes
- idempotency behavior
- pagination
- rate-limit class
- error contract
- version
