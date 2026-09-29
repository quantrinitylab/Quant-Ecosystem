# QuantMail Super-App Consolidation — Design Spec

- **Date:** 2026-09-28
- **Author:** Claude Opus 4.8 (dedicated design agent)
- **Status:** DESIGN ONLY — no code, no git, no other files touched. Every claim below is grounded in a `file:line` citation from a real read.
- **Output contract:** This is the single artifact produced for this task.

---

## 0. TL;DR (honest current-vs-target)

The headline finding is that **the consolidation this design was asked to plan has, in large part, already shipped.** QuantMail is already ONE Next.js app + ONE Fastify backend hosting Mail, Drive, Calendar, Contacts, Documents, and QuantGit/CodeHub under one identity, one session, and one catch-all API proxy. The `.agents/project-memory/APP_MAP_AND_DEDUPLICATION_DECISIONS.md` plan reads as pending, but the survivors have absorbed the retired apps and the retired source folders are gone.

Therefore this spec is framed as a **hardening / finish-line design**, not a greenfield build. It documents (a) what is verifiably DONE, (b) the specific residual GAPS with evidence, and (c) a phased plan to close them while keeping staging green.

Two nuances that change the risk picture:

1. **QuantGit is a deliberate "breakout" module.** Unlike Mail/Drive/Calendar/Contacts (which mount the shared `AppShell`), `/quantgit` renders its own full-screen GitHub-dark chrome and its own bottom-nav dock with an explicit "Exit → `/`" button (`apps/quantmail/src/app/quantgit/page.tsx:1925`, `:2494-2560`). It is linked _from_ the unified shell but does not live _inside_ it.
2. **The CI "theatre" is no longer theatre — but it is not wired either.** The old always-green CI stub is replaced by a real gVisor sandbox executor that _fails closed_ when no isolated backend is configured (`services/ci-runner/src/executor.ts:41-58`, `gvisor-executor.ts:40-52`). It just isn't deployed/connected, so the product surface honestly shows "runner not connected" (`quantgit/page.tsx:2241`).

---

## 1. Scope & Non-Goals

**In scope.** The unified QuantMail shell and in-app module navigation; module boundaries and routing (`/mail`≈`/`, `/drive`, `/calendar`, `/contacts`, `/quantgit`, docs-under-drive); shared identity/session; the data-model boundaries and the cross-app memory that lives in Drive; and the QuantGit/CodeHub module design. Plus the cross-cutting concerns the task named: architecture, components, data flow, error handling, testing, and a phased plan.

**Non-goals.** Redesigning the bespoke visual system (it is `@quant/shared-ui` + `@quant/brand`, not shadcn/Radix — confirmed by the transpile list at `apps/quantmail/next.config.js:37`); building the other 7 products in the ecosystem; and re-litigating the approved app roster in the APP_MAP. This document does not implement anything.

**UI system constraint.** All new surfaces must reuse the bespoke primitives. QuantGit is the exception that proves the rule: it is intentionally its own design language (GitHub-dark) and should stay that way.

---

## 2. Current-State Audit (verified)

### 2.1 One app, one backend — confirmed

`apps/quantmail/backend/app.ts:157-394` builds a single Fastify instance and registers **every** module into it: auth/2FA/password-reset/settings-tokens/oauth/phone; emails/labels/threads/folders/contacts/contact-groups; repos; workspaces/invoices; ci/ci-logs/ci-healing; calendar/drive/drive-sync/chunked-upload; ai-compose/ai-chat/ai/ai-services/ai-devtools; mail-filters/vacation-responder/email-templates/email-signatures; notifications/search/attachments; e2ee/federation/inbound-webhook; documents; deliverability/audit-logs/retention/enterprise-domains/well-known; and DAV (CalDAV/CardDAV). There are **no** `QUANTCALENDAR_/DRIVE_/DOCS_/MEET_BACKEND_URL` references anywhere in `app.ts` — the multi-backend split is gone.

The browser reaches all of this through one Next.js catch-all proxy. `apps/quantmail/backend/lib/routes-config.ts:6-127` is the single allowlist the proxy matches against, and it maps every module to the same local backend (default `http://localhost:3010`): `repos` (`:37`), `drive` (`:38`), `documents` (`:39`), `ci` (`:45-52`), `calendars`/`events`/`booking` (`:59-83`), `mail-filters` (`:87`), `search` (`:92-93`), `workspaces` (`:94-101`), `folders` (`:108-109`), `attachments` (`:113-117`), `threads`/`emails`/`labels` (`:124-126`).

### 2.2 The unified shell — confirmed, with an important pattern caveat

