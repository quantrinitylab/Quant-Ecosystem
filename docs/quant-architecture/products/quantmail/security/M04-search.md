# QuantMail M04 Search — Security

## Search is an access-controlled read

A search engine is not an authorization system.
The application must enforce permission scope independently.

## Required controls

- authenticated identity
- tenant/user scope
- delegated mailbox scope
- object-level capability where required
- mandatory permission filters
- safe snippets

## Snippets

Snippets may expose only content the user is allowed to see.
Do not return hidden text merely because it matched.

## Query privacy

Search queries can reveal sensitive intent.
Telemetry should minimize or hash/query-classify content according to privacy policy.

## Audit

Sensitive search actions may be audited by policy, but full query text should not be broadly logged.
