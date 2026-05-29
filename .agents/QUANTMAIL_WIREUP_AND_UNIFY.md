# QUANTMAIL — WIRE-UP & UNIFY (Phase 66.1)

## Code-level deep audit, verified May 29, 2026 (gates + greps run against the live tree)

> Kiro: QuantMail is the most-built app (frontend ~17.7K LOC, backend ~11.4K LOC) and
> the ecosystem's central OAuth provider. The backend is genuinely strong. The frontend
> is **two unmerged generations** stitched into one app, so the product is ~35-40%
> functional end-to-end even though it looks ~80% built. This phase makes it cohesive
> and actually usable. Do NOT rewrite the backend — it's real. Wire and unify the frontend.

---

## A — VERIFIED CURRENT STATE

### A.1 Backend (DO NOT BREAK — it's real)
- Fastify via `@quant/server-core`, **real Prisma ORM** (`prisma.email.create/update/findUnique`),
  ownership authz (`email.userId !== userId → 403`), `createAppError`.
- 12 route groups registered in `backend/app.ts`: emails, threads, folders, contacts, ai,
  ai-services, git, pull-requests, reviews, issues, ci, ai-devtools. Runs on **port 3010**.
- 30+ services incl. **17 AI services** (compose/reply/summarize/triage/tone-shift/followup/
  meeting-extract/style-learner/unsubscribe + devtools: code-review/ci-fix/code-search/
  commit-message/pr-description/security-scan), plus pgp-encryption, email-aliases,
  disposable-email, undo-send, tracking-pixel-stripper, smart-send-time. **31 backend test files.**

### A.2 THE ROOT PROBLEM — two unmerged frontend generations
| | Pages Router (`src/pages/`) | App Router (`src/app/`) |
| --- | --- | --- |
| Screens | inbox, thread/[id], calendar, contacts, drive, repos, repo/[id], pipelines, security, settings, admin, login, register (13) | `/` (page.tsx), `/compose` (2) |
| Features | rich — real handlers, batch, snooze, drag-label, reply/forward | minimal stubs |
| Styling | bespoke CSS class names (`inbox-page`, `category-tab`, `thread-page`…) that are **NOT defined in any CSS file**, no CSS import → render **unstyled** | `@quant/shared-ui` + brand tokens → styled |
| Data | `fetch('/api/<x>')` relative routes | `apiClient` → hardcoded `http://localhost:3001` |
| Auth | `localStorage.getItem('token')` | `apiClient` (token **never set**) |
| Shell/theme | **none** — `src/pages/_app.tsx` does NOT exist | ThemeProvider + Cmd+K (`app-providers.tsx`) |

Consequence: what's **visible** (App Router) doesn't **work**; what **works** (Pages Router logic)
isn't **visible** (unstyled) and its backend routes are missing.

### A.3 Per-screen status (verified)
| Screen | LOC | Styled | Data-wired | Status |
| --- | --- | --- | --- | --- |
| `/` inbox (App) | 84 | yes | query, no token | **interactions dead**: search `onChange={()=>{}}`, no email/folder onClick |
| `/compose` (App) | 32 | yes | no | **dead stub**: Send/Save buttons have no onClick, inputs uncontrolled |
| `/inbox` (Pages) | 550+ | no | `/api/emails*` MISSING | rich features, unstyled, unwired |
| `/thread/[id]` | 534 | no | `/api/emails/threads*` MISSING | rich, unstyled, unwired |
| **drive** | 737 | no | **`/api/drive/*` EXIST** | **only fully-wired screen** (still unstyled, no shell) |
| calendar | 759 | no | `/api/calendar` MISSING | logic ok, unwired/unstyled |
| contacts | 584 | no | `/api/contacts` MISSING | logic ok, unwired/unstyled |
| security | 731 | no | `/api/security` MISSING | logic ok, unwired/unstyled |
| admin | 684 | no | `/api/admin` MISSING | logic ok, unwired/unstyled |
| repos | 515 | no | `/api/repos` MISSING | logic ok, unwired/unstyled |
| pipelines | 649 | no | `/api/ci-cd` MISSING | logic ok, unwired/unstyled |
| login / register | 143 / 179 | no | none | **route broken**: named export (no default), prop-based `onSubmit` never provided |
| settings | 335 | no | none | static stub |

### A.4 Other concrete defects
- `app-providers.tsx`: `apiClient.setTokens()` / baseUrl never called; Cmd+K commands all `action: () => {}`.
- `api-client.ts` baseUrl defaults to `localhost:3001` but backend is on **3010**; no `NEXT_PUBLIC_API_URL`.
- Orphaned real components: `EmailComposer.tsx` (181 LOC, real onSend/toolbar) and `RichTextEditor.tsx`
  (651 LOC) exist but `/compose` uses a dead static form instead.