The Google-Workspace-style shell already exists as bespoke local components: `apps/quantmail/src/components/AppShell.tsx` (module-aware chrome that derives `currentApp` from the pathname and swaps the per-module logo/wordmark) and `apps/quantmail/src/components/AppSidebar.tsx` (desktop `NAV_GROUPS`: Mail, Workspace = Teams/Calendar/Contacts/Drive/QuantGit, Control = Labels/Settings). Storage-quota readout is wired from `GET /drive/quota`.

**Pattern caveat (a refinement target, not a bug):** there is exactly one `layout.tsx` under `apps/quantmail/src/app/` (the root — confirmed by glob). The shell is therefore **mounted per-page**: each route imports `AppShell` itself (`app/page.tsx`, `app/drive/page.tsx`, `app/calendar/page.tsx`, `app/contacts/page.tsx`, `app/sent`, `app/drafts`, `app/trash`, `app/labels`, `app/search`, `app/settings`, `app/workspaces/*`, `app/thread/[id]`, `app/security`, `app/compose`, `app/pipelines` — 30+ importers found by grep). There is **no route-group layout** doing it once. This works, but it means every new module surface must remember to import the shell, and shell state is re-mounted on cross-module navigation.

**QuantGit opts out on purpose.** `/quantgit` does **not** import `AppShell`; `apps/quantmail/src/app/quantgit/page.tsx:1924-1925` renders its own `<main class="h-dvh ... bg-[#0D1117]">` and its own bottom-nav dock (`:2494-2560`) with Quanty / Repos / Agent Lab / Exit. This is the correct call for an IDE-class surface, but it must be modeled explicitly in the navigation design (Section 3.2) rather than treated as an oversight.

### 2.3 Registry renames — landed at the type level and on disk

`packages/common/src/types.ts:152-170` has the `QuantApp` union with the renames LANDED (quantwave/quantgram/quantcooks primary; quantsync/quantneon/quantedits/quantdocs/quantdrive/quantcalendar/quantmeet retained as deprecated aliases). `packages/common/src/constants.ts` still carries all 17 `QUANT_APPS` entries (10 primary + 7 legacy). The app _folders_ have now been renamed on disk (`quantsync`→`quantwave`, `quantneon`→`quantgram`, `quantedits`→`quantcooks`); two apps still exist that the APP_MAP never approved: `admin-enterprise` and `quant-desktop`.

### 2.4 Module-by-module: landed vs. gap

The APP_MAP documented six gap clusters at planning time. Verified status today:

| Module        | APP_MAP "gap"                                                                                                                           | Verified status                                                                                                                                                                                                | Evidence                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Drive**     | Missing `ai-organize`, `ai-extract-data`, `ai-search-content`, `ai-summarize-file`, `ai-duplicate`, `storage-quota` (unbounded uploads) | **CLOSED.** All six imported and wired. Quota is a real tiered service (FREE 15 GB via `DRIVE_QUOTA_BYTES`, STANDARD 100 GB, PREMIUM 2 TB) with reservations.                                                  | `backend/routes/drive.ts` imports (top of file); `backend/services/storage-quota.service.ts` `STORAGE_TIERS` |
| **Calendar**  | No calendar/alarm/booking/recurrence/availability service (only a route)                                                                | **CLOSED.** Route imports local `CalendarService`, `AlarmService`, `BookingLinkService`, `RecurringService`, `CalendarCallAlertService`. Two-writer conflict resolved (quantcalendar deleted → single writer). | `backend/routes/calendar.ts` imports; allowlist `routes-config.ts:59-83`                                     |
| **Documents** | Yjs collab / version / suggestions stack                                                                                                | **Largely CLOSED.** Real Yjs server (sync + awareness + compaction) backed by collab persistence; collab WS gateway with per-doc tenancy check. Docs live under Drive per rule 3.                              | `backend/services/yjs-server.ts`; `app.ts:216-323` `/collab/:docId`                                          |
| **Contacts**  | (survivor, no gap)                                                                                                                      | Present; dual-mounted at `/contacts` and `/api/contacts`.                                                                                                                                                      | `app.ts:343-346`                                                                                             |
| **Mail**      | (flagship, no gap)                                                                                                                      | Present; emails/threads/labels/folders/filters/signatures/templates/vacation all registered.                                                                                                                   | `app.ts:335-366`                                                                                             |
| **QuantGit**  | CI/sandbox theatre; engine placement                                                                                                    | **Partial** — see Section 5. Repo/PR/issue/branch/commit CRUD is real over `/api/repos/*`; sandbox executor now fails-closed real gVisor; CI runner not deployed.                                              | `quantgit/page.tsx:491-923`; `services/ci-runner/*`                                                          |

### 2.5 CI / sandbox honesty check

The QUANTGIT_ARCHITECTURE doc listed CI as "theatre" (T1 always-green executor, T2/T3 mock sandbox, T7 not deployed). Re-verified against source:

