# M04 — Universal Search

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Purpose

Search is a cross-domain discovery surface, not a second source of truth.

Default domains:
- Mail
- People
- Calendar
- Drive
- QuantGit

QuantMail owns mail search semantics. Other products own their entity truth and expose search adapters.

## User outcome

A user can type one query and rapidly discover the right object, then open it in its owning product.

## Search modes

- All
- Mail
- People
- Calendar
- Drive
- Git

Optional filters:
- unread
- starred
- sender
- date range
- file type
- event date
- repository

## Result contract

Every result has:
- resultId
- domain
- objectType
- title
- primaryText
- secondaryText
- timestamp where applicable
- permission-aware action URL
- matchedFields
- rankingScore bucket, never raw score
- sourceVersion

The UI never assumes identical fields across domains.

## State

- idle
- searching
- results
- no results
- partial results
- rate limited
- unauthorized/degraded domain
- offline

Partial results must identify which domain failed.

## Query behavior

- debounce interactive typing
- submit immediately on explicit search
- preserve recent query locally according to privacy policy
- support keyboard navigation
- highlight matched terms safely

Do not send every keystroke to every backend without debounce/coalescing.

## Navigation

Selecting a result opens its owning product route.
Search state can persist in history so Back returns to the same results.

## Safety

Search must respect the same authorization as direct object access.
Search result leakage is a security bug even when opening the object would later fail.
