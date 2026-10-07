# QuantMail — Backend Deep Design

Modules: identity, mailbox, message, thread, compose, search, contacts, calendar, drive, docs, git, notifications, quanty and admin.

## Receive lifecycle
SMTP/IMAP/API → validation → spam/malware policy → persist → thread projection → outbox event → search indexing → notification → permitted memory/graph signal.

## Send lifecycle
draft → recipient validation → policy/DLP → quota/rate checks → send intent → SMTP submission → delivery result → authoritative message state → event/audit.

The UI must never declare a message sent before authoritative send state is known.

## Search
Combine mailbox indexes, sender/recipient/date/attachment filters and permitted cross-product projections. Permission filtering occurs before display.

## Calendar/Drive/Git
Calendar owns events and availability. Drive owns files and revisions. Git owns Git objects/refs/issues/PRs/CI. QuantMail hosts their surfaces but does not become a second source of truth.

## Failure behavior
SMTP outage preserves drafts. Search outage does not break inbox. Quanty outage does not break mail. Drive outage degrades attachment browsing without breaking inbox.

Every route validates session/tenant, authorizes resource/action, validates input, emits required audit/event data and returns typed errors.