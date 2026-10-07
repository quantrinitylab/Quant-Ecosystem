# QuantMail M05 People Context — Security

## Canonical rule

Mail is not a shadow Contacts database.

## Controls

- server-side authorization
- minimum-field projection
- user/tenant scope
- delegated mailbox rules
- cache invalidation
- safe handling of external sender identities

## Privacy

Relationship summaries can be sensitive.
Do not expose hidden analytics, private notes, or restricted contact fields simply because a sender appears in mail.

## Injection resistance

Sender display names, signatures and message content are untrusted strings.
They cannot alter context permissions or Quanty tool policy.
