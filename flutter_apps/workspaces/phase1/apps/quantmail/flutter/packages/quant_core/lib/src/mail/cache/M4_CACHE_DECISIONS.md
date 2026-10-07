# M4 cache decisions (drift persistence layer)

Decisions made while implementing the M4 drift persistence layer
(`lib/src/mail/cache/`). Recorded so later shifts and other workers don't
re-litigate them.

## D1 — `clear()` also clears the sync cursor
Both `DriftMailCache.clear()` and `DriftThreadCache.clear()` truncate all
mail tables (`CachedThreads`, `CachedEmails`, `EmailPages`, `ThreadPages`)
**and** `SyncState` (the `emails_since` cursor). Rationale: `clear()` is the
sign-out / account-switch path; a cursor from the previous account would
corrupt the next account's delta sync. If a "clear data but keep sync state"
operation is ever needed, add a separate `clearMailOnly()` — do not weaken
`clear()`.

## D2 — Thread pages use a separate membership table
`ThreadPages(pageKey PK, threadIdsJson, hasMore)` stores only the ordered
thread ids per page; payloads live in `CachedThreads` keyed by thread id.
Alternatives considered: (a) one JSON blob per page (simple, but every
upsert/delete rewrites whole pages and drift between pages is possible);
(b) a join table with one row per (pageKey, threadId) (normalized, but more
rows/queries for no real benefit at this scale). The membership table keeps
upserts O(1) per thread and deletes consistent across all cached pages.

## D3 — `writePage` also upserts individual emails
`DriftMailCache.writePage()` writes the page envelope to `EmailPages`
**and** upserts every email into `CachedEmails`. This makes thread views and
single-email reads work offline even after their list page is evicted. Cost:
duplicate JSON storage per email (page blob + row); acceptable for Phase 1.

## D4 — Missing thread rows are skipped on page read
If a thread id in a page membership has no `CachedThreads` row (deleted
since the page was cached), `readThreadPage` skips it instead of failing the
whole page. Rationale: a partially-stale cached page is more useful offline
than an error; the next online fetch repairs the membership.

## D5 — Page key formats
- Email pages: `p:<page>:<pageSize>:<folderId ?? folderType.name ?? 'inbox'>`
- Thread pages: `tp:<page>:<pageSize>:<folderId ?? 'inbox'>`
The `tp:` prefix keeps the two namespaces from colliding in case the tables
are ever unified. `folderType.name` (not `wireName`) is used so keys stay
stable and human-readable.

## D6 — Sync cursor key
`SyncState` key is `emails_since` (constant `DriftThreadCache.syncCursorKey`),
shared by the M2 changes-sync story (`GET /emails/changes?since=`).

## D7 — Schema v1 ships 5 tables
`ThreadPages` is part of schemaVersion 1 from the start (not a later
migration), so no migration code exists yet. Any future schema change must
bump `schemaVersion` and add a `MigrationStep` in `MailDatabase.migration`.
