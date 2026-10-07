# QuantMail Backend — People Context Events

Contacts emits canonical events consumed by Mail context projection.

Examples:
- contacts.contact.created.v1
- contacts.contact.updated.v1
- contacts.contact.deleted.v1
- contacts.identity.linked.v1

Mail maintains only the minimum projection required for fast participant resolution.

## Invalidation

On relevant Contacts events:
1. identify affected identity/contact
2. invalidate or refresh Mail context cache
3. emit internal projection update when required

A stale context must never override current security/authorization checks.

## Privacy

Events delivered to Mail should contain only data approved for cross-product context use.
