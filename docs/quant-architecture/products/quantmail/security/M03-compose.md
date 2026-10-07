# QuantMail M03 Compose — Security Contract

## Recipient trust

Before send:
- normalize addresses
- show external-recipient boundary
- prevent hidden recipient injection
- enforce mailbox ownership

## Draft isolation

A draft ID is never an authorization credential.
Every read/write validates the authenticated principal and mailbox scope.

## Attachments

- scan before send
- verify ownership/capability
- prevent path traversal
- sanitize filename display
- never execute automatically

## Send boundary

Only outbound mail service can submit to providers.
A UI action or Quanty tool call cannot directly call provider credentials.

## Audit

Audit high-risk events:
- send
- bulk recipient changes
- policy override
- delegated mailbox send

Never log body contents or provider secrets.
