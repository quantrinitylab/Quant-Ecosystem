# M23 — API Scopes & Permissions

## Scope design
Scopes map to capabilities, not internal tables.

Examples:
- mail.read
- mail.send
- mail.modify
- contacts.read
- calendar.read
- drive.read
- search.read

High-risk operations use narrower scopes and additional policy checks.

## Rules
Read and write scopes are separated. Administrative scopes are distinct from user scopes. Cross-domain scopes require explicit product review.

Scope names are stable public contracts; internal role changes must not silently change their meaning.
