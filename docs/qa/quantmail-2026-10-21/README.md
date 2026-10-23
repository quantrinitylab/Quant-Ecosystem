# QuantMail — End‑to‑End User QA (2026‑10‑21)

A full "behave like a real user" pass on **QuantMail**: the app was built and run
locally from the production artifact, a brand‑new account was created and signed
in, the core journeys were exercised (mail send/receive, calendar, contacts,
drive, search, AI), the whole thing was put under load, and the real web UI was
driven in a headless browser. This document is the result.

> **Scope note:** testing was done against the real backend bundle
> (`apps/quantmail/backend/dist/server.mjs`, the same artifact the production
> image runs) + the real Next.js frontend (`next dev`), backed by a real
> PostgreSQL 16 + pgvector and Redis 7. No app code was mocked. The app was run
> with `NODE_ENV=staging` (see Finding F8 for why `development` can't boot).

---

## TL;DR

**The app works end‑to‑end** — a new user can sign up, sign in, send/receive mail
to another user, use calendar/contacts/drive/search, and the UI renders correctly
(see [screenshots](#screenshots)). Auth, idempotency, tenant isolation and
graceful degradation are all solid, and the server stayed healthy under load
(**0 × 5xx across ~115k requests**, ~9.6k RPS on health, 450–890 RPS on data).

**But there are real problems a user / operator will hit:**

| # | Severity | Problem (one line) |
|---|----------|--------------------|
| **F1** | 🔴 High | A `prisma migrate deploy` left migration `0106` in a **failed** state → **P3009 blocks all future deploys** and the `quanty_*` tables are missing (Quanty durable‑tasks DB layer absent). No CI runs a fresh `migrate deploy`, so this is uncaught. |
| **F2** | 🔴 High | **Email search's fast path is permanently broken** — it selects `emails."isArchived"`, a column that does not exist. Every search throws and is silently swallowed; under load that was **13,331 DB errors for 13,331 searches**. |
| **F3** | 🟠 Med‑High | **Document search's fast path** selects `"snapshotStorageKey"` but the real column is `snapshot_storage_key` → same silent‑fallback bug. |
| **F4** | 🟠 Med | **Login lockout under load / behind the proxy**: login is 5/min keyed by IP with no `trustProxy`; behind the Next proxy + Cloudflare the *entire* userbase shares one bucket. 30 concurrent logins → **5 OK, 25 × 429**. |
| **F5** | 🟡 Med | **Emailing yourself** (or being in your own To/CC) silently drops the inbox copy (`P2002` on `(userId, messageId)`), logged as "internal delivery failure" while the API returns `201`. |
| **F6** | 🟡 Low‑Med | **Every calendar event create logs a DB error** (`Unknown argument calendarId`) before a fallback saves it correctly — noise + a wasted failed query per event. |
| **F7** | 🟡 Low‑Med | **Inbox list is the slowest hot path** — p95 **231 ms** @ conc 60 (vs 84 ms for search); likely Prisma pool‑bound + a heavy default query. |
| **F8** | 🟡 Med (DX) | **There is no working way to run the backend in dev** — the `dev:backend` script is broken two ways, and the bundle can't boot under `NODE_ENV=development`. |

Full detail, evidence and suggested fixes below.

---

## How this was tested (method)

1. **Built infra from source** (no Docker in the sandbox): PostgreSQL 16.15 + `pgvector` 0.8.7 + `pg_trgm` + `pgcrypto`, Redis 7.2.16.
2. `pnpm install` → `prisma generate` → `prisma migrate deploy` (115 migrations).
3. Built the backend exactly like the prod image: `node infra/scripts/build-backend.mjs apps/quantmail backend/server.ts apps/quantmail/backend/dist/server.mjs`.
4. Ran the backend (`:3010`) + `next dev` (`:3000`) against real Postgres/Redis.
5. **Functional suite** (`harness/functional-test.mjs`): 47 assertions across sign‑up, login, session, mail A→B, idempotency, folders/labels, contacts, calendar, drive, search, AI, refresh/logout, IDOR, rate‑limit, 404.
6. **Load suite** (`harness/load-test.mjs`): read‑heavy (inbox + search), write (compose+send), health, and a login rate‑limit probe, with p50/p95/p99 + error‑rate.
7. **Targeted bug verification** (`harness/verify-bugs.mjs`) + direct SQL introspection.
8. **Real browser** (headless Chromium): signed in through the actual login form and captured the inbox + calendar + contacts + drive screens.

Everything needed to reproduce is in [`harness/`](./harness) with a
[HOW‑TO](./harness/HOW-TO.md). Raw machine output is in [`results/`](./results).

---

## Findings

### F1 — 🔴 `migrate deploy` can leave the DB with a failed migration that blocks all future deploys (and silently removes a feature)

**What happened.** After `prisma migrate deploy` on a fresh database, migration
`0106_quanty_task_durability` ended up in a **failed** state (`applied_steps_count = 0`,
`finished_at = NULL`). Its three tables — `quanty_tasks`, `quanty_task_events`,
`quanty_approval_records` — were therefore never created.

**Evidence.**
```
$ prisma migrate status
Following migration have failed:
0106_quanty_task_durability
$ prisma migrate deploy        # re-run
Error: P3009  migrate found failed migrations in the target database, new
migrations will not be applied. The `0106_quanty_task_durability` migration
started at 2026-10-21 10:35:36 failed
```
At backend startup the app logs (non‑fatal, swallowed):
```
prisma:error  Invalid `prisma.quantyTask.findMany()` invocation:
The table `public.quanty_tasks` does not exist in the current database.
```
The migration SQL itself is **valid** — replaying `0106/migration.sql` in a
transaction applies cleanly (all 11 statements succeed). So the failure was a
*mid‑migration interruption*, not bad SQL.

**Why it matters.**
- **Deploys are now blocked** (P3009): until someone runs `prisma migrate resolve`,
  *no* further migration can be applied to that database.
- **A shipped feature is silently broken**: the Quanty durable‑task layer (added by
  PR #1443, "qm‑quanty‑task‑durability") has no tables, so `quantyTask`/
  `quantyTaskEvent`/`quantyApprovalRecord` queries fail. The app boots anyway and
  swallows the errors, so the breakage is invisible until a user hits that feature.
- **CI can't catch this class of issue**: no workflow runs a full `prisma migrate
  deploy` against an empty Postgres (confirmed across `ci.yml`, `quantmail-ci.yml`,
  `auth-security-validate.yml`, `quantmail-browser-auth-validate.yml` — only the
  `memory-shadow-postgres` job touches Postgres, and it applies a *single* migration
  file, not the whole chain).

**Suggested fixes.**
1. Add a CI job that spins up `postgres:16` + pgvector and runs the **entire**
   `prisma migrate deploy` on an empty DB (then `prisma migrate status` must be
   clean). This alone would have caught F1.
2. Make deploys resilient: wrap `migrate deploy` so a failed/incomplete migration
   is surfaced loudly (fail the deploy) rather than leaving a half‑state, and
   document the `migrate resolve` recovery step in the runbook.
3. Consider a lightweight startup readiness check that asserts the expected tables
   exist and fails `/readyz` (instead of only logging `prisma:error`) so monitoring
   notices a missing migration.

*(Verified: applying `0106` + `prisma migrate resolve --applied 0106_quanty_task_durability`
restores `migrate status` to "up to date" and the Quanty tables appear — confirming
the only problem was the missing/failed migration.)*

---

### F2 — 🔴 Email search "fast path" selects a non‑existent column → every search errors and silently falls back

**Location:** `apps/quantmail/backend/services/search-query.service.ts:484`

```ts
const dataSql = `SELECT id, "userId", ..., "isRead", "isStarred", "isArchived",
  "isDraft", "isTrash", "isSpam", ... FROM emails WHERE ${whereSql} ...`;
...
} catch {
  // Fall through to Prisma query builder if raw query fails on test double
}
```

The `emails` table has **no `isArchived` column** (it only exists on
`Conversation`, `AISession`, `Repository`; `formatEmailRecord` *derives*
`isArchived`). So the raw query always throws:

```
prisma:error  Invalid `prisma.$queryRawUnsafe()` invocation:
Raw query failed. Code: `42703`. Message: `column "isArchived" does not exist`
```

**Why it matters.**
- The optimized path is **dead** — every `/search/emails` and `/search/all` call
  falls through to the Prisma query builder. The GIN/trigram indexes added in
  migration `0067_add_search_indexes_and_snapshot_key` are effectively unused.
- The comment claims the `catch` is for a "test double", which **masks a real
  production bug** as if it were test‑only.
- **Error‑log / APM flood**: under the read‑load phase this produced **13,331
  `column "isArchived" does not exist` errors for 13,331 searches** (1:1). In
  production this spams Sentry/error‑monitoring and buries real errors.

**Suggested fix.** Remove `"isArchived"` from the `SELECT` (and derive it in
`formatEmailRecord`, as the read path already does), or add the column if it is
truly intended. Replace the bare `catch {}` with one that logs *once* / only
tolerates the test‑double case, so a real SQL error is never silently swallowed.

---

### F3 — 🟠 Document search "fast path" uses the Prisma field name instead of the DB column

**Location:** `apps/quantmail/backend/services/search-query.service.ts:655`

```ts
`SELECT id, title, "userId", "createdAt", "updatedAt", "snapshotStorageKey" ...`
```

The `Document` model maps `snapshotStorageKey` → **`snapshot_storage_key`**
(`schema.prisma:4415  snapshotStorageKey String? @map("snapshot_storage_key")`).
Raw SQL must use the DB column name, so this throws
`column "snapshotStorageKey" does not exist` and silently falls back, exactly like
F2. Fix: use `"snapshot_storage_key"` (optionally `AS "snapshotStorageKey"`).

---

### F4 — 🟠 Login lockout under load: per‑IP rate limit + no `trustProxy` → the whole userbase shares one bucket

**Evidence (load probe — 30 concurrent logins, valid credentials):**
```
POST /auth/login  codes = { "200": 5, "429": 25 }
```
Login is capped at **5/min**, keyed by `request.ip`, and the server sets **no
`trustProxy`**. In production the browser talks to the **Next.js proxy**
(`src/app/api/_lib/proxy.ts`) and Cloudflare, so every request arrives from a small
set of proxy IPs → **all users share the same 5/min login bucket** (and the 5/min
register bucket, and the 20/min refresh bucket — and *every page load refreshes*).

**Why it matters.** A post‑deploy reconnect, an outage recovery, or just a busy
minute will 429 legitimate logins for everyone — a self‑inflicted availability
problem that looks like an outage. Shared‑NAT corporate users would also collide.

**Suggested fixes.** Enable Fastify `trustProxy` (bounded to the known proxy/
Cloudflare ranges) and key auth rate limits on the real client IP (and/or the
submitted email), not the socket IP. Re‑evaluate the 5/min global‑by‑IP ceiling.

---

### F5 — 🟡 Sending mail to yourself silently drops the inbox copy

Internal delivery creates each recipient's mailbox row with the **same**
`messageId` as the sender's Sent copy (`messageId = <emailId@quantmail.in>`,
`email.service.ts:722`). When the sender is also a recipient (self‑send, or you're
in your own To/CC), the recipient row collides with the Sent row on the unique
`(userId, messageId)`:

```
prisma:error  Invalid `prisma.email.create()` invocation:
Unique constraint failed on the fields: (`userId`,`messageId`)   (P2002)
...at EmailService.deliverInternally   msg:"internal delivery failure"
```

**Verified at the DB level:** a self‑send returns `201 success`, but only **one**
row exists for the user (the Sent copy); the inbox copy was never written, and one
"internal delivery failure" is logged.

**Why it matters.** Mostly *masked* for the user because the unified inbox view also
lists Sent mail — but there is no true received copy (no INBOX‑folder entry, no
unread state, no inbound filters run), and it logs an error on **every** self‑send.
Under load this is proportional error spam (it was the source of ~2,233 extra
`prisma:error`s in the write phase).

**Suggested fix.** In `deliverInternally`, skip creating a copy when the recipient
is the sender (the Sent copy already serves the mailbox), or use
`createMany({ skipDuplicates: true })` / an upsert keyed on `(userId, messageId)`.

---

### F6 — 🟡 Every calendar event create logs a Prisma error before a fallback saves it

Creating an event logs:
```
prisma:error  Invalid `prisma.event.create()` invocation:
  { ..., calendarId: "...", ... }   Unknown argument `calendarId`. Did you mean `calendar`?
```
Prisma rejects the scalar `calendarId`; a fallback path then saves the event and
**does link it to the right calendar** (verified: the returned event's `calendarId`
equals the requested one). So it's correct — but it runs a doomed query and emits a
`prisma:error` on every event creation. Fix: use the relation
(`calendar: { connect: { id } }`) or Prisma's `calendarId` unchecked‑create input so
the first write succeeds.

---

### F7 — 🟡 Inbox list is the slowest hot path under concurrency

| endpoint | conc | RPS | p50 | p95 | p99 |
|---|---|---|---|---|---|
| `GET /emails` (inbox) | 60 | 457 | **116 ms** | **231 ms** | 259 ms |
| `GET /search/emails` | 60 | 886 | 66 ms | 84 ms | 104 ms |

The default inbox view is ~2× slower than search and the lowest‑throughput read.
Likely causes: a heavy default‑inbox `WHERE` (folder INBOX/null/isSent + snooze
logic) and Prisma's default connection pool (~17) throttling 60 concurrent
requests. For a "Superhuman‑speed" client this p95 is high. Suggested: profile the
query / add covering indexes, and raise Prisma `connection_limit` to match expected
concurrency.

---

### F8 — 🟡 (DX) There is no working way to run the backend in development

- `apps/quantmail/package.json → scripts.dev:backend` =
  `node --loader ts-node/esm backend/app.ts` is broken twice: **`ts-node` is not a
  dependency**, and **`backend/app.ts` never calls `listen()`** (the real entry is
  `backend/server.ts`).
- The supported artifact (the esbuild bundle) **cannot boot under
  `NODE_ENV=development`**: the dev‑only `pino-pretty` transport can't resolve its
  `thread-stream` worker from inside the single‑file bundle:
  ```
  Error: Cannot find module '.../backend/dist/lib/worker.js'
  ```
  So the bundle only runs in non‑development environments. (Workaround used here:
  run with `NODE_ENV=staging`.)

**Suggested fixes.** Fix `dev:backend` to `tsx backend/server.ts` (tsx is already a
devDependency), or document the bundle‑then‑run flow; and make the logger transport
bundle‑safe (e.g. gate `pino-pretty` on a resolvable path, or use a
`pino.transport` target that the bundler keeps, or default to JSON in the bundle).

---

## Load test results

Config: read phases conc 60 × 15 s, write conc 20 × 10 s, health conc 40 × 8 s.
Backend = single Node process; `RATE_LIMIT_MAX` lifted for the throughput phases.
Full JSON: [`results/load-results.json`](./results/load-results.json).

| phase | conc | RPS | p50 | p95 | p99 | max | errors |
|---|---|---|---|---|---|---|---|
| `GET /livez` (health) | 40 | **9,615** | 3.7 ms | 6.6 ms | 9.7 ms | 193 ms | 0 |
| `GET /emails` (inbox) | 60 | 457 | 116 ms | 231 ms | 259 ms | 315 ms | 0 |
| `GET /search/emails` | 60 | 886 | 66 ms | 84 ms | 104 ms | 131 ms | 0 (but 13,331 swallowed DB errors — F2) |
| `POST /emails` (compose+send) | 20 | 220 | 91 ms | 100 ms | 106 ms | 115 ms | 0 (but self‑send delivery errors — F5) |
| `POST /auth/login` (probe ×30) | — | — | — | — | — | — | **5 × 200, 25 × 429** (F4) |

**Takeaways.** The process is fast and stable — **zero 5xx across ~115k requests**,
and health sustains ~9.6k RPS. The caveats are the *swallowed* errors (F2/F5, which
a naive "0 errors" reading hides) and the throttling/latency findings (F4/F7).

---

## Functional test results — 46 / 47 passed

Full JSON: [`results/functional-results.json`](./results/functional-results.json).
The single "failure" is a **false negative in the test, not a product bug**:
"create contact → 201" got `409` because **sending mail auto‑creates a contact for
the recipient**, so the address book already contained the contact (the very next
assertion, "list contacts", correctly shows `total = 1`). Everything else passed,
including the items below.

**Confirmed working (highlights):**
- **Sign‑up** → 2xx + access token + `quantmail_refresh` cookie; duplicate → `409
  USER_EXISTS`; weak password → `400`; missing `Origin` → `403 UNTRUSTED_ORIGIN`.
- **Login** → 200 + token; wrong password → `401 INVALID_CREDENTIALS`; and the
  **access token is accepted on protected routes** (no JWT‑secret mismatch, as long
  as `JWT_SECRET` is set — see HOW‑TO).
- **Mail A→B** across two users: delivered to B's inbox, readable, visible in
  threads and search — and it **renders in the real UI** ("Ada Lovelace, 3 unread").
- **Idempotency** on `/emails`: missing key → `400`, replay → same id (no
  duplicate), same key + different body → `422 IDEMPOTENCY_KEY_REUSE`.
- **Tenant isolation / IDOR**: user B cannot read user A's message → `403`.
- **Graceful degradation**: AI → `503 AI_UNAVAILABLE` (no crash); Drive list/quota
  are DB‑backed and return `200` without object storage (503 only on object I/O).
- **Session lifecycle**: refresh rotates the cookie; logout revokes the family
  (refresh after logout → `401`).
- **Health**: `/health`, `/livez`, `/readyz` (`db:ok redis:ok`), `/api/health`.
- **Migrations**: 114/115 apply cleanly on a fresh DB (the 115th is F1).

---

## Screenshots

Real headless‑Chromium capture of the running app (`:3000` → proxy → `:3010`).

| file | screen |
|---|---|
| [`screenshots/login.png`](./screenshots/login.png) | Sign‑in page (Obsidian theme) |
| [`screenshots/register.png`](./screenshots/register.png) | Create‑account page |
| [`screenshots/inbox.png`](./screenshots/inbox.png) | Authenticated inbox — shows delivered mail from "Ada Lovelace, 3 unread" |
| [`screenshots/calendar.png`](./screenshots/calendar.png) | Calendar |
| [`screenshots/contacts.png`](./screenshots/contacts.png) | Contacts |
| [`screenshots/drive.png`](./screenshots/drive.png) | Drive (8 category cards, 15 GB quota) |

---

## Appendix

- [`results/`](./results) — raw JSON from the functional, load and bug‑verify runs.
- [`harness/`](./harness) — the exact scripts used, plus [`HOW-TO.md`](./harness/HOW-TO.md)
  to reproduce the whole environment (Postgres+Redis from source, build the bundle,
  run, test). Secrets in the env template are throwaway QA values.

*Generated 2026‑10‑21 by an automated user‑QA pass. Findings are reproducible; file
and line references are against this branch.*
