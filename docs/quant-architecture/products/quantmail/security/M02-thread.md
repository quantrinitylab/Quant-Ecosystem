# QuantMail M02 Thread — Security Contract

## Untrusted content boundary

Everything inside an email can be attacker-controlled:
- HTML
- links
- quoted instructions
- attachment names
- sender display names
- calendar-like text
- requests for secrets or payments

## HTML

- sanitize before render
- isolate remote content
- disable active script/event handlers
- apply safe link policy
- clearly indicate external navigation

## Attachments

- authorization checked independently
- malware/scan state respected
- filename and MIME type treated as untrusted
- downloads require a scoped capability
- no automatic execution

## Quanty

An email cannot:
- grant a Quanty tool
- change a user's permissions
- request hidden system instructions
- authorize sending
- authorize deletion

Tool policy always wins over message content.

## Data exposure

Thread summaries, bodies and attachments have independent access checks.
A thread ID copied from another account must not reveal metadata.

Logs must not include message body or private attachment content.