- **T1/T2/T3 are resolved in code.** `services/ci-runner/src/executor.ts:41-58` no longer returns green unconditionally — it delegates to `GVisorContainerExecutor` and, if no isolated backend is available, sets the job `failed` and throws `CIExecutorUnavailableError` (`:14-22`). The comment is explicit: "Never falls back to host execution" (`gvisor-executor.ts:50`). The gVisor executor is a real design: `runsc` syscall interception, cgroups (memory/cpu/pids to stop fork-bombs), fs isolation, process-group kill (`gvisor-executor.ts:40-58`). Sibling real modules exist: `network-sandbox.ts`, `log-streamer.ts`, `parser.ts`, `artifact-uploader.ts`, plus `gate5-verification` and `gvisor-executor` tests.
- **T7 is still true.** The runner is a standalone microservice under `services/ci-runner/` and is **not** wired into the QuantMail backend, and the product surface honestly reflects this: the Actions tab is rendered with `runnerConnected={false}` (`quantgit/page.tsx:2241`), and the product `/ci` route only lists builds from the `CiRun` model, returning **empty lists** for workflows/deployments because "there is no workflow-definition or deployment model yet" (`backend/routes/ci.ts:1-10`).

**Bottom line:** CI moved from _dishonest-green_ to _honest-unavailable_. That is a real improvement and a safe base to wire up, but end-to-end CI is still non-functional in staging.

### 2.6 Dead code behind redirects

`apps/quantmail/next.config.js:47-70` 308-redirects `/codehub(/*)` and `/repos(/*)` to `/quantgit(/*)`. The old `codehub/page.tsx` and `repos/page.tsx` still exist behind those redirects (dead code to remove in cleanup).

---

## 3. Target Architecture

### 3.1 System context

```
                         ┌───────────────────────────────────────────┐
   Browser (one origin)  │  Next.js 15 app  (apps/quantmail)          │
   quantmail.in          │  ── Root layout: providers + theme         │
        │                │     (Query/Brand/Auth/AppProviders/Guard)  │
        │  cookies/JWT   │  ── Per-route AppShell (Mail/Drive/Cal/     │
        ├───────────────▶│     Contacts/Docs)  |  QuantGit breakout   │
        │                │  ── /api/[...path] catch-all proxy         │
        │                └───────────────┬───────────────────────────┘
        │                                │ allowlist match (routes-config.ts)
        │                                │ forwards Authorization/Cookie/Origin
        ▼                                ▼
   WS /collab/:docId            ONE Fastify backend (:3010)
   WS /quantgit git-smart-http  ── all modules registered in app.ts
                                ── Prisma 6 → PostgreSQL (durable authority)
                                ── Redis (rate-limit / presence / memory tiers)
                                ── HTTP → quantai-backend (QuantGit agent plane)
                                ── HTTP → services/ci-runner (gVisor, when wired)
```

One origin, one JWT identity, one backend process. Everything below the proxy is an internal module boundary, not a network boundary — which is exactly what makes it a super-app rather than a portal over microservices.

### 3.2 Shell & navigation design

**Two shell tiers, made explicit.**

- **Tier 1 — Workspace shell (`AppShell` + `AppSidebar`).** Wraps Mail, Drive, Calendar, Contacts, and Documents (Docs open inside Drive at `/drive/doc/[docId]`). It owns: the module-switcher (desktop sidebar Workspace group + mobile bottom-nav 5 slots), the per-module logo/wordmark swap driven by `currentApp` (pathname-derived), the shared Quanty AI drawer, the context-aware FAB, and the storage-quota readout. **Target refinement:** hoist the per-page `AppShell` import into a **route-group layout** (`app/(workspace)/layout.tsx`) so the shell mounts once and survives cross-module navigation, instead of 30+ pages each importing it. This is the single highest-leverage structural cleanup.
- **Tier 2 — Breakout modules (QuantGit today).** Full-viewport surfaces that render their own chrome and provide an explicit "Exit → `/`" affordance back to Tier 1. They are _entered from_ the Tier-1 switcher but do not nest inside it. The contract: a breakout module MUST (a) accept the same JWT/session, (b) offer a labelled exit, and (c) keep the Quanty AI entry point available.

**App-switcher UX.** Keep the current dual affordance: desktop = `AppSidebar` Workspace group; mobile = `MobileBottomNav` 5 slots (Mail `/`, Calendar, Drive, Contacts, QuantGit). Documents intentionally has **no** top-level nav slot — it is reached through Drive (matches APP_MAP rule 3). Recommended addition: a Google-style 3×3 "waffle" launcher in the top bar that lists all six modules with icon + label, so discoverability does not depend on knowing the sidebar groups. It should render the same `currentApp` metadata the shell already derives.

### 3.3 Routing map (canonical)