- `Email` type re-defined locally in `pages/inbox.tsx` instead of importing from `src/types`.

---

## B — TASKS (ordered; each is one small PR, rebased on latest main)

> Conflict rule: only ONE PR at a time may touch shared foundations
> (`src/app/layout.tsx`, `app-providers.tsx`, `api-client.ts`, `next.config.js`). Serialize those.

### 66.1a — Decide the router & build the shell (foundation, do first)
- Standardize on **App Router** (`src/app`). Create a real app shell layout (sidebar + topbar)
  using `@quant/shared-ui` `AppShell`/`Sidebar`, wrapped in `AppProviders` (theme + Cmd+K),
  so every screen shares brand/theme/nav.
- Add real navigation between all sections (inbox, compose, threads, drive, calendar, contacts,
  repos, pipelines, security, settings).

### 66.1b — Single auth, real login
- Wire login: on submit call `apiClient.login()`, store tokens, `apiClient.setTokens()`, persist,
  redirect. Fix register + password-reset + 2FA flows to call the backend.
- Set `apiClient` baseUrl from `NEXT_PUBLIC_API_URL` (default `http://localhost:3010`).
- Remove the `localStorage.getItem('token')` pattern from Pages screens; route everything through `apiClient`.
- Add an auth guard: unauthenticated → `/login`.

### 66.1c — Build the missing Next API routes (mirror the drive pattern)
- Create route handlers under `src/app/api/` for: `emails` (list/get/search/compose/send/reply/
  forward/archive/delete/star/labels/batch{archive,delete,read}/snooze), `threads` (get/read/star/
  archive/mute), `folders`, `contacts`, `calendar` (events CRUD/upcoming/today/slots), `repos`,
  `pulls`, `issues`, `ci` (workflows/builds/deployments), `security`, `admin`. Each proxies to the
  Fastify backend (`:3010`) with the bearer token — exactly like `src/app/api/drive/*` already does.
- OR: skip Next API routes and call the Fastify backend directly via `apiClient`. Pick ONE pattern and
  apply consistently (drive already uses Next routes — matching that is lower-risk).

### 66.1d — Migrate + restyle the rich Pages screens into App Router
- Move inbox/thread/calendar/contacts/drive/repos/repo/pipelines/security/settings/admin into
  `src/app/<route>/page.tsx`, keeping their rich logic but:
  - replacing bespoke CSS classNames with `@quant/shared-ui` components + Tailwind/brand tokens,
  - wiring data through `apiClient` (step 66.1c),
  - importing shared `Email`/types from `src/types` (delete local re-definitions).
- **Inbox unification:** make the rich inbox the single `/` inbox; delete the bare `app/page.tsx`
  stub logic (keep its styling approach). Email row click → open thread.

### 66.1e — Wire compose & dead handlers
- `/compose`: use the real `EmailComposer` + `RichTextEditor`; wire Send → `apiClient.composeEmail`+`sendEmail`,
  Save Draft → compose as draft. Remove the static form.
- Wire Cmd+K command actions (compose/search/navigate) to real navigation.
- Fix the bare-inbox dead handlers (search, folder switch) if any bare screen remains.

### 66.1f — Verify end-to-end
- Playwright smoke per screen: login → inbox loads → open thread → reply → compose+send → drive
  upload → calendar create → contacts → repos → pipelines. Zero dead-ends.

---

## C — HARD GATES (phase not closed until all true)
- `grep -rn "onClick={() => {}}" apps/quantmail/src` → 0; no `action: () => {}` in command palette.
- `grep -rn "localStorage.getItem('token')" apps/quantmail/src` → 0 (all auth via apiClient).
- Every Pages screen migrated to App Router; `src/pages/` empty or removed; single router.
- No bespoke undefined CSS classes: every screen uses `@quant/shared-ui` + brand tokens; visually styled.
- Every screen's data loads against an existing route (Next `/api/*` or apiClient→:3010). No 404 data paths.
- Login works: real credentials → token stored → authed requests succeed → protected routes guarded.
- Single `Email`/type source (`src/types`); no local re-definitions.
- Gates green: typecheck, build (cold-stable), test, lint, axe zero violations.
- Playwright E2E click-through of all screens passes; no dead-ends.

## D — EXIT
QuantMail is one cohesive, branded, fully-wired app: log in, read/search/triage/snooze/label email,
open threads, reply/forward, compose with AI, use Drive/Calendar/Contacts and the Git/CI side — every
screen styled, navigable, and backed by the real backend. Effective functional level 35-40% → 90%+.
