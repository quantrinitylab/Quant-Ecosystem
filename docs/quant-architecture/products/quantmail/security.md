# QuantMail Security — Inbox

## Trust boundaries

1. identity/authentication
2. mailbox authorization
3. application API
4. message content
5. search/indexing
6. Quanty context/tooling
7. external mail providers
8. client native bridge

## Core rules

- every thread access is authorized server-side
- IDs are opaque and non-sequential where appropriate
- mailbox data is tenant/user scoped
- delegated access is explicit
- cached private mail is cleared on logout/session switch
- sensitive operations are audited
- provider credentials never reach renderer/client UI

## Content security

Treat mail content as untrusted input:
- sanitize HTML
- isolate remote content
- block unsafe active content
- protect against tracking/pixel abuse according to user policy
- validate attachments before display/download
- never execute message-provided code

## Quanty security

Quanty access requires:
- authenticated user
- tool capability
- data-purpose check
- minimum required context
- risk policy
- audit trail for sensitive actions

Prompt/content injection inside mail must not override tool policy.

## Logging

Never log:
- full bodies
- access tokens
- passwords
- SMTP secrets
- private attachments

Use correlation IDs for troubleshooting.
