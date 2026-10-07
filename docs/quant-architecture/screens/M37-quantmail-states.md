# M37 — QuantMail UI State Matrix

## Inbox/list
Loading, first-use empty, filtered empty, no-results, stale/cache, reconnecting, partial context, permission error, mailbox unavailable, bulk-action pending, bulk-action partial failure.

## Thread
Loading shell, message loading, attachment loading, security pending, sanitized-content warning, sender unresolved, partial thread, delivery pending, action pending, action failed, action verified.

## Compose
New, autosaving, saved, attachment uploading, validation error, send preparation, approval required, sending, submitted/pending reconciliation, sent verified, send failed with recoverable draft.

## Search
Searching, partial domain results, no results, malformed query, permission-filtered results, index unavailable, stale results, result opened/deep-link expired.

## Security
Warning, quarantine, blocked, released by authorized policy, scanner unavailable. Security state must never be represented only by color.

## Universal rule
Every asynchronous state must tell the user what happened, what is happening, what they can do now, and whether the state is authoritative or pending.