| Module    | Canonical route(s)                                                                                         | Notes                                         |
| --------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Mail      | `/` and folder routes `/sent /drafts /trash /spam /archive /snoozed /starred /labels /search /thread/[id]` | Flagship; root is the inbox.                  |
| Drive     | `/drive`, `/drive/doc/[docId]`                                                                             | Docs are a Drive sub-surface.                 |
| Calendar  | `/calendar`, `/calendar/booking/[slug]` (public)                                                           | Booking slug is a public path.                |
| Contacts  | `/contacts`                                                                                                | Dual API mount `/contacts` + `/api/contacts`. |
| Documents | (under Drive) `/drive/doc/[docId]`                                                                         | No standalone nav entry.                      |
| QuantGit  | `/quantgit` (+ `/quantgit/repositories`, `/quantgit/agentlab`, `/quantgit/[owner]/[repo]/[[...rest]]`)     | `/codehub` and `/repos` 308-redirect here.    |

**Rule:** `/quantgit` is the one canonical code surface. `/codehub` and `/repos` remain permanent redirects (`next.config.js:47-70`); their leftover page files are dead code slated for deletion.

### 3.4 Shared identity & session

One JWT, issued/verified by the backend, carried three ways depending on transport:

- **HTTP (REST):** the catch-all proxy forwards `Authorization`, `Cookie`, and `Origin` to the backend (`api/_lib/proxy.ts`), and the backend's global auth hook enforces it — except for the intentional `publicPaths` allowlist in `app.ts:86-152` (login/register/refresh/logout, `2fa/verify`, `password-reset*`, oauth token/revoke/register, public calendar booking, public invite preview, `.well-known`, inbound SNS webhook, git-smart-http `/api/code/gitd`, public Drive/Docs share tokens, DMARC report ingestion, health, and DAV with its own Basic/Bearer negotiation).
- **Collab WebSocket (`/collab/:docId`):** token resolved from query → cookie (`quant_access_token`) → `Authorization: Bearer`, verified with `jose.jwtVerify` against the configured issuer/audience set, then a **per-document tenancy check** (owner / collaborator / public) that fails closed (`app.ts:217-322`).
- **QuantGit git-smart-http (`/api/code/gitd/*`):** public path, but performs its own PAT verification (`app.ts:120-123`) — no repository administration routes may be mounted under it.

Design rule for any new module: never add an unbounded wildcard to `publicPaths`; add exact paths or method-scoped rules, matching the pattern documented at `app.ts:78-85`.

### 3.5 One-backend module registration (target contract)

`app.ts` is the composition root and should stay that way. The contract for each module:

1. A `routes/<module>.ts` Fastify plugin, registered in `buildApp()` with an explicit prefix.
2. A matching entry (or entries) in `routes-config.ts` so the Next proxy will forward it. **This is the load-bearing coupling and the most common failure mode** — the CI comment at `routes-config.ts:40-52` records a real incident where the backend route existed but three GETs were never allow-listed, so the proxy answered `API_ROUTE_NOT_FOUND` and the page "showed Failed to load." Any new backend route without an allowlist entry is invisible to the browser.
3. Method lists in the allowlist must match the verbs the backend actually registers. The same comment block warns twice that listing a verb the backend lacks (e.g. `PATCH` on calendars, `POST /ci/deployments`) opens the proxy onto a Fastify 404 — a "route that advertises itself." Keep allowlist verbs a subset of registered verbs.

---

## 4. Module Boundaries & Data Model

### 4.1 Ownership boundaries (per APP_MAP rules)

- **Rule 1/2 — per-app admin & native:** admin and native/mobile concerns stay out of the shared module data models. (Note the two unapproved apps `admin-enterprise` / `quant-desktop` — see owner decision in Section 11.)
- **Rule 3 — Documents belong to Drive:** the `Document` model and its collab artifacts are a Drive sub-domain, surfaced at `/drive/doc/[docId]`, not a peer module. The collab WS tenancy check reads `document.{userId,isDeleted,isPublic,collaborators}` (`app.ts:286-289`) — that model is the boundary.
- **Rule 4 — cross-app memory lives in Drive:** the unified memory graph is hosted by the Drive service. `backend/routes/drive.ts` defines `MEMORY_APP_LABELS` (now only quantmail/quantchat/quantube/quantai/quantdrive — stale quantdocs/quantmeet/quantcalendar labels removed), plus `MEMORY_SCAN_LIMIT` / `MEMORY_SHARED_SESSIONS`, and the frontend reaches it via `GET /api/drive/memory` → `${DRIVE_BACKEND_URL}/drive/memory` (`api/drive/memory/route.ts`), where `DRIVE_BACKEND_URL` falls back to `QUANTMAIL_BACKEND_URL || http://localhost:3010` (`api/drive/_lib/backend-url.ts`).

