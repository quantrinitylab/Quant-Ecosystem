# 33 — Implementation Status (Living Scoreboard)

## What this document is

This is the living scoreboard for the QuantEcosystem architecture. For every spec'd
module — every screen module (M/C/A/G/W/T/X/K/D IDs), every backend domain, every
cross-cutting platform contract — it records what is **real** versus what is
**missing, partial, or broken** in the code, with file-path evidence.

It is regenerated from the audit loops. Edit it by hand only to correct facts —
never mark anything done without evidence, per `15-definition-of-done.md`
(a screenshot, HTTP 200, or green TypeScript check is not done).

- **Last updated:** 2026-10-11 IST (refresh 3)
- **Audit sources (read-only, not re-run here):**
  - `hidden_files/gap-audit/uiux-gap.md` — 115 spec'd screens, repo @ `abfb2b3` (2026-10-07)
  - `hidden_files/gap-audit/backend-gap.md` — 45 backend domains, repo @ `abfb2b35258bb765c11a34e660cb588cea2d58a3` (merge PR #568, 2026-10-07)
  - `hidden_files/gap-audit/structure-gap.md` — repo tree vs target, repo @ `abfb2b3` (2026-10-07)
  - `hidden_files/gap-audit/deepdive.md` — fake-data/security deep dive, repo @ `abfb2b3` (2026-10-07)
  - `hidden_files/gap-audit/extras-to-remove.md` — merged extras register (2026-10-07)
  - Refresh 2026-10-11 folds in: fake-removal wave PRs #576–#590 (all MERGED 2026-10-07),
    structural-khami wave K1–K15 PRs (all MERGED), ~260 merged PRs #578–#839, continuous-qa
    `findings.md` (through 2026-10-11 04:07), customer-audits 2026-10-10/11
    (regression-audit, 8app-reaudit, functional-audit, inbox-triage, settings-deep,
    mobile-style, week-planning, chat-power-user). Remediation claims were re-verified
    against `origin/main` via `git grep`/`git show`/`git ls-tree` — merged PRs alone did
    not count as done.
- **Scoreboard HEAD:** `5727f051` (merge PR #839, 2026-10-11 09:27 IST). Previous scoreboard
  HEAD was `6b8e75db` (merge PR #577). Statuses below reflect the audits above;
  remediation in flight (Drive fake-removal PRs #825/#826, Contacts PRs #831/#832 — all
  OPEN at refresh time) is noted where known, not assumed.
- **File numbering note:** `29-` through `32-` were taken by the M39–M41 extension docs, so this
  scoreboard takes `33-`. **Collision warning (2026-10-11):** the architecture intake merge
  (#607) added a second `33-` file (`33-quanty-app-capability-and-tool-registry.md`) and
  duplicated numbers 16–25 (e.g. `20-ecosystem-cross-app-connection-contract.md` vs
  `20-m21-privacy.md` vs `20-quantmail-m01-inbox.md`). Doc-number references in this
  scoreboard are ambiguous until the numbering is repaired (docs track).

### Status legend (same as the audits)

- **BUILT** — implemented per spec with evidence.
- **PARTIAL** — exists but missing spec'd behaviors/states.
- **MISSING** — spec'd, no code.
- **BROKEN** — code exists but contradicts the spec or fails closed/open incorrectly.

### Headline counts

| Track | BUILT | PARTIAL | MISSING | BROKEN |
|---|---|---|---|---|
| Screens (115 across 9 products) | 72 | 14 | 28 | 0 |
| Backend domains (45) | 2 | 32 | 9 | 2 |
| Deep-dive severities (2026-10-07 baseline 17 P0 / 12 P1 / 10 P2) | — | — | — | 10 P0 clusters resolved+verified (see changelog); 1 survivor (BroadcastChannel MOCK_MSGS); new P0s since: Drive preview-auth 401, Drive phantom duplication, QuantChat realtime socket (F16), QuantAI SSO loop, REG-2 mark-unread |
| Structure | — | — | Part A extras REMOVED (#589); duplicates consolidated (#591); retro-spec decision merged (#605); ~578 per-screen spec files landed (#604) | Economy 4-owners → PARTIAL (decision doc; code consolidation unverified); per-app `src/mobile/` copy-paste (K7) still open |
| Extras (shipped, no spec) | — | — | — | Part A REMOVED; Part B → keep+spec decided in `decisions/extras-retro-spec.md` (#605) |

### Refresh 2026-10-11 — change log (status flips only; all evidence on `origin/main` @ `5727f051`)

| Item | Was | Now | Evidence |
|---|---|---|---|
| M19 Admin Domains | MISSING | BUILT | `apps/quantmail/src/app/admin/domains` route exists on origin/main (#600) |
| M20 Admin DLP/Audit | MISSING | BUILT | `apps/quantmail/src/app/admin/dlp-audit` route exists on origin/main (#600) |
| M15 Notifications (center) | PARTIAL | BUILT | `apps/quantmail/src/app/notifications/page.tsx` + `loading.tsx` dedicated center exists; backend `routes/notifications.ts` real (#647, #788, #840/#841). Residual: only `new_email` rows produced; empty-state claims calendar/drive/security events (continuous-qa findings 231) |
| Security: radar `x-user-id` impersonation | BROKEN | RESOLVED | `requireUserId()` reads only `request.auth.userId`, 401 fail-closed, "no fallback to client-supplied identity header" comment (`apps/quantwave/backend/routes/radar.ts`); PR #576 merged |
| Security: SSO ticket decode-only "verify" | BROKEN | RESOLVED | Renamed `decodeUnverifiedHandoffTicket`; new `verifyTokenWithUserInfo` re-verifies via `/api/auth/userinfo` (`UniversalSSOTokenBridge.ts:304,335,438-459`); PR #583 merged |
| Security: `?token=` bearer | BROKEN | PARTIAL | Platform fallback removed; test asserts `?token=` rejected (`packages/server-core/src/__tests__/app.test.ts`); PR #579 merged. **Residual carve-out:** `apps/quantmail/backend/routes/thread-realtime.ts:15,43-44` still accepts `?token=`; `sse-transport.ts` has a token path |
| Fake: QuantMail Teams/Agents tabs | in remediation | REMOVED | `git ls-tree` → both panel components gone; PR #578 merged |
| Fake: QuanTube live/chat/metrics/search + music/transcode/uploader | in remediation | REMOVED/wired-real | `live.tsx` HONESTY NOTE (reads only `GET /api/live`); `LiveStreamChat.tsx:79` "never simulated"; fake `music.tsx`/`VideoUploader.tsx` gone, real `video-transcode-pipeline.service.ts`; PRs #580, #584 merged |
| Fake: QuantChat `/map` + E2E copy | in remediation | REMOVED | `map/page.tsx` wired to `chatSocket`, "pins are never placed at invented positions"; `support/page.tsx:24` honest "End-to-end encryption is not enabled in QuantChat yet"; PR #586 merged |
| Fake: QuantAI voice/image-gen/code + 6 mock pages | in remediation | REMOVED/wired-real | All call real endpoints via `apiFetchRaw`; `image-gen.tsx` honest "coming soon"; PR #590 merged |
| Fake: QuantGram collab/map/mock pages | in remediation | PARTIAL | CollabInvite gone; `SocialMapView` clean; **survivor:** `BroadcastChannel.tsx:33,46-52` still renders hardcoded `MOCK_MSGS` behind fake 300ms loading delay (#585 missed it); `useReels.ts:118` still falls back to hardcoded `getGuestFeaturedReels()` |
| Fake: unprovable "End-to-end encrypted" copy | in remediation | REMOVED | `AuthBrandPanel.tsx` gone; `settings/page.tsx:943` honest "It is NOT end-to-end encrypted…"; test asserts booking page lacks the claim (`__tests__/booking-page.test.tsx:34`); PR #578 merged |
| Fake: extras Part A (dead/dup/junk) | open | REMOVED | `backend/Quant-Ecosystem/`, root scratch, `packages/quant_flutter/`, `scripts/dead-packages-baseline.json`, `app/repos|codehub`, QuantAI `/ask`, QuantGram `/shop` all gone; PR #589 merged |
| Fake: QuantAI third-party model names (QAI-1) | open (8app-reaudit 2026-10-10) | FIXED in code | PR #801 merged 2026-10-10 (after the reaudit); live-verify pending |
| Fake: QuantGit security-scan theater | open | REMOVED | Commit `2e9d5dfe` "remove QuantGit security-scan theater (fake alerts + fake scan counts)" in main |
| Cross-cutting: outbox/event spine | BROKEN (infra BUILT, producers MISSING) | PARTIAL | 24 files under `apps/quantmail/backend/` now reference outbox: `lib/outbox-events.ts`, `lib/mutation-context.ts`, `lib/lifecycle-events.ts`, routes `emails.ts`/`retention.ts`, `services/email.service.ts`/`data-lifecycle.service.ts` (#597, #611). Spec'd `mail.*.v1` emission coverage + consumer starvation not re-verified |
| Cross-cutting: idempotency | MISSING | PARTIAL | `packages/server-core/src/plugins/idempotency.ts` + test, registered in `app.ts:102-105` — opt-in per-route, not global-mandatory (#582) |
| Cross-cutting: step-up auth | MISSING | BUILT | `STEP_UP_AUTH_WINDOW_SECONDS` (900s) in `packages/server-core/src/plugins/auth.ts` + test + wiring in `routes/auth.ts`, `routes/settings-tokens.ts` (#587) |
| Cross-cutting: SLOs/error budgets | MISSING | PARTIAL | `apps/quantmail/backend/lib/dependency-health.ts` per-dep health; SLO definitions/availability targets/error budgets still absent (#601) |
| Cross-cutting: remote-call timeouts | MISSING | PARTIAL | `packages/server-core/src/timeouts/timeouts.ts` systematic timeout policy (#608) |
| Cross-cutting: economy ownership | BROKEN (4 owners) | PARTIAL | `docs/quant-architecture/decisions/economy-single-ownership.md` merged (#598); code consolidation/migration unverified |
| Cross-cutting: platform adoption (inline-fetch) | BROKEN | PARTIAL | Migration to `@quant/api-client` merged (#595); full baseline re-verification pending |
| Cross-cutting: DeliveryWorker deployment | BROKEN | BROKEN (unchanged) | Still zero k8s/helm manifests reference the external SMTP `worker.ts`; QuantMail internal `services/delivery-worker.service.ts` landed (#691) but external outbound path still cannot drain on staging |
| Intake K16 capability registry | MISSING | BUILT | `packages/app-registry/src/capability-registry.ts` (#593) |
| Intake K17 resource refs/context envelope | MISSING | BUILT | `packages/app-registry/src/resource-ref.ts`, `context-envelope.ts` (#599) |
| Intake K23 QuantMeet UI | MISSING/PARTIAL | BUILT | `apps/quantchat/src/app/meet/page.tsx` + `meet/[roomId]/page.tsx` (#603) |
| Intake K25 ws-gateway → QuantChat | MISSING | BUILT | `apps/quantchat/src/hooks/useChatSocket.ts` (#594, #822 singleton) |
| Intake K27 persistent E2EE relay | MISSING | BUILT | Migration `0082_e2ee_relay_persistence` replaces in-memory relay (#602) |
| Regression REG-1 (reply "Re:" strip) | new (2026-10-10 audit) | FIXED in code | `normalizeReplySubject` normalizes to exactly one "Re:" with code comment citing REG-1 (`apps/quantmail/src/app/compose/page.tsx:19-24`) |
| Regression REG-2 (mark-unread not persisting) | new (2026-10-10 audit) | **OPEN — major regression** | No fix commit found; inbox-triage 2026-10-10 confirms unread state still not persisting. M01/M02 BUILT behavior broken |
| Regression REG-3 (search URL q= sync) | new (2026-10-10 audit) | FIX in main, live-verify pending | `router.replace` URL sync present in `apps/quantmail/src/app/search/page.tsx:182,287` (#747); audit predates current HEAD |

---

## 1. QuantMail — screens (spec: M01–M20, `12-screen-inventory.md`)

Per-screen deep specs exist in `products/quantmail/{screens,desktop,mobile,web}/` (M01–M16),
`security/` (15 files), `testing/` (16 files).

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| M01 | Inbox | BUILT | `apps/quantmail/src/app/page.tsx` (3,950 lines): `useInbox` API hook, cursor pagination, virtualizer, `Skeleton`/`InboxZeroState`, swipe actions, pull-to-refresh, keyboard nav, smart replies. **User design lock 2026-10-10:** default home is the unified People-view (`app/people/page.tsx`, `components/PeopleHome.tsx`, `PeopleWorldTabs.tsx`, `PersonThread.tsx` — PR #775; mobile follow-ups #778/#780) | REG-2 OPEN: mark-unread mutation does not persist (2026-10-10 regression audit; toast fires, inbox still "0 unread" after reload) |
| M02 | Thread | BUILT | `apps/quantmail/src/app/thread/[id]/page.tsx` → `components/ConversationalThreadView.tsx`; optimistic mutations, edge-swipe back | — |
| M03 | Compose | BUILT | `apps/quantmail/src/app/compose/page.tsx` + `components/DockedComposer.tsx`; REG-1 fixed in code (`normalizeReplySubject`, `compose/page.tsx:19-24`) | Undo-send bar only claims sent on real success (#841-related fix `c1f9fa01`) |
| M04 | Search | BUILT | `apps/quantmail/src/app/search/page.tsx`, `hooks/useSearchEmails` | — |
| M05 | Mailbox | BUILT | `app/archive\|sent\|drafts\|spam\|trash\|starred\|snoozed\|labels/page.tsx` | — |
| M06 | Attachments | BUILT | `app/drive/doc/[docId]/page.tsx` (file preview) | — |
| M07 | Contacts | BUILT | `app/contacts/page.tsx` (1,200 lines) | — |
| M08 | Calendar Day | BUILT | `app/calendar/page.tsx` (1,244 lines) | — |
| M09 | Calendar Event | PARTIAL | Only public `app/calendar/booking/[slug]/page.tsx` (booking flow for outsiders) | No in-app event-detail screen |
| M10 | Drive Browser | BUILT | `app/drive/page.tsx` (1,835 lines) | — |
| M11 | File Preview | BUILT | `app/drive/doc/[docId]/page.tsx` | — |
| M12 | QuantGit Repository | BUILT | `app/quantgit/page.tsx` (2,576 lines) + `agentlab/`, `repositories/`; mock datasets have zero production importers (honest empty states) | Fake security-scan theater (seeded fixture alerts + hardcoded scan counts) REMOVED 2026-10-11 (commit `2e9d5dfe`) |
| M13 | Universal Search | PARTIAL | `app/search/page.tsx` (mail search) | Cross-app "universal" search unverified |
| M14 | Quanty | BUILT | `components/QuantyLiveAgent/`, `QuantyLauncher.tsx`, `QuantyCopilotDrawer.tsx` (overlay surfaces; inventory lists it as a screen) | — |
| M15 | Notifications | BUILT | `app/notifications/page.tsx` + `loading.tsx` + `notifications-utils.ts` dedicated center; `components/NotificationBell.tsx` + `app/api/notifications` + `hooks/useDesktopNotifications.ts`; backend `routes/notifications.ts` real (#647, #788; honest copy + real desktop-alert path #840/#841); push delivery path wired (`packages/notifications/src/services/push-service.ts`, `push-delivery.service.ts`, #797; BOLA fix #808) | Only `new_email` rows ever produced; empty-state claims calendar/drive/security events (continuous-qa findings 231, 2026-10-11) |
| M16 | Settings | BUILT | `app/settings/page.tsx` (1,082 lines) + `MailFiltersSettings.tsx`, `VacationResponderSettings.tsx`; honest "not end-to-end encrypted" copy at `settings/page.tsx:915-919` | — |
| M17 | Security | BUILT | `app/security/page.tsx` (847 lines) | — |
| M18 | Admin Home | BUILT | `app/admin/page.tsx` (230 lines): KPI cards + service status; honest "awaiting/unavailable" when backend has no data | — |
| M19 | Admin Domains | BUILT | `app/admin/domains` route exists on origin/main (#600) | Backend mutations still unverified (admin backend row §11f) |
| M20 | Admin DLP/Audit | BUILT | `app/admin/dlp-audit` route exists on origin/main (#600) | Backend DLP/audit mutations still unverified |

**Fake clusters attached to the app surface — RESOLVED 2026-10-11 (verified on origin/main):**
`?tab=teams` / `?tab=agents` fake tabs REMOVED (PR #578); unprovable "End-to-end encrypted"
copy REMOVED — `AuthBrandPanel.tsx` gone, settings page carries honest
"NOT end-to-end encrypted" copy (`settings/page.tsx:943`), test asserts the booking page
lacks the claim (`__tests__/booking-page.test.tsx:34`).
**New fakes found since (2026-10-10/11 audits, open):** Vault page "AES-256 E2EE" pill is fake
(page itself admits client-side encryption unavailable); Settings → Security "Active Sessions"
tab is theatrical ("Only this device is active", Revoke All disabled, no fetch) and the
Connected-apps tab hardcodes a false "No apps have permission" all-clear (findings 240–241);
header dead-code `unreadNotifications=3` badge + fake defaults ("1,250 QC", "Trinity Admin")
(finding 239). **In flight:** Drive fake-removal PRs #825 (share-id bug) / #826 (fake trash
files, fake 4K/FLAC/RAW badges, fake lightbox — tests 231/231, findings 189) OPEN;
Contacts PRs #831 (contact-groups proxy), #832 (avatars/mail-history/autocomplete/dedupe)
OPEN (findings 208–212).
**New P0s (open):** Drive file previews 401 for signed-in users (media tags carry no
Authorization; fix agent lane1-fix-011, findings 190); Drive phantom duplication (single doc
create → 2 identical rows, "Others" count grows per visit — week-planning A1, 2026-10-10);
inbox Message-mode quick reply sends into a void ("Message sent!" toast, nothing in
thread/sent; `/chat` 404 suspected — inbox-triage A1).

## 2. QuantChat — screens (spec: C01–C13, inventory one-liners only; no per-screen spec docs)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| C01 | Inbox | BUILT | `app/page.tsx`: `useConversations`, `useChatSocket`, presence, pinned/archived, error/empty states | — |
| C02 | 1:1 | BUILT | `app/chat/[id]/page.tsx` (1,363 lines): socket realtime, typing indicators, delivery/read ticks | False E2E copy RESOLVED 2026-10-11: `support/page.tsx:24` now reads honest "End-to-end encryption is not enabled in QuantChat yet" (PR #586) |
| C03 | Group | BUILT | Same `chat/[id]` surface resolves group names/participants | — |
| C04 | Community | MISSING | No community route or component | Whole module missing |
| C05 | Channel | BUILT | `app/channels/page.tsx` (360 lines) | — |
| C06 | Media | BUILT | `app/camera/page.tsx` | — |
| C07 | Call | BUILT | `app/call/page.tsx` (381 lines) | — |
| C08 | Meeting | BUILT | `app/meet/page.tsx` + `meet/[roomId]/page.tsx` meeting-studio UI (PR #603); styled `/calls` + working new-call → QuantMeet verified live (customer-audit 2026-10-10) | — |
| C09 | Search | MISSING | No conversation/message search (only contact picker inside `/new-chat`) | Whole module missing |
| C10 | Quanty | MISSING | Zero "quanty" references in `apps/quantchat/src` (excl. tests) | Whole module missing |
| C11 | Notifications | MISSING | No notifications screen | Whole module missing |
| C12 | Settings | PARTIAL | `app/profile/page.tsx` hub exists | No dedicated settings screen |
| C13 | Admin | MISSING | No admin route | Whole module missing |

**Spec drift note:** code ships a Snapchat-style bottom nav (Chats/Stories/Camera/Spotlight/Map) against a
messaging-app inventory. **P0 fake RESOLVED 2026-10-11:** `/map` wired to real `chatSocket` + MapCanvas
("pins are never placed at invented positions", PR #586); false E2EE claims removed from login copy
(mobile-style audit 2026-10-10: "Messages are stored on our servers… End-to-end encryption is not
enabled yet"; "256-Bit Quantum Resistant"/"Zero-Knowledge Relay" gone).
**Regression escalated 2026-10-11 (chat-power-user F16):** realtime socket never connects; chat list
sticks on "offline" skeleton rows after reload for the rest of the session — re-verification pending
at HEAD. **Still open:** contact search P0 ("No people found", 3 consecutive runs), `/chat` 404,
AI auto-reply toggle broken, in-chat games iframes dead ("refused to connect"), no logout anywhere,
header "Profile" opens own profile (no block/report path), "Disappears in 86400s" raw countdown,
`*bold*` raw asterisks (chat-power-user F4/F5/F10/F15/A7). **Fixed live since:** reels spinner,
attach menu, emoji picker, message metadata/ticks, own-message right-alignment, styled `/calls` +
working new-call → QuantMeet, SSO first-attempt bounce (#757/#758).

## 3. QuantAI — screens (spec: A01–A13, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| A01 | Chat | BUILT | `app/page.tsx` (1,483 lines): `ModelSelector`, streaming, voice toggle, artifacts | Former duplicate `/ask` surface removed (no `app/ask/page.tsx`, no `pages/ask.tsx`) |
| A02 | Model Picker | BUILT | `components/ModelSelector.tsx` | — |
| A03 | Artifacts | BUILT | `app/artifacts/page.tsx` (427 lines) | — |
| A04 | Agent Builder | PARTIAL | `WorkflowBuilder.tsx`, `AgentCodeTerminal.tsx`, `ToolCallCard.tsx` as components | No dedicated builder screen route |
| A05 | Agent Run | PARTIAL | `WorkflowDashboard.tsx`, `AgentDashboard.tsx`, `WorkflowProgressCard.tsx` | Run UX wiring as a screen unverified |
| A06 | Approval Queue | MISSING | No approval-queue screen | Whole module missing |
| A07 | Automations | PARTIAL | Workflow components exist; `/automation` exists as legacy page `src/pages/automation.tsx` (428 lines) | No App Router automations screen; legacy page only |
| A08 | Memory | PARTIAL | `MemoryDashboard.tsx`, `ProjectMemoryManager.tsx` as components; `/memory` exists as legacy page `src/pages/memory.tsx` (519 lines) | No App Router memory screen; legacy page only |
| A09 | Model Playground | MISSING | No playground screen | Whole module missing |
| A10 | Usage | PARTIAL | `UsageAnalyticsChart.tsx` + `/plan` page backed by `/api/quanty/plan`; honest "coming soon" when no checkout URL | Upgrade flow incomplete |
| A11 | Device Control | PARTIAL | `DeviceCard.tsx`, `DevicePreview.tsx`, `plan/DevicesSection.tsx`; `/device` exists as legacy page `src/pages/device.tsx` (378 lines) | No full App Router device-control screen; legacy page only |
| A12 | Settings | BUILT | `app/settings/page.tsx` (248 lines) | — |
| A13 | Admin | MISSING | No admin route | Whole module missing |

**Fake AI surfaces — RESOLVED 2026-10-11 (PR #590, verified on origin/main):** `/voice`, `/code`,
`/translate`, `/personas`, `/device`, `/plugins`, `/models`, `/ecosystem` all call real endpoints
via `apiFetchRaw` (`/api/voice/stt`, `/api/assistant/chat`, `/api/models`, `/api/devices`,
`/api/plugins`, `/api/ecosystem/apps`); `/image-gen` is an honest "coming soon" state
("nothing is generated or previewed here yet", zero simulated generation). QAI-1 (third-party
model names) fixed in code via PR #801 (merged 2026-10-10, after the 8app-reaudit) — live-verify
pending. Honest surfaces to preserve: `/analytics`, `/connectors` (real fetches, loading/error states).
**New invented claim (open, findings 230):** logged-out pill "Quanty 3.8 Flash Active · <120ms
Voice Latency" plus marketing cards (autonomous terminal workflows, Agent & Code Mode, voice
mode, FluxGPT, Vizion OCR) — provability unverified.
**Regression (open, mobile-style 2026-10-10):** QuantAI chat worked signed-in on 2026-10-06; now
"Continue with Quant Account" → account chooser → back to signed-out view (3 retries) —
re-verification pending at HEAD.

## 4. QuantGram — screens (spec: G01–G12, inventory one-liners only)

Branding drift: source headers say "QuantNeon" (`src/pages/index.tsx:2`) while the product is QuantGram.

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| G01 | Feed | BUILT | `src/pages/index.tsx` (392 lines): stories bar, `useFeed`, infinite scroll, skeleton/empty/error states | — |
| G02 | Stories | BUILT | `src/pages/stories.tsx` + `story-viewer.tsx` | — |
| G03 | Create | BUILT | `src/pages/create.tsx` | — |
| G04 | Camera/Editor | BUILT | `src/pages/camera.tsx` | — |
| G05 | Post Detail | BUILT | `src/pages/post/[id].tsx` | — |
| G06 | Profile | BUILT | `src/pages/profile/[id].tsx` | Fabrication issues (see P0s): fake default accounts/highlights, formula views `(likes)*4+120`, fake Unsplash media injected into real posts (`ProfileView.tsx:124-175,503,507,835`) |
| G07 | Explore | BUILT | `src/pages/explore.tsx` | — |
| G08 | Reels | BUILT | `src/pages/reels.tsx` | Comments always fake (`ReelsCommentsSheet.tsx:36,82` `MOCK_COMMENTS` as default prop) |
| G09 | Messages Handoff | BUILT | `src/pages/messages.tsx` | — |
| G10 | Notifications | BUILT | `src/pages/notifications.tsx` | — |
| G11 | Creator Analytics | MISSING | Only `src/hooks/useAnalytics.ts`; no analytics page | Whole module missing |
| G12 | Admin | MISSING | No admin page | Whole module missing |

**Fake clusters — PARTIAL resolution 2026-10-11 (PR #585 merged):** CollabInvite fully gone (zero
refs repo-wide); `SocialMapView.tsx`, notes surfaces clean; fake default accounts/highlights and
formula views removed. **Survivors:** `BroadcastChannel.tsx:33,46-52` still renders hardcoded
`MOCK_MSGS` behind a fake 300ms `setTimeout` loading delay (#585 missed it); `useReels.ts:118`
still falls back to hardcoded `getGuestFeaturedReels()` (labeled for unauthenticated guests, but
used as silent fallback for logged-in users on backend failure). Honest: `shopping.tsx` fetches
real `/api/shopping/*`.

## 5. QuantWave — screens (spec: W01–W10, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| W01 | Home | BUILT | `app/page.tsx` (451 lines), react-query feed | — |
| W02 | Thread | MISSING | No thread/post-detail route; waves link only to `/compose?space=…` | Waves cannot be opened |
| W03 | Compose | BUILT | `app/compose/page.tsx` | — |
| W04 | Communities | BUILT | `app/communities/page.tsx` | — |
| W05 | Explore/Trends | BUILT | `app/trending/page.tsx` | — |
| W06 | Profile | BUILT | `app/profile/page.tsx` | — |
| W07 | Search | MISSING | No search route | Whole module missing |
| W08 | Notifications | BUILT | `app/notifications/page.tsx` | — |
| W09 | Report | MISSING | No report flow | Whole module missing |
| W10 | Admin | MISSING | No admin route | Whole module missing |

**Security hole — RESOLVED 2026-10-11:** `requireUserId()` now reads ONLY `request.auth.userId`,
401 fail-closed when absent, with an explicit "deliberately no fallback to a client-supplied
identity header… Fail closed" comment (`apps/quantwave/backend/routes/radar.ts`);
`git grep "x-user-id"` hits only the fail-closed regression test
(`backend/__tests__/radar-failclosed-identity.test.ts`). PR #576 merged. Honest:
`follow.service.ts:205` who-to-follow is real Prisma friends-of-friends.

## 6. QuanTube — screens (spec: T01–T13, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| T01 | Home | BUILT | `src/pages/index.tsx` (328 lines), paginated feed | — |
| T02 | Watch | BUILT | `src/pages/watch/[id].tsx` (674 lines): player, chapters, quality, comments, recommendations | — |
| T03 | Shorts | BUILT | `src/pages/shorts.tsx` (606 lines) | — |
| T04 | Music | PARTIAL | `src/pages/music.tsx` (778 lines) but "Lyrics sync coming soon..." (`music.tsx:667`); mock artist catalog (see P0) | Lyrics + catalog |
| T05 | Search | BUILT | `src/pages/search.tsx` (393 lines) | Fully fake results (see P0) |
| T06 | Channel | BUILT | `src/pages/channel/[id].tsx` (631 lines) | Errors masked with fake channel (see P0) |
| T07 | Upload | BUILT | `src/pages/upload.tsx` (763 lines) | Progress fake; files never upload (see P1) |
| T08 | Studio | BUILT | `src/pages/studio.tsx` (541 lines) | — |
| T09 | Live | BUILT | `src/pages/live.tsx` (305 lines) | Metrics simulated (see P0) |
| T10 | Library | BUILT | `src/pages/library.tsx` (501 lines): History/Playlists/Watch-Later real | Downloads tab still local-mock (P2) |
| T11 | Premium | PARTIAL | `src/pages/premium.tsx`: honest "Coming Soon", never collects cards (`premium.tsx:207`) | Subscriptions not available |
| T12 | Creator Analytics | PARTIAL | `src/pages/monetization.tsx` (233 lines) | Full analytics unverified |
| T13 | Admin | MISSING | No admin page | Whole module missing |

**Fake clusters — RESOLVED 2026-10-11 (PRs #580, #584 merged, verified on origin/main):**
`live.tsx` carries an HONESTY NOTE (MOCK_STREAMS removed; reads only `GET /api/live` via apiClient);
`LiveStreamChat.tsx:79` "shown locally after the backend accepts it — never simulated"; search is
a passthrough proxy to backend `/search`; `TranscodingProgress.tsx`/`VideoUploader.tsx`/`music.tsx`
fake surfaces gone — real `services/video-transcode-pipeline.service.ts` + transcode tests exist.
Honest: SAMPLE-badge labeling (`public-videos.ts`, `pages/index.tsx:281`). Note: QuanTube's video
service is the one verified outbox producer repo-wide (`video.service.ts:433`
`await tx.outboxEvent.create({...})` inside the transaction).

## 7. QuantMax — screens (spec: X01–X10, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| X01 | Discovery | BUILT | `src/pages/discover.tsx`: category tabs, `discover.service` | — |
| X02 | Short Video | BUILT | `src/pages/index.tsx` (385 lines): ForYou/Following swipe feed | — |
| X03 | People Discovery | BUILT | `src/pages/nearby.tsx` | — |
| X04 | Match | BUILT | `src/pages/matches.tsx` + `matching.tsx` | — |
| X05 | Chat Handoff | MISSING | No chat-handoff page | Whole module missing |
| X06 | Live | BUILT | `src/pages/live.tsx` | — |
| X07 | Profile | BUILT | `src/pages/profile.tsx` | — |
| X08 | Safety | MISSING | No safety screen | Whole module missing |
| X09 | Preferences | PARTIAL | Preferences inside `profile.tsx` | No dedicated screen |
| X10 | Admin | MISSING | No admin page | Whole module missing |

No fake-data hits in production paths; `speed-dating`/`virtual-dates` are honest placeholders.

## 8. QuantCooks — screens (spec: K01–K12, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| K01 | Home | BUILT | `src/pages/index.tsx` (540 lines) | — |
| K02 | Projects | BUILT | `src/pages/projects.tsx` (274 lines), `useProjects` | — |
| K03 | Editor | BUILT | `src/pages/editor.tsx` (703 lines), `useProjectById` | — |
| K04 | Timeline | BUILT | `src/pages/canvas.tsx` (949 lines) | — |
| K05 | Assets | BUILT | `src/pages/assets.tsx` (353 lines) | — |
| K06 | AI Generation | MISSING | No AI-generation UI in `src` | Product's core loop missing |
| K07 | Render Queue | MISSING | No render queue | Product's core loop missing |
| K08 | Preview/Export | BUILT | `src/pages/export.tsx` (699 lines); polls real `GET /api/exports/[id]/status` | — |
| K09 | Templates | BUILT | `src/pages/templates.tsx` (288 lines) | — |
| K10 | Marketplace | MISSING | No marketplace page | Whole module missing |
| K11 | Creator | PARTIAL | `src/pages/projects-gallery.tsx` (248 lines) | Creator portal unverified |
| K12 | Admin | MISSING | No admin page | Whole module missing |

No live fake-data hits (AITools gating + export polling verified honest).

## 9. QuantAds — screens (spec: D01–D12, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| D01 | Advertiser Home | BUILT | `app/page.tsx` (166 lines): metric cards + campaign rows | — |
| D02 | Campaigns | BUILT | `app/campaigns/page.tsx` (232 lines): pause/delete/edit | — |
| D03 | Campaign Builder | MISSING | No `/campaigns/[id]` or builder route; `onEdit` has no destination | Edit action is a dead end |
| D04 | Creative | BUILT | `app/creatives/page.tsx` (126 lines) | — |
| D05 | Audience | BUILT | `app/audiences/page.tsx` (128 lines) | — |
| D06 | Auction/Bid | MISSING | No route | Whole module missing |
| D07 | Billing | BUILT | `app/billing/page.tsx` (181 lines) | — |
| D08 | Analytics | BUILT | `app/analytics/page.tsx` (221 lines) | — |
| D09 | Attribution | MISSING | No route | Whole module missing |
| D10 | Fraud/Review | MISSING | No route | Whole module missing |
| D11 | Payouts | MISSING | No route | Whole module missing |
| D12 | Admin | MISSING | No route | Whole module missing |

Economy surfaces (`/economy`, `/wallet`, `/store`, `/boost`, `/creator`, `/subscriptions`) fetch real
endpoints with honest "coming soon" gating — real balances only, no mock data.

## 10. Extension modules M21–M41 (doc specs; implementation not yet graded)

The `12-screen-inventory.md` lists only M01–M20, so these architecture/design extension docs have no
inventory backing (doc fix needed: extend the inventory or fold these into it).

**2026-10-11 doc-track update:** intake merge #607 added new core docs 24–34
(`24-creator-developer-platform-and-economy.md`, `24-quanty-live-agent-runtime.md`,
`25-quantads-…`, `25-quanty-voice-agent-…`, `26-quanty-universal-app-shell-…`,
`27-quanty-platform-adapters-…`, `28-quanty-task-graph-…`, `29-quanty-uiux-…`,
`30-quanty-memory-…`, `31-quanty-repository-implementation-map.md`, `32-quanty-contracts-…`,
`33-quanty-app-capability-and-tool-registry.md`, `34-quanty-platform-conformance-and-e2e-plan.md`)
and `decisions/` (economy-single-ownership, extras-retro-spec). K14 (#604) landed ~578 per-screen
spec files under `docs/quant-architecture/products/*` for all 8 non-mail products (honest
IMPLEMENTED/PARTIAL/MISSING grading; surfaced P0 gaps: QuantAI A06 Approval Queue missing,
QuantMax X08 Safety backend-only). **Doc-hygiene regression:** the merge created number
collisions — 16–25 and 33 now have 2–3 files each (e.g. `20-ecosystem-cross-app-connection-contract.md`
vs `20-m21-privacy.md` vs `20-quantmail-m01-inbox.md`; two `33-*` files including this scoreboard).
Doc-number repair is an open docs-track item.

| Module | Doc | Implementation status |
|---|---|---|
| M21 Privacy | `20-m21-privacy.md` | Not graded — no per-screen inventory; backend has partial privacy primitives (tracking-pixel stripper, DMARC evaluation) |
| M22 Globalization | `21-m22-globalization.md` | Not graded |
| M23 Developer Platform | `22-m23-developer-platform.md` | Not graded — related unspec'd code exists (`quanty-mcp.ts`, `ai-devtools.ts`, CalDAV) |
| M24 Enterprise | `23-m24-enterprise.md` | Not graded |
| M25 Compliance & Trust | `24-m25-compliance-trust.md` | Not graded — trust domain is PARTIAL (see backend §2.3) |
| M26–M35 | — | **No docs exist** (numbering jumps 24→26); inventory gap |
| M36 Workspace UIUX Foundation | `26-m36-quantmail-workspace-uiux-foundation.md` | Not graded |
| M37 QuantMail Complete UIUX | `27-m37-quantmail-complete-uiux.md`, `27-m37-quantmail-uiux-map.md` | Not graded |
| M38 QuantCalendar Complete UIUX | `28-m38-quantcalendar-complete-uiux.md`, `28-m38-quantcalendar-uiux-map.md` | Not graded |
| M39 QuantDrive Complete UIUX | `29-m39-quantdrive-complete-uiux.md`, `29-m39-quantdrive-uiux-map.md` | Not graded |
| M40 QuantDrive Memory | `30-quantdrive-memory-architecture.md` | Not graded |
| M41 Quant Memory + Cross-Product Agents | `31-quant-memory-intelligence-v2.md`, `32-quant-memory-cross-product-agent-system.md` | Not graded |

---

## 11. QuantMail — backend domains (spec: `products/quantmail/backend/`, 41 domains)

Source: `backend-gap.md` (repo @ `abfb2b35258bb765c11a34e660cb588cea2d58a3`). Status key:
BUILT / PARTIAL / MISSING / BROKEN as in the header.

### 11a. Inbox / Compose / Thread

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Inbox API | `api.md` | PARTIAL | `GET /emails`, `GET /threads`, `GET /emails/changes`; thread commands (archive/restore/delete/read/unread/star/labels) in `routes/emails.ts:810-1466`, `routes/threads.ts` | No `expectedVersion` / `THREAD_VERSION_CONFLICT` (zero hits repo-wide); no `requestId` in responses; no idempotency keys on retryable mutations |
| Compose | `compose-api.md`, `compose-domain.md`, `compose-data-model.md` | PARTIAL | Draft create/update/send/delete; undo-send 30s window | No `mail.draft.prepare_send` two-phase flow / preparation token / `confirmation`; no `SEND_ALREADY_ACCEPTED` / `PREPARATION_EXPIRED` / `DRAFT_VERSION_CONFLICT`; no `idempotencyKey` on update/send |
| Thread | `thread-api.md`, `thread-domain.md`, `thread-data-model.md`, `threading-message-id.md` | PARTIAL | Thread get/list/mute/unmute/read; In-Reply-To/References stitching (`thread.service.ts`, `email.service.ts` `stitchInbound`) | No `mail.message.get_body` with `safe_html`/`text` representations (raw body); no `mail.thread.create_calendar_event` / `mail.thread.save_attachment_to_drive`; no `ATTACHMENT_NOT_AVAILABLE` / `SECURITY_BLOCKED` typed errors |

### 11b. Delivery pipeline (M13)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Delivery API/domain | `delivery-api.md`, `delivery-domain.md`, `delivery-data-model.md`, `delivery-events.md`, `delivery-rate-abuse.md` | PARTIAL | BullMQ `outbound-delivery` queue (`outbound-delivery.service.ts:25`); `DeliveryWorker` DKIM-signs, resolves MX, transmits SMTP, per-recipient `DeliveryAttempt` rows (`schema.prisma:3310`), state machine `draft→queued→deferred→sent→{bounced,delivered}`; fails closed without DKIM keys (`worker.ts:13-16`); suppression pruning | No `mail.send.prepare`/`confirm`/`status`/`cancel`; no `mail.delivery.get`/`events`; **zero** `mail.outbound.*.v1` events emitted; state vocabulary diverges (`SUBMITTED`/`CANCELLED`/`FAILED` absent); **no per-user/per-domain/org sending limits**; no provider health-check endpoint |
| SMTP outbound | `smtp-outbound.md` | PARTIAL | `SmtpTransport` provider abstraction; `classifySmtpCode`; single queue owner (no double-send); SES fallback | No deterministic idempotency key on outbound message; bounded-exponential-backoff-with-jitter retry config not evidenced in worker options |
| SMTP inbound | `smtp-inbound.md` | PARTIAL | `services/smtp-inbound` → webhook → `InboundIngestAdapter`: DMARC/SPF/DKIM evaluation, spam classification, thread stitching, Message-ID dedup | SPF/DKIM/DMARC evaluated only in backend, not at SMTP edge; no TLS-policy / connection-rate checks in the edge service |
| IMAP sync | `imap-sync.md` | PARTIAL | One-shot import (`ImapImporterService`, `POST /emails/import/imap`, `GET /emails/import/imap/status/:jobId`) | No UIDVALIDITY/last-UID cursors, incremental sync, reconnect/recovery, `mail.imap.sync_status` |
| Bounce & complaint | `bounce-complaint.md` | BUILT | SES SNS webhook (`routes/inbound-webhook.ts:527-601`): permanent bounce → suppression, complaint → suppression; 422 `RECIPIENT_SUPPRESSED` at send time | — |
| Queue reliability | `queue-reliability.md` | PARTIAL | Durable BullMQ queues; DLQ support in `@quant/queue` (`packages/queue/src/dead-letter.ts`) | No queue depth/age observability endpoint; no replay tooling; bounded-retry policy on mail queues not evidenced |
| Mail authentication | `authentication-mail.md` | PARTIAL | DKIM key provisioning + signing in controlled outbound boundary; DMARC aggregate-report ingest (`POST /deliverability/dmarc-reports`); `GET /deliverability/stats`; private keys out of logs/API | — |

### 11c. Trust & safety (M14)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Trust API/domain | `trust-api.md`, `trust-domain.md`, `trust-events.md`, `trust-data-model.md`, `trust-feedback.md` | PARTIAL | `POST /emails/:id/detect-phishing`, `GET /emails/:id/reply-suggestions`; AI security scan service; inbound spam/phishing signals | All five spec'd user APIs missing (`mail.security.get_message_assessment`, `get_sender_assessment`, `report`, `release_quarantine`, `mark_not_spam`); all five admin APIs; `security_assessments` / `reputation_subjects` / `quarantine_items` / `security_reports` tables absent; all `mail.security.*.v1` events absent |
| Abuse engine | `abuse-engine.md` | PARTIAL | Rate-limit middleware; suppression lists | Rate limiter is **in-memory** (`middleware/rate-limit.ts:9` — broken across replicas); no warn / step-up-auth / restrict-sending / temporary-block / escalate actions; no recovery/review paths; no velocity signals |
| Quarantine | `quarantine.md` | PARTIAL | DMARC-fail → spam-folder routing (`InboundIngestAdapter.shouldQuarantine`, `inbound-ingest.service.ts:257-331`) | No `QUARANTINED/REVIEWABLE/RELEASED/EXPIRED/DELETED` state machine; no idempotent release command; no quarantine list/release API |
| Phishing/URL intel | `phishing-url.md` | PARTIAL | Tracking-pixel stripper (`tracking-pixel-stripper.service.ts`); AI security scan | No isolated URL-inspection sandbox (network-restricted, timeouts/redirect limits) |
| Attachment security | `attachment-security.md` | PARTIAL | Upload → type/size validation → malware scan → block infected (`routes/attachments.ts:156-168`, `attachment-scanner.service.ts`); scanned-proxy download | No inbound attachment scanning before inbox delivery (only SES-path verdicts); no scan-result versioning/expiry; no sandbox |

### 11d. Search (M12)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Search | `search-api.md`, `search-api-production.md`, `search-domain.md`, `search-index.md`, `search-ranking.md`, `search-semantic.md`, `search-production.md`, `search-events.md` | PARTIAL | `GET /search/emails\|drive\|documents\|all\|parse`; Gmail-style query parser; PG GIN full-text/trigram indexes (`search-query.service.ts:255-257`, migration 0067) | Response lacks `domainStatus`, `indexFreshness`, `rankingReason`, opaque `cursor`; **outbox→CDC→projection→index pipeline dead** (backend writes no outbox rows); backend search bypasses Meilisearch/Qdrant entirely (infra deploys both, code never queries them); event names don't match spec; no reindex/repair API; no per-domain failure isolation |

### 11e. Context domains

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| People | `people-api.md`, `people-context.md`, `people-events.md` | PARTIAL | Contacts CRUD + search/frequent/directory/import(vcard/csv/imap)/export/dedup/merge (16 routes); `GET /ai/contact-context/:email` | No spec'd `mail.participant.context` contract shape; no `create_contact_intent` / `attach_contact` workflow commands; no `contacts.contact.*.v1` consumption |
| Calendar | `calendar-api.md`, `calendar-context.md`, `calendar-events.md` | PARTIAL | Full CRUD + RSVP + ICS import/export + booking links + CalDAV/CardDAV protocol server (31 routes, `routes/dav.ts`) | No `mail.thread.calendar_context` query; no `calendar.event.*.v1` consumption |
| Drive | `drive-api.md`, `drive-context.md`, `drive-events.md` | PARTIAL | 43 routes: quota, shares, versions, trash/restore/purge, chunked + multipart uploads, thumbnails | No `mail.attachment.prepare_download` (short-lived scoped capability), `prepare_preview` gating, `mail.attachment.save_to_drive` orchestration |
| Quanty | `quanty-api.md`, `quanty-data-model.md`, `quanty-runtime.md` (+ `products/quantmail/quanty-*.md`) | PARTIAL | Task API: create/get/stream/interrupt/confirm/undo, approvals/activity/schedule/browser-tasks/identity/status (13 routes); `AgentSession` model (`schema.prisma:2033`); AI mail tools as REST mapping to spec'd tool names. **2026-10-11 upgrades:** high-risk approval is now a BLOCKING DURABLE gate (`services/quanty-orchestrator/src/approval-engine.ts`, `confirmation-engine.ts`, #800); protocol-compliant MCP gateway (Streamable HTTP) in front of quant-tools (`packages/quant-tools/src/mcp/mcp-gateway-server.ts`, #796); connect-once OAuth + capability token (#799); confirmation-gated native tool dispatch (#794) with real read-only mail handlers (`executor/tool-executor.ts`, `handlers/mail-read-handlers.ts`, #795); real contacts/calendar/drive tools (#785–#787); native visible agent mode UI (`QuantyToolTimeline.tsx`, `QuantyCommandBar.tsx`, `QuantyConfirmationCard.tsx`, #805); `packages/quanty-observability/` trace/metric contracts + redaction (#811); `services/quanty-navigation/` registry/router/handoff (#812); drawer history is ephemeral, no localStorage plaintext transcripts (#798) | No spec session API (`quanty.session.create/message/get`); `AgentTask`/`AgentStep`/`Approval`/`VerificationRecord`/`MemoryCandidate` tables absent; tools bypass the agent runtime's policy/approval layer (direct REST; spec: every tool declares risk class, idempotency, verification method) |

### 11f. Settings / attention / admin / audit

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Settings | `settings-api.md`, `settings-domain.md`, `settings-events.md`, `settings-data-model.md` | MISSING | Only `POST/GET/DELETE /settings/tokens` (external API tokens) | No `settings.catalog` / `settings.get` / `settings.update` (no versioned federated settings); no `devices.list`/`revoke`; no `sessions.list`/`revoke`/`revoke_all`; no `mail.settings.updated.v1` |
| Attention | `attention-api.md`, `attention-domain.md`, `attention-events.md` | PARTIAL | `GET /notifications`, `POST /notifications/read-all`, `PATCH /:id/read`, `DELETE`; `routes/notifications.ts` real new-email arrival notifications (#647; dead facade removed #788); due call-alarms wired to the notification center (#841) | No `markUnread`, `resolve`, `dismiss`, `bulkMarkRead`, `preferences.get/update` (channels/quiet hours/batching), `delivery.register/revoke`, server deep links, all `attention.*.v1` events |
| Admin | `admin-api.md`, `admin-domain.md`, `admin-events.md` | PARTIAL | 4 read-only GETs with staff-role gate (`admin.ts`) | Every mutation missing: `admin.mail.domains.create/update/verify`, `mailboxes.suspend/restore`, `aliases.*`, `groups.*`, `policies.*`, `retention.*`, `quotas.*`, `audit.list`; no `mail.*.v1` admin events |
| Audit lifecycle | `audit-lifecycle.md` | BROKEN | `AuditLog` model + `AuditService` + `GET/POST /audit-logs` exist | **`POST /audit-logs/` lets any authenticated client write arbitrary audit records** (`routes/audit-logs.ts:111-141`), while **server-side mutations never write audit records** (only the POST handler + quanty git-tools write). Contradicts spec: "Audit records are append-oriented and protected from ordinary product mutation" |

### 11g. Data lifecycle & compliance (M15)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Retention | `retention.md` | PARTIAL | `RetentionService` + `GET/POST /retention/policies`, legal-holds CRUD | No retention **workers** identifying eligible records (no scheduled job); no cascade to derived systems (search/vector/caches); no per-data-class independent periods |
| Holds | `holds.md` | PARTIAL | Hold place/list/release/check API; deletion path honors holds (`routes/emails.ts:1311-1316`) | Falls back to **in-memory** hold store (`memoryLegalHolds`) when Prisma model absent; scope is custodian-email only, not spec's user/mailbox/thread/message/date-range/data-class scopes |
| Deletion | `deletion.md` | MISSING | — | No deletion state machine (`DELETE_REQUESTED→VALIDATING→SCHEDULED→ERASING→VERIFIED`); no deletion workers/jobs; no verification across search/vector/caches/object storage |
| Export | `export.md` | MISSING | Only contact vcard/csv and single-document export | No async export lifecycle (`REQUESTED→AUTHORIZING→PREPARING→READY→EXPIRED`); no manifest; no short-lived download capability |
| Backup/restore | `backup-restore.md` | PARTIAL | `createSnapshot` (`backup-snapshot.service.ts`); `infra/k8s/backup-schedule.yaml` | No encrypted/versioned/integrity-checked/tested-restore properties; no restore workflow (isolated env → validate → reconcile → cutover) |
| Data lifecycle | `data-lifecycle-domain.md`, `derived-data-lifecycle.md` | PARTIAL | Soft-delete (`deletedAt`) on mail | No lifecycle coordinator; no derived-data invalidation on source deletion (nothing emits it) |
| Lifecycle events | `lifecycle-events.md` | MISSING | — | Zero `data.export.*` / `data.deletion.*` / `data.retention.*` / `data.hold.*` events |

### 11h. Reliability & ops (M16)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Degraded modes | `degraded-modes.md` | PARTIAL | Outbound queues when busy; honest 202/503s; health never fabricates | No declared per-dependency degraded behaviors; no search-unavailable reporting; no "fail closed for mutations" enforcement when Postgres degraded |
| Health/dependencies | `health-dependencies.md` | PARTIAL | `/health`, `/api/health/detailed` (real Postgres probe) | 10/12 spec'd dependencies untracked; no latency/error-rate/timeout-rate/circuit-state/last-success per dep |
| Observability | `observability.md` | PARTIAL | Structured pino logs, request-id plugin, metrics plugin, OTel seam; privacy rule honored (no bodies/tokens in logs) | Per-dep health + SLOs missing |
| Reliability events | `reliability-events.md` | MISSING | — | Zero `reliability.*.v1` events |
| SRE SLOs | `sre-slos.md` | MISSING | — | No SLO definitions, availability/latency targets, or error budgets |
| Incident response | `incident-response.md` | MISSING | — | No incident records, commander assignment, or review artifacts |
| Runbooks | `runbooks.md` | MISSING | — | None of the 14 required runbooks in repo |
| DR / RPO-RTO | `dr-rpo-rto.md` | MISSING | — | No RPO/RTO definitions per data class or journey; no DR-mode runbooks |
| Inbox-mutation workflow | `workflows/inbox-mutation.md` | BROKEN | Archive handler (`routes/emails.ts:810-828`) | No `expectedVersion` (step 5), no transaction (step 6), no outbox append (step 7), no event publish (steps 10–11), no audit (step 14), no `requestId`; concurrent edits silently overwrite (spec: `THREAD_VERSION_CONFLICT`). Same pattern across all mail mutations |
| Domain map / projections | `domain-map.md` | PARTIAL | Ownership boundaries respected in code | `mail_thread_list` / `mail_unread_counts` / `mail_folder_counts` / `mail_label_counts` projections computed live via Prisma; no projection rebuild path |

**Backend totals: BUILT 2 (bounce-complaint; identity/auth-08) · PARTIAL 32 · MISSING 9 · BROKEN 2 = 45.**

---

## 12. Cross-cutting scoreboard (platform contracts)

| Contract | Spec | Status | Evidence | Gap |
|---|---|---|---|---|
| Outbox / event spine | `05-data-and-event-architecture.md`: "write domain state and outbox record in one transaction; publish asynchronously" | PARTIAL (was BROKEN at 2026-10-08; producers now exist) | `outbox_events` table (`schema.prisma:1474`), `OutboxPublisher` (`packages/data-plane/src/outbox.ts`), `services/cdc-relay` poller, `services/search-indexer` consumer all exist; **mail backend now writes outbox rows**: `lib/outbox-events.ts`, `lib/mutation-context.ts`, `lib/lifecycle-events.ts`, routes `emails.ts`/`retention.ts`, `services/email.service.ts`/`data-lifecycle.service.ts` (24 files reference outbox, #597, #611) | Spec'd `mail.*.v1` emission coverage not re-verified; consumer starvation (CDC relay → signal-projector → search-indexer) not re-verified; real-time fan-out still partly direct Redis pubsub + synchronous cross-service calls |
| Economy ownership | `03-product-boundaries-and-domains.md`: "QuantTrinity owns economy policy only" | PARTIAL (was BROKEN; decision doc merged) | `docs/quant-architecture/decisions/economy-single-ownership.md` (#598) | Code consolidation/migration of `packages/payments`, `packages/credits`, `packages/quant-economy`, `packages/creator-economy` (+ `quant-commerce`) and `apps/quantmail/backend/modules/billing/` unverified |
| Platform adoption | `00-architecture-charter.md`: "platform owns reusable primitives; products may consume them but may not bypass them" | PARTIAL (was BROKEN; remediation merged) | Migration of inline `fetch()` to `@quant/api-client` merged (#595) | Full re-baseline (253 bypasses in 88 files) not re-verified; 8 single-consumer platform packages and 8 copy-pasted `src/mobile/` layers / `AuthGuard` copies still open (K7) |
| Idempotency | `15-definition-of-done.md` backend checklist | PARTIAL (was MISSING) | `packages/server-core/src/plugins/idempotency.ts` + test, registered in `app.ts:102-105` (#582) | Middleware is opt-in per-route, not global-mandatory; mail-mutation `Idempotency-Key` adoption unverified |
| SLOs / error budgets | `10-reliability-observability.md`, `sre-slos.md` | PARTIAL (was MISSING) | `apps/quantmail/backend/lib/dependency-health.ts` per-dep health (#601); systematic remote-call timeouts `packages/server-core/src/timeouts/timeouts.ts` (#608) | No SLO definitions, availability/latency targets, error budgets, or circuit breakers evidenced |
| Auth: `?token=` bearer | Security baseline | PARTIAL (was BROKEN; platform fix merged) | `requireAuth()` accepts only `Authorization: Bearer` header and `quant_access_token` cookie — "Query-string tokens (?token=) are NOT accepted" (`packages/server-core/src/plugins/auth.ts`); test asserts a valid JWT via `?token=` is rejected (`__tests__/app.test.ts`) (#579) | **Residual carve-out:** `apps/quantmail/backend/routes/thread-realtime.ts:15,43-44` still accepts `?token=` as session token; `sse-transport.ts` has a token path |
| Auth: SSO ticket "verification" | `08-identity-security-trust.md` | RESOLVED (was BROKEN) | Old `verifyHandoffTicket` renamed `decodeUnverifiedHandoffTicket`; new `verifyTokenWithUserInfo` re-verifies the candidate token against `/api/auth/userinfo`, and `consumeHandoffTicket` only stores session from the server-verified userinfo response (`UniversalSSOTokenBridge.ts:304,335,438-459`) (#583) | — |
| Auth: impersonation | `08-identity-security-trust.md` | RESOLVED (was BROKEN) | `requireUserId()` reads only `request.auth.userId`, 401 fail-closed, no client-supplied identity fallback (`apps/quantwave/backend/routes/radar.ts`) (#576) | — |
| Auth: step-up | `settings-api.md`, `abuse-engine.md` | BUILT (was MISSING) | `STEP_UP_AUTH_WINDOW_SECONDS` (900s) in `packages/server-core/src/plugins/auth.ts` + `__tests__/step-up-auth.test.ts` + wiring in `routes/auth.ts`, `routes/settings-tokens.ts` (#587) | — |
| DeliveryWorker deployment | `delivery-domain.md` | BROKEN (code BUILT, deployment MISSING) — unchanged 2026-10-11 | `apps/quantmail/backend/worker.ts` entrypoint correct (DKIM-sign → MX → SMTP, fails closed without `DomainAuthKey`); QuantMail internal delivery added (`services/delivery-worker.service.ts`, #691 delivers to QuantMail recipients; inbound pipeline + honest SES #684) | **Zero** k8s/helm manifests reference the external SMTP worker — queue fills, nothing drains it; external outbound mail cannot work on staging. WS gateway manifest landed (#790 `infra/k8s/staging-ws-gateway.yaml`) but not the DeliveryWorker |

---

## 13. Khamiyan backlog — phase-mapped (per `14-build-order.md`)

Security P0s (radar impersonation, SSO ticket, `?token=`) are owned by the fake-removal wave.
What follows are the structural items, in build-order phase sequence.

### Phase 1 — platform kernel

**2026-10-11: all merged.** (K2 keeps a residual `?token=` carve-out in `thread-realtime.ts`/`sse-transport.ts` — see §12.)

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K1 | Outbox/event spine dead — mail backend writes zero outbox rows (§12) | backend-gap §1a | DONE — #597, #611: `lib/outbox-events.ts`, `lib/mutation-context.ts`, `lib/lifecycle-events.ts`, outbox writes in `routes/emails.ts`/`retention.ts`, `services/email.service.ts`/`data-lifecycle.service.ts`; §12 upgraded to PARTIAL |
| K2 | `?token=` bearer acceptance (§12) | deepdive §C | DONE — #579 (fake-removal wave S3): platform fallback removed, rejection test in `server-core/__tests__/app.test.ts`; residual carve-out flagged in §12 |
| K4 | No global idempotency middleware | backend-gap §1e, deepdive §C | DONE — #582: `packages/server-core/src/plugins/idempotency.ts` (opt-in per-route); §12 → PARTIAL |
| K5 | 253 inline-fetch bypasses of `@quant/api-client` | structure-gap §V1 | DONE — #595: migration to `@quant/api-client` merged; full re-baseline pending |
| K6 | No step-up authentication | backend-gap §1b | DONE — #587: 900s step-up window plugin + tests; §12 → BUILT |
| K8 | Duplicate packages: two PrismaClient singletons; `payment`/`payments`; `recommendation`/`recommendations` | structure-gap §D1/D2/D5 | DONE — #591 |
| K7 | Per-app `src/mobile/` copy-paste (8×); per-app `AuthGuard` (8×); dead `ErrorTracker`; unwired `packages/quant_flutter/` | structure-gap §M1/M2/D4/D7/X1/X2 | **STILL OPEN** — dead `ErrorTracker` + `packages/quant_flutter/` removed via #589; per-app `src/mobile/` copy-paste and 8 diverged `AuthGuard` copies NOT consolidated |

### Phase 2 — QuantMail reference

**2026-10-11: all merged.**

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K9 | M19 Admin Domains + M20 Admin DLP/Audit missing | uiux-gap §1 | DONE — #600: `app/admin/domains` + `app/admin/dlp-audit` routes; backend `routes/admin.ts` (admin domains, DLP refs). Screen statuses → BUILT (§1) |
| K10 | M09/M13/M15 partial (event detail, universal search, notifications center) | uiux-gap §1 | DONE — #596: `routes/notifications.ts` + follow-ups #647/#685/#788/#840/#841; M15 → BUILT (§1) |
| K1b | Backend PARTIAL domains with highest value: outbox (K1), `expectedVersion`/`THREAD_VERSION_CONFLICT` + `requestId`, server-side audit writes + close client-writable `POST /audit-logs`, settings catalog + device/session management, trust/quarantine APIs + tables | backend-gap §2, §4 | PARTIAL — outbox + `lib/mutation-context.ts` (optimistic concurrency + request IDs, #614) + `data-lifecycle.service.ts` versioned lifecycle events (#611) merged. **Still open:** client-writable `POST /audit-logs` (§11f BROKEN), settings catalog + devices/sessions management (§11f MISSING), trust/quarantine user+admin APIs + tables (§11c) |

### Phase 4 — cross-product backbone

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K11 | Economy 4 owners → single ownership | structure-gap §D3, backend-gap §1c | DONE (decision) — #598 `decisions/economy-single-ownership.md` merged; code consolidation/migration unverified; §12 → PARTIAL |

### Phase 9/10 — reliability & scale

**2026-10-11: both merged.**

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K12 | No SLOs/error budgets/circuit breakers; 10/12 deps untracked | backend-gap §1d/§2.8 | DONE — #601: `apps/quantmail/backend/lib/dependency-health.ts` per-dep health; §12 → PARTIAL (SLO definitions/error budgets still absent) |
| K13 | Remote-call timeouts not systematic | backend-gap §1d | DONE — #608: `packages/server-core/src/timeouts/timeouts.ts` systematic timeout policy |

### Docs track (parallel, PR-only)

**2026-10-11: both merged; one new hygiene item opened by the intake merge.**

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K14 | 8 products have only one-line inventories; 7 doc planes missing; numbering collisions (16–21, 27, 28); M26–M35 gap; `docs/` root sprawl (~35 ad-hoc files) | structure-gap §4, uiux-gap §A | DONE — #604: ~578 per-screen spec files under `docs/quant-architecture/products/*` with honest IMPLEMENTED/PARTIAL/MISSING grading |
| K15 | Extras Part B: ~70 unspec'd UI routes + ~60 extra backend route files | extras-to-remove.md Part B | DONE (decision) — #605 `decisions/extras-retro-spec.md` merged (keep+spec vs remove per item) |
| K29 | Doc-number collisions from intake merge #607: 16–25 and 33 have 2–3 files each (e.g. `20-ecosystem-…` vs `20-m21-privacy.md` vs `20-quantmail-m01-inbox.md`; two `33-*` incl. this scoreboard) | refresh 2026-10-11 | OPEN — doc agents: repair numbering; doc-number references in this scoreboard are ambiguous until then |

---

## 14. Extras register — disposition

Source: `extras-to-remove.md` (2026-10-07). "Extra" = shipped in code/site but NOT covered by
`docs/quant-architecture/` specs. Disposition: **keep+spec** (write the spec first, then it stops
being an extra) or **remove** (PR per product).

**2026-10-11:** Part A REMOVED via PR #589 (verified on origin/main — all items gone; `?token=`
residual carve-out in `thread-realtime.ts`/`sse-transport.ts` noted in §12). Part B disposition
decided: `decisions/extras-retro-spec.md` merged via PR #605 (keep+spec vs remove per item).

### Part A — SAFE TO DELETE (dead, duplicated, or junk; zero live users verified)

**REMOVED 2026-10-07 via PR #589** (verified `git ls-tree origin/main`):

| Item | Path | Disposition |
|---|---|---|
| Stray nested checkout dir (byte-identical doc) | `apps/quantmail/backend/Quant-Ecosystem/` | remove |
| Agent scratch at repo root (`AGENT_MEMORY.md` 3,906 lines, `GLOBAL.md`, `GOAL.md`, `khamiya.md`, `commit_msg_wave39.txt`, `test-msg.json`, `stryker.conf.mjs`, `build-and-push.*`, `deploy-agents.sh`, `apk testing/`, `android-project/`) | repo root | remove |
| One-off operator JSON blobs | `infra/mcp/` (~20 files) | remove |
| Scratch in scripts (`__pycache__`, task notes) | `scripts/` | remove |
| Dead `ErrorTracker` class (zero external users) | `packages/observability/src/core/error-tracker.ts` | remove |
| Unwired Dart workspace | `packages/quant_flutter/` | remove |
| Empty baseline | `scripts/dead-packages-baseline.json` | remove |
| Never-rendered legacy dataset | `apps/quantmail/src/components/DriveSubViews.tsx:1456` (`_sampleFeedItems`) | remove |
| Dead redirect shells | QuantMail `app/repos/`, `app/codehub/` | remove |
| Duplicate shop surfaces | QuantGram `/shop` + `/shopping` | remove (keep one) |
| Duplicate chat surface | QuantAI `/ask` | remove |
| ERP strays (invoices, crm-pipeline, seating-chart, ticket-checkin, price-book-quote, booking buffers, sms, external-sync, remote-file-ingest, agent-bus-mail-delivery) | `apps/quantmail/backend/` | remove (verify zero importers at PR time) |
| Phone OTP endpoints (auth overhaul removed phone login; these remain) | `apps/quantmail/backend/routes/phone.ts` | needs one product decision, then remove or keep+spec |
| In-memory federation (evaporates on restart) | `apps/quantmail/backend/routes/federation.ts` | remove or rebuild properly |

### Part B — NEEDS DISCUSSION (keep+spec vs remove; fake-data clusters are P0 in the fix queue)

| Area | Items | Lean |
|---|---|---|
| QuantMail UI | `/marketing`, `/postcards`, `/pipelines`, `/lab/*`, `/workspaces`, `/help`, `/privacy`, `/terms`, `/invite/*`, `/groups/join/*`, `/sso`, auth pages | keep+spec (mostly legitimate) |
| QuantChat UI | `/stories`, `/spotlight`, `/memories`, `/reels`, `/map` (P0 fake), `/camera`, `/new-chat`, `/profile`, `/privacy`, `/support`, `/terms`, `/login` | Snapchat paradigm is spec drift — product decision; `/map` fake is P0 regardless |
| QuantAI UI | `/feed`, `/goals`, `/ideas`, `/plan`, `/voice` (P0 fake), `/connectors`, `/profile`, `/ask` + gamification components + 13 fake `src/pages/` routes | P0 fakes in fix queue; rest keep+spec |
| QuantGram UI | `/games`, `/shop`, `/map`, `/notes`, `/collab`, `/broadcast`, `/close-friends`, `/guides`, `/highlights`; "QuantNeon" header rename | keep+spec or remove per item |
| QuantWave UI | `/bookmarks`, `/spaces` | keep+spec (small) |
| QuanTube UI | `/podcasts`, `/shows`, `/playlist/[id]` + fake-data cluster (P0) | P0 fakes in fix queue; rest keep+spec |
| QuantMax UI | `/challenges`, `/create`, `/creator-fund`, `/group-rooms`, `/videochat`, `/profile-detail` | keep+spec or remove per item |
| QuantCooks UI | `/brand-kit`, `/collaborate` | keep+spec |
| QuantAds UI | `/economy/*` (6 routes, honest "coming soon") | keep+spec |
| QuantMail backend extras | ai-devtools, e2ee relay, federation, workspaces, invoices, contact-groups, email-templates, quanty-mcp, dav, `/infra/*` utils, extra AI endpoints, `modules/company`, ERP services, agent-bus-mail-delivery, phone.ts | keep+spec (likely user-directed) except ERP strays → remove |
| Other apps' backend extras (~60 route files) | QuantChat ~20, QuantAI ~30, QuantGram 8, QuantWave 4, QuanTube 8, QuantMax 9, QuantCooks 5, QuantAds 9 | keep+spec or remove per item |
| Structure moves | `src/mobile/` ×8 → one platform package; `modules/company`, `modules/billing`, `modules/code` layering; `payment`/`payments`, `recommendation`/`recommendations`; economy sprawl; `imap-server`, `smtp-submission`, `dns-poller` services | move/merge per §13, don't just delete |

---

## Architecture-branch intake — 2026-10-08 (branch `architecture/quant-company-system-v1`)

The other agent's deep-architecture branch added 26 files to `docs/quant-architecture/` that
main did not have. This PR wires them into main. Each new spec area was spot-audited against
`origin/main` implementation (existence checks via `git grep`/`git ls-tree`, not a full re-audit).

### New top-level ecosystem contracts

| Doc | Specifies | Verdict | Evidence |
|---|---|---|---|
| 20 — Cross-app connection contract | 8-step typed handoff, ownership law (no product writes another's tables) | MISSING | No typed cross-app handoff in code; app switcher is visual links only |
| 21 — App capability registry | Machine-readable, versioned capability registry w/ risk tiers, idempotency, approvals | BUILT (was MISSING) | `packages/app-registry/src/capability-registry.ts` (+ `capabilities.ts`, `capability-types.ts`) — intake K16 DONE via PR #593 |
| 22 — Resource/context contract | `QuantResourceRef`, `QuantContextEnvelope`, context budget | BUILT (was MISSING) | `packages/app-registry/src/resource-ref.ts`, `context-envelope.ts` — intake K17 DONE via PR #599 |
| 23 — Event spine runtime (EC-03) | Canonical event envelope, runtime laws, verification events | PARTIAL | Outbox + CDC relay + signal-projector exist (`packages/data-plane/src/outbox.ts`, `services/cdc-relay`, `services/signal-projector`); mail-backend outbox producers landed 2026-10-11 (#597, #611 — see §12); wire envelope lacks EC-02 context fields (doc's own §1 finding; intake K18 still open) |

### New QuantChat deep specs (`products/quantchat/`, 20 files)

| Doc | Specifies | Verdict | Evidence |
|---|---|---|---|
| 02 screen-by-screen C01–C13 | Target architecture per screen | — | Meta-doc; graded per screen below |
| C01 Inbox / C02 1:1 (03) | Inbox + 1:1 deep arch | PARTIAL | `/chat`, `/new-chat` routes exist; typing indicators + realtime transport missing (gap audit) |
| C03 Group / C04 Community / C05 Channel (04) | Community/channel deep arch | PARTIAL | `/channels` exists; community/channel depth partial per gap audit |
| C06 Camera/Stories/Spotlight/AR (05) | Media capture + AR | PARTIAL | `/camera`, `/stories`, `/spotlight`, `/reels` routes exist; AR missing |
| C07 Calls (06) | Calling deep arch | PARTIAL | Backend LiveKit token issuance real + fail-closed (`apps/quantchat/backend/routes/calls.ts`); device handoff/recording/captions unverified |
| C08 QuantMeet (07) | Full meeting subsystem | BUILT (was PARTIAL) | `backend/routes/meetings.ts` + `apps/quantchat/src/app/meet/page.tsx` + `meet/[roomId]/page.tsx` meeting-studio UI (PR #603, 2026-10-11); styled `/calls` + working new-call → QuantMeet verified live |
| C09 Search (08) | Unified search | MISSING | No `/search` route in `apps/quantchat/src/app/` |
| C10 Quanty (09) | AI home + tool execution | MISSING | No `/quanty` route |
| C11 Notifications (10) | Notification center | MISSING | No `/notifications` route |
| C12 Settings/privacy/devices (11) | Full settings | PARTIAL | `/privacy` exists; account/devices/sessions/security surfaces missing |
| C13 Admin/operations (12) | Admin console | MISSING | No `/admin` route |
| 13 C01–C13 implementation contract | Domain/entity/command mapping | — | Meta-doc; not graded |
| 14 DB domain schema contract | Postgres schema, E2EE storage boundary | PARTIAL | Chat Prisma schema exists; E2EE relay is **in-memory** (`lib/e2ee-relay.ts`: "no new persistent database schema") |
| 15 API/event/websocket contract | Endpoint + WS contract | PARTIAL | REST routes exist; `services/ws-gateway` **not wired** into QuantChat (zero references) |
| 16 E2EE multidevice crypto | Device identities, ratchet/group keys, recovery | PARTIAL | Client-side `@quant/encryption` engine + zero-knowledge relay (`lib/e2ee-relay.ts`); ratchet lifecycle + multi-device recovery unverified |
| 17 WebRTC SFU media | STUN/TURN, simulcast, recording | PARTIAL | LiveKit credential wiring fail-closed (`LIVEKIT_API_KEY/SECRET`); SFU deployment in staging unverified |
| 18 Offline-first sync | CRDT/sync engine, multidevice | PARTIAL | `apps/quantchat/src/mobile/offline-sync.ts` exists (mobile only); full multidevice sync missing |

**Intake counts (refresh 2026-10-11):** 4 top-level contracts (2 BUILT / 1 PARTIAL / 1 MISSING) + 16 graded
QuantChat areas (1 BUILT / 8 PARTIAL / 7 MISSING / 0 BROKEN).

### Khamiyan backlog additions (phase-mapped per 14-build-order.md)

**2026-10-11 intake khami status:** K16 (#593), K17 (#599), K23 (#603), K25 (#594, #822),
K27 (#602) are DONE. Remaining open: K18 (EC-02 context wired into the event envelope — the
envelope in `packages/data-plane/src/outbox.ts` may still lack EC-02 context fields), K19–K22
(QuantChat C09 search / C10 Quanty / C11 notifications / C13 admin), K24 (C12 full settings —
account/devices/sessions/security), K26 (offline-first multidevice sync beyond mobile), K28
(verify LiveKit SFU deployment in staging).

- **Phase 1 (platform spine):** K16 — implement EC-01 capability registry (doc 21) — DONE #593;
  K17 — implement `QuantResourceRef`/`QuantContextEnvelope` types + adoption (doc 22) — DONE #599;
  K18 — wire EC-02 context into the event envelope (doc 23 §1 contract gap) — OPEN.
- **Phase 2 (product depth):** K19 — QuantChat C09 search surface — OPEN; K20 — C10 Quanty
  surface — OPEN; K21 — C11 notification center — OPEN; K22 — C13 admin/operations — OPEN;
  K23 — C08 QuantMeet app route + meeting-studio UI (backend `routes/meetings.ts` exists) — DONE #603;
  K24 — C12 full settings (account/devices/sessions/security) — OPEN; K25 — wire
  `services/ws-gateway` into QuantChat realtime (doc 15) — DONE #594; K26 — offline-first
  multidevice sync beyond mobile (doc 18) — OPEN.
- **Phase 9/10 (reliability):** K27 — persistent E2EE relay storage (replace in-memory relay,
  doc 16) — DONE #602; K28 — verify LiveKit SFU deployment in staging (doc 17) — OPEN.

---

## Honesty wins worth preserving (do not regress)

Drive real stats; QuantGit honest empty states; CSAM fail-closed; userinfo fail-closed (#565);
QuantGram shopping real catalog; QuantCooks AITools/export honesty; QuantMax honest empty states;
QuantTube SAMPLE-badge labeling; QuantAI connectors/analytics real fetches; QuantMail settings
explicit "not end-to-end encrypted" copy; SSO-handoff URL scrubbing; `/health` never fabricates.
**Added 2026-10-11:** old yellow Quanty mascot gone from logged-out pages — white ghost mascot
with per-app glow verified on login pages (continuous-qa 2026-10-10/11); QuantChat login copy
honest about no E2E yet; QuantAI `/image-gen` honest "coming soon" (nothing simulated);
QuanTube live search as passthrough proxy; settings honest "NOT end-to-end encrypted" copy with
regression test pinning it (`__tests__/booking-page.test.tsx:34`).

---

## Update cadence

This scoreboard is regenerated by the audit loops (Chrome QA, customer audit, orchestrator).
Edit it by hand only to correct facts — never mark anything done without evidence, per
`15-definition-of-done.md` (a screenshot, HTTP 200, or green TypeScript check is not done).

---
