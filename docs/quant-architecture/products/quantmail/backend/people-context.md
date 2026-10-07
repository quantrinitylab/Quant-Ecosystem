# QuantMail Backend — People Context

## Ownership

Contacts owns:
- person record
- contact methods
- names
- organization data
- user-defined contact labels
- contact relationships

QuantMail owns:
- participant references on messages
- local sender/recipient identity representation
- mail interaction metadata

A context resolver joins the two without copying full contact records.

## Resolution

Input:
- mailbox user
- participant identity
- email address / provider identity

Resolver:
1. normalize identity
2. check authorized Contacts scope
3. resolve canonical contact
4. attach safe relationship projection
5. cache bounded summary

## Cache

Cache may contain:
- contact ID
- display name
- avatar reference
- organization
- permission scope
- source version

TTL and invalidation follow Contacts events.

## Failure isolation

If Contacts is unavailable:
- render mail identity from authoritative message data
- show degraded context
- do not block thread opening or compose