### 4.2 Data model boundaries (target)

Each module owns its Prisma tables and never writes another module's tables directly; cross-module reads go through the owning service. Concretely:

- **Mail:** Email/Thread/Label/Folder/Filter/Signature/Template/VacationResponder.
- **Drive (incl. Documents + Memory):** DriveFile/Quota/Reservation, Document + collab/version rows, and the cross-app MemoryItem/MemoryEntry graph.
- **Calendar:** Calendar/Event/Alarm/BookingLink/Recurrence.
- **Contacts:** Contact/ContactGroup.
- **QuantGit:** Repository/CiRun + the agentic Floor/Agent/Workspace/Goal/Run/ToolCall/Message/Scratchpad/Memory/SandboxSession/AuditEvent/Approval/BudgetLedger/GovernorTrip set (see Section 5).
- **Identity (shared):** User/Session/Token/2FA — the one truly cross-cutting model, owned by auth.

---

## 5. QuantGit / CodeHub Module Design

### 5.1 Surface vs. engine (Decision D1, confirmed by code)

The `/quantgit` page is a **surface**: a large client component that calls REST endpoints and renders results, with graceful fallback to seed data. It is not the agent engine. Per QUANTGIT_ARCHITECTURE D1, the engine (SwarmOrchestrator, budget ledger, pilots, ~25k LOC) lives in **quantai-backend** and QuantGit talks to it over HTTP. This spec endorses keeping that split (moving 25k LOC is pure risk with no user-visible gain).

**What the surface really does today** (`quantgit/page.tsx`):

- **Repos CRUD over `/api/repos/*`:** list (`:491-542`), file tree (`:545-571`), file blob read with 404→template fallback (`:389-478`), issues (`:672-700`), issue comments (`:702-723`), pulls (`:725-756`), branches (`:758-788`), commits (`:790-825`), actions (`:884-899`); mutations for create-repo (`:1303`), create/toggle issue, create/merge PR, create/delete branch, star, settings PATCH, workflow trigger. Blob commits use **optimistic concurrency** — a `409`/`STALE_BLOB` response is surfaced as "This file changed on the server. Reload it before committing." (`:1780-1787`).
- **Shared AI plane:** the Quanty copilot posts to `/api/ai/chat` with `context.app='quantgit'` and consumes `toolExecutions` (e.g. `create_repository`, `deploy_agent`) to mutate local state (`:1612-1729`). This is the same `ai/chat` route the rest of the app uses (`routes-config.ts:35`), so the code assistant is not a separate brain.
- **Graceful degradation everywhere:** every fetch falls back to `INITIAL_*` seed constants when the backend is empty/unreachable, so the surface is demoable without a populated DB. Design consequence: seed data must be visually distinguishable from real data (see 5.5) so staging is never mistaken for production-ready.

### 5.2 Tab inventory and honesty labels

The repo view exposes 14 tabs (`:2013-2061`): Code, Commits, Branches, Issues, Pull requests, Copilot Fleet (agents), MCP Registry, Actions, Notifications, Discussions, Projects, Security, Insights, Settings. Backing status:

- **Real API-backed:** Code/Commits/Branches/Issues/Pulls/Settings (+ repo create/merge/star).
- **Local-state / seed only (target = wire or badge as preview):** Projects (kanban is local `useState`), Discussions (local upvotes), MCP Registry, Insights, and the Copilot Fleet dispatch (`onDispatchTask` currently just toasts, `:2210-2212`).
- **Honestly disconnected:** Actions (`runnerConnected={false}`).

Design rule: any tab not backed by a real endpoint must carry a visible "Preview" affordance until wired, to preserve the honesty the CI layer now models.

### 5.3 The agentic "office floor" (Agent Lab)

`/quantgit` Agent Lab (deck tab `lab`, `:2338-2372`) renders `AgentOfficeCanvas` — the office-floor metaphor from the architecture doc, where the CEO agent and role agents occupy desks. The engine behind it (in quantai-backend) is the SwarmOrchestrator state machine + SwarmBudget ledger + FloorGovernor circuit breaker (steer→constrain→stop at 80/90/100 % of budget), with an AuditEvent-driven deterministic replay UI. The surface's job is to (a) deploy/inspect agents, (b) stream their state, and (c) render approvals and audit replay. Today the Lab deploys agents into **local state** (`handleDeployAgent`, `:1579-1599`) with the real path being the `deploy_agent` tool-execution returned by `/api/ai/chat`.

### 5.4 Sandbox & CI wiring (the real remaining engineering)

The sandbox/CI code is real and fails closed; it is not deployed. The finish-line design:

