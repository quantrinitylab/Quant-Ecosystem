# QuantMail M06 Calendar Context — Security

## Boundary

Calendar data is independently permissioned.

A message containing:
- event IDs
- attendee addresses
- meeting links
- scheduling instructions

does not grant Calendar access.

## Controls

- authorization on every event read
- capability-scoped RSVP/create operations
- tenant/user scope
- timezone-safe rendering
- untrusted meeting links
- audit sensitive calendar mutations

## Injection defense

Calendar-like instructions inside email are untrusted content.
They cannot invoke Calendar tools without explicit policy authorization.