1. **Deploy `services/ci-runner`** onto EC2 managed node groups (not Fargate — gVisor `runsc` needs the node's kernel/KVM access, per the architecture doc's D3 blocker). Provide the isolated execution backend so `GVisorContainerExecutor.isAvailable()` returns true and `assertAvailable()` stops throwing (`executor.ts:37-39`, `gvisor-executor.ts`).
2. **Introduce a workflow-definition and deployment model** so `/ci/workflows` and `/ci/deployments` return real data instead of the honest empty lists (`ci.ts:1-10`). Keep the allowlist verbs a subset of registered verbs (`routes-config.ts:45-52`).
3. **Connect the runner to the product**: flip the QuantGit Actions tab from `runnerConnected={false}` (`:2241`) to a live connection state, streaming logs via `log-streamer.ts`.
4. **Preserve fail-closed semantics end to end.** Infrastructure unavailability must never render as a green check — that is the specific regression to guard against, and it is exactly what the current `CIExecutorUnavailableError` design prevents.

### 5.5 BYOK & seed-vs-real

Keep the BYOK vault seam (per architecture doc) so tenants can bring their own model keys through the shared AI plane. Independently, add a single `isSeed`/`source` marker to QuantGit list payloads so the surface can badge fallback data; this closes the "looks production-ready but is seed data" risk created by the (otherwise good) graceful-degradation pattern in 5.1.

---

## 6. Data Flow

### 6.1 REST request lifecycle (the common path)

```
Component → browserAuthSession.authenticatedFetch('/api/<module>/...')
   → Next.js /api/[...path]/route.ts
       → decode path, match against ALLOWED_BACKEND_ROUTES (routes-config.ts)
           → no match  → 404 API_ROUTE_NOT_FOUND
           → wrong verb → 405
           → match     → proxyToBackend(): forward to QUANTMAIL_BACKEND_URL
                          with Authorization/Cookie/Origin
   → Fastify global auth hook (unless publicPaths) → module route → Prisma → PostgreSQL
   → JSON envelope { success, data | error } back through the proxy
       → fetch failure → 502 BACKEND_UNAVAILABLE (api/_lib/proxy.ts)
```

The envelope shape `{ success, data, error:{ code, message } }` is consistent across modules and is what the QuantGit surface keys off (e.g. `payload?.success`, `payload?.error?.code === 'STALE_BLOB'`).

### 6.2 AI chat flow

`POST /api/ai/chat` (allow-listed `routes-config.ts:35`) → backend `ai-chat` plugin (registered under `/ai`, `app.ts:359`) → model routing/BYOK → optional tool executions returned in `data.toolExecutions` → surface applies side effects (refresh repos on `create_repository`, add agent on `deploy_agent`). Same route serves Mail compose, Drive, and QuantGit — one assistant, many contexts (disambiguated by the `context.app` field).

### 6.3 Realtime collaboration flow

`WSS /collab/:docId` → `preValidation` resolves+verifies JWT and runs the per-doc tenancy gate (owner/collaborator/public, fail-closed) → `setupWSConnection` bridges to the Yjs server (`yjs-server.ts`: sync + awareness protocol, persistence, compaction). Document state is the durable authority; awareness is ephemeral.

### 6.4 Git Smart-HTTP flow

`/*` under `/api/code/gitd` is public at the JWT layer but authenticates via **PAT verification inside the transport** (`app.ts:120-123`). Clone/push URLs are minted per-user by the surface (`https://quantmail.in/quantgit/<user>/<repo>.git`, `quantgit/page.tsx:179-180`). No repo-admin/PR/review/issue routes may be mounted under the gitd prefix.

---

## 7. Components

**Shared / bespoke primitives.** Reuse `@quant/shared-ui` (Tier-1 shell borrows `PageTransition`, `useFocusTrap`; brand logos per module) and `@quant/brand`. Do **not** introduce shadcn/Radix. New Tier-1 surfaces compose the existing `AppShell`, `AppSidebar`, `QuantFab`, `Quanty` drawer, and `MobileBottomNav`.

**Module surfaces.**

- _Mail/Drive/Calendar/Contacts:_ page-level route components that mount `AppShell` and render module content. Target: move the mount into a `(workspace)` route-group layout.
- _Documents:_ rendered inside Drive at `/drive/doc/[docId]`, wired to the collab WS.
- _QuantGit:_ a self-contained component tree — `QuantGitHeader`, `ReposDirectoryView`, the 14 tab components (`CodeTab`, `CommitsTab`, `BranchesTab`, `IssuesTab`, `PullRequestsTab`, `AgentsTab`/`CopilotFleetModeView`, `MCPRegistryTab`, `ActionsTab`, `NotificationsInbox`, `DiscussionsTab`, `ProjectsTab`, `SecurityTab`, `InsightsTab`, `SettingsTab`), `QuantyCopilotView`, `QuantGitModals`, `RepoImportModal`, and `AgentOfficeCanvas`. Route parsing is centralized in `lib/quantgit-route` (`navigateQuantGit`/`parseQuantGitRoute`/`subscribeToQuantGitRoute`).

**Backend plugins.** One Fastify plugin per module in `backend/routes/*`, services in `backend/services/*`, shared error/env/auth helpers from `@quant/server-core`.

---

## 8. Error Handling

- **Proxy layer:** unknown path → `404 API_ROUTE_NOT_FOUND`; wrong method → `405`; backend unreachable → `502 BACKEND_UNAVAILABLE` (`api/_lib/proxy.ts`). The allowlist is the contract; a missing entry is the single most common "Failed to load" cause (documented incident, `routes-config.ts:40-52`).
- **Auth layer:** global hook returns `401` off the `publicPaths` allowlist; collab WS returns `401` (missing/invalid token) or `403` (tenancy mismatch), failing closed on any lookup error (`app.ts:256-319`).
- **Optimistic concurrency:** blob commits return `409`/`STALE_BLOB`; the surface tells the user to reload before committing (`quantgit/page.tsx:1780-1787`).
- **Graceful degradation:** QuantGit fetches fall back to seed data on error (never a blank screen), but per 5.5 fallback must be badged.
- **Fail-closed compute:** CI infrastructure unavailability throws `CIExecutorUnavailableError` and marks jobs failed — never green (`executor.ts:14-58`).
- **Empty-vs-error:** product `/ci` returns clean empty lists (200) so the UI shows empty states, not error toasts, where a model does not yet exist (`ci.ts:1-10`).

---

## 9. Security (cross-cutting)

- **Single JWT, verified server-side**, forwarded by the proxy; issuer/audience sets are explicit in the collab verifier (`app.ts:269-277`). `JWT_SECRET` is mandatory in production (`app.ts:65-66`).
- **`publicPaths` discipline:** exact paths or method-scoped rules only; the file already annotates _why_ each entry is public and warns against blanket wildcards for data routes (`app.ts:78-152`). New modules follow this or they leak.
- **CSP / headers:** strict CSP with `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, HSTS preload, `X-Frame-Options: DENY`, and `Permissions-Policy: camera=(), microphone=(self), geolocation=()` (`next.config.js:18-128`). Inbound mail HTML is DOMPurify-sanitized behind this CSP.
- **Tenancy isolation:** enforced at the module layer (collab per-doc gate; DAV strict tenant boundary; repo ownership scoping in `ci.ts:57-60`). Cross-tenant reads must go through the owning service, never a direct table read.
- **New network-exposed surfaces** (e.g. wiring the CI runner) MUST ship with auth from day one — the git-smart-http PAT model and the runner's fail-closed executor are the templates.

---

## 10. Testing Strategy

- **Existing parity suites (keep green):** QuantGit already ships `__tests__/GitHubSovereignParity`, `PullRequestsAndActionsParity`, `CommitsAndBranchesParity`, `LiveCodingAndPRMergeParity`, `CodeEditorDeepParity`, `RepoMigrationParity`, `SecurityParity`, `BuildTerminal`. The CI runner ships `executor`, `gvisor-executor`, `network-sandbox`, `log-streamer`, `parser`, `artifact-uploader`, `main-availability`, `gate5-verification`, `infra-config` tests.
- **Unit:** each new service (workflow/deployment models, waffle launcher, seed-badging) gets focused unit tests.
- **Integration (the highest-value gap):** a proxy↔backend contract test that asserts, for every `routes-config.ts` pattern, that the backend registers the same verbs — this would have caught the CI "door stayed shut" incident automatically. Recommend generating it from the allowlist.
- **E2E:** one cross-module happy path per module through the real proxy (login → module → primary action), plus a QuantGit clone/commit/PR path once the runner is wired.
- **Fail-closed regression test:** assert CI renders unavailable (not green) when the execution backend is absent.
- **Green-staging gate:** every wave below must leave `pnpm build` + the parity suites passing before merge.

---

## 11. Phased Plan (keep staging green)

The original W-A..W-I waves assumed a pending migration. Re-baselined against reality:

**Phase 0 — Reconcile the plan with reality (docs/registry, no runtime risk).**

- Mark APP_MAP waves W-A (Drive), W-B (Calendar), W-C (Documents), W-E (registry renames) as _landed_ with the evidence in Section 2.
- Resolve the `EXECUTION_QUEUE.md` conflict (only `M11D-SHADOW-CANARY` is currently allowed active) with an owner-approved queue edit before starting any code wave. **This is a gating prerequisite.**

**Phase 1 — Shell structural cleanup (low risk, high leverage).**

- Introduce `app/(workspace)/layout.tsx` and move the per-page `AppShell` mount into it; delete 30+ redundant imports incrementally, one route at a time, keeping build green.
- Add the waffle app-launcher to the top bar (pure additive UI).

**Phase 2 — Dead-code & registry hygiene (low risk).**

- Delete `codehub/page.tsx` and `repos/page.tsx` (dead behind 308s); keep the redirects.
- Decide + act on the two unapproved apps (`admin-enterprise`, `quant-desktop`) — see Section 12.
- The app folders are already renamed on disk; once no primary code references the deprecated aliases (gated on migration 0061 being fully applied everywhere), prune the legacy `QUANT_APPS`/`QuantApp` entries. Sweep stale `node_modules/.bin` in the old app dirs.

**Phase 3 — Proxy/backend contract hardening (medium risk).**

- Land the generated allowlist↔backend verb contract test (Section 10) and fix any drift it surfaces.

**Phase 4 — QuantGit finish line (the real engineering).**

- Wire the AI-plane dispatch (`onDispatchTask`) and badge seed data (5.5).
- Stand up `services/ci-runner` on EC2 managed node groups; add workflow/deployment models; flip `runnerConnected` live; preserve fail-closed (5.4).
- Back the remaining preview tabs (Projects/Discussions/MCP/Insights) or badge them until backed.

**Phase 5 — Verify & document.** Full build + parity + new E2E; update APP_MAP and QUANTGIT_ARCHITECTURE to match shipped reality.

Each phase is independently shippable and leaves staging green; phases 1–3 carry near-zero user-visible risk and can proceed in parallel with the Phase-0 approvals.

---

## 12. Assumptions (stated, not verified with the owner)

1. The APP_MAP roster is still the intended survivor set; `admin-enterprise` and `quant-desktop` are newer than the doc and their disposition is a genuine open question (fold into quanttrinity/native? keep as approved peers?). I assume they are legitimate but undocumented, not accidental.
2. `quantmail.in` is the production origin (surface mints clone URLs against it); the design assumes single-origin deployment for the super-app.
3. The QuantGit engine remains in quantai-backend (D1); this spec does not plan a move.
4. Staging today is green with CI honestly _unavailable_ rather than green-faked; "keep staging green" means keep it building and passing parity suites, not "make CI pass by faking it."
5. EC2 managed node groups (not Fargate) are acceptable infra for gVisor — inherited from QUANTGIT_ARCHITECTURE D3.
6. The legacy `QuantApp` aliases still have external consumers (webhooks/notifications), so they are pruned only after a reference sweep, not immediately.

---

## 13. Owner Decisions Required

1. **Approve the plan reconciliation + EXECUTION_QUEUE edit** so code waves can start (Phase 0). Gating.
2. **QuantGit engine placement (D1):** confirm keep-in-quantai-backend (recommended) vs. move. Everything in Section 5 assumes keep.
3. **Two unapproved apps:** ratify or retire `admin-enterprise` and `quant-desktop`.
4. **CI runner infra spend:** approve EC2 managed node groups for gVisor, or accept that end-to-end CI stays unavailable (honestly) until then.
5. **Shell refactor timing:** approve the `(workspace)` route-group layout migration (Phase 1) — low risk but touches 30+ route files.

---

## 14. Evidence Index (file:line)

- Backend composition root / one process: `apps/quantmail/backend/app.ts:157-394`; publicPaths `:86-152`; collab WS + tenancy `:216-323`.
- Proxy allowlist (module→backend map): `apps/quantmail/backend/lib/routes-config.ts:6-127` (repos `:37`, drive `:38`, documents `:39`, ci `:40-52`, calendar `:53-83`, search `:92-93`, workspaces `:94-101`).
- Unified shell usage (per-page mount): grep of `AppShell` across `apps/quantmail/src` (30+ importers); single root layout confirmed by glob.
- QuantGit surface: `apps/quantmail/src/app/quantgit/page.tsx` — own chrome `:1924-1925`, bottom-nav/Exit `:2494-2560`, repo fetches `:491-923`, AI chat `:1612-1729`, STALE_BLOB `:1780-1787`, `runnerConnected={false}` `:2241`, clone URL mint `:179-180`.
- CI honesty: `services/ci-runner/src/executor.ts:14-58`; `services/ci-runner/src/gvisor-executor.ts:40-58`; product route `apps/quantmail/backend/routes/ci.ts:1-10`.
- Registry: `packages/common/src/types.ts:152-170`; `packages/common/src/constants.ts` (17 entries).
- Redirects/CSP: `apps/quantmail/next.config.js:47-70` (redirects), `:18-128` (CSP/headers/transpile).
- Cross-app memory in Drive: `apps/quantmail/backend/routes/drive.ts` (`MEMORY_APP_LABELS`); `apps/quantmail/src/app/api/drive/memory/route.ts`; `apps/quantmail/src/app/api/drive/_lib/backend-url.ts`.

_End of design spec._
