# Quant Ecosystem — Deep Execution Task Ledger

> Single source of truth for work discovered during UI/UX + architecture audits. This file coordinates Muse/Codex/other agents.
> Never delete a task because work started. Change its state and preserve evidence. Stable IDs prevent duplicate/conflicting work.

## Status legend
- [ ] TODO — not started
- [~] IN_PROGRESS — actively being worked; record owner/branch/PR
- [x] DONE — implementation + validation evidence exists
- [!] BLOCKED — exact dependency recorded
- [-] WONT_DO — explicit decision recorded

## Agent coordination rules
1. Claim before coding: change [ ] to [~] and record Owner/Branch/PR.
2. One task ID = one owner at a time.
3. Parallel subtasks are allowed only with explicit non-overlapping file/domain ownership.
4. DONE requires implementation evidence, validation evidence, exact files/routes/contracts, and commit/PR.
5. Architecture-only work is not DONE when implementation is missing.
6. New gaps get new stable task IDs; do not rewrite history.
7. Re-check branch HEAD/status before coding. Never force-reset, rebase, or squash another agent's work.
8. If another task owns the same file/domain, mark BLOCKED and record the dependency.

## Evidence fields
- Owner / Branch / PR
- Scope: exact files, routes, contracts
- Dependencies: task IDs
- Validation: tests, typecheck, E2E, manual evidence
- Commit SHA
- Notes: remaining gaps and discovered follow-ups

---
# P0 — QuantMail Authentication / First Flagship Journey

## QM-AUTH-001 — Current-state baseline and login contract
Status: [~] IN_PROGRESS
Owner: Architecture/UI audit agent
Branch: architecture/quant-company-system-v1
Scope: apps/quantmail/src/app/login/page.tsx; auth components/services/providers; apps/quantmail/backend/routes/auth.ts; OAuth/session code; auth docs.
Finding: login already has identifier normalization, password validation, visibility control, loading/error states, TOTP + recovery-code 2FA, challenge expiry, return-to handling, account switching/add-account context, and SSO navigation. Do not rewrite blindly.
Required: canonical login state machine mapping every UI state to a backend response/error contract.
Dependencies: none.
Validation: repository/source audit completed.

## QM-AUTH-002 — Login visual system / responsive UX
Status: [ ] TODO
Scope: login page, AuthShell, AuthBrandPanel, auth CSS/tokens, shared brand primitives.
Goal: authentication must visually continue into the QuantMail workspace. Desktop split composition; mobile single-flow composition; keyboard/focus/reduced-motion/safe-area support.
States: initial, identifier, password, submitting, error, 2FA, recovery-code, expired, locked/rate-limited, offline, service-unavailable, SSO-return, account-switch, add-account.
Do not: squeeze desktop onto mobile; invent security claims; replace working auth logic without contract parity.
Dependencies: QM-AUTH-001.

## QM-AUTH-003 — Truthful auth/security copy
Status: [ ] TODO
Finding: current login brand panel claims end-to-end encryption while QuantMail settings explicitly state the product is not end-to-end encrypted.
Required: evidence-backed security language and centralized security copy.
Dependencies: QM-AUTH-001.

## QM-AUTH-004 — Safe login result/navigation state
Status: [ ] TODO
Scope: login result banners, safe return handling.
Finding: arbitrary success query text can be rendered as trusted success copy.
Required: allowlisted result codes or authenticated internal navigation state; never treat URL prose as server evidence.
Dependencies: QM-AUTH-001.

## QM-AUTH-005 — Password recovery end-to-end contract
Status: [ ] TODO
Finding: client password-reset endpoints were inspected but active backend does not provide the required complete recovery contract; confirmation page is missing and non-network failures can be treated as completion.
Required: request + confirm endpoints, rate limiting, non-enumerating response, hashed single-use token, expiry/reuse handling, verified delivery, confirmation UI, session invalidation, audit/observability.
Dependencies: QM-AUTH-001.

## QM-AUTH-006 — Registration ownership/verification contract
Status: [ ] TODO
Finding: client sends acceptTerms but inspected backend does not validate/store it; new accounts are marked email-verified without inspected ownership proof.
Required: versioned Terms/Privacy consent record, email ownership challenge, verification state machine, resend/expiry/reuse handling, honest activation state.
Dependencies: QM-AUTH-001.

## QM-AUTH-007 — Login 2FA state machine hardening
Status: [ ] TODO
Required: challenge ID/lifetime, attempt limits, TOTP/recovery separation, replay protection, generic failure copy, session issuance only after successful verification, secret-free audit, recovery-code consumption.
Dependencies: QM-AUTH-001.

## QM-AUTH-008 — Workspace bootstrap after authentication
Status: [ ] TODO
Goal: one authoritative bootstrap response for identity, account state, devices/session summary, permissions/capabilities, notification state, product config and Quanty session bootstrap.
Rule: products remain source of truth; Quanty receives only governed minimum useful context.
Dependencies: QM-AUTH-001; ecosystem contracts 20/21/22.

## QM-AUTH-009 — Cross-app SSO handoff hardening
Status: [ ] TODO
Finding: architecture requires server-verifiable short-lived scoped handoff; audit found a client-side base64-only SSO ticket verification path elsewhere.
Required: signed/server-verifiable ticket, audience/client binding, nonce/replay protection, short expiry, target allowlist, token scrubbing, destination reauthorization.
Dependencies: QM-AUTH-008; ecosystem contract 20.

## QM-AUTH-010 — Auth journey test matrix
Status: [ ] TODO
Required: 390/768/1024/1280/1440/1920 layouts; keyboard-only; reduced motion; offline; timeout; rate-limit; expired challenge; invalid recovery; cross-app return; no token in URL/logs; no account enumeration.
Dependencies: QM-AUTH-002 through QM-AUTH-009.

---
# P0 — QuantMail Trust / Fake-Data Cleanup

## QM-TRUST-001 — Remove unsupported auth encryption claims
Status: [ ] TODO
Scope: login/auth/booking security copy.
Dependencies: QM-AUTH-003.

## QM-TRUST-002 — Remove or wire fabricated Teams/Agents surfaces
Status: [x] DONE
Scope: MailTeamsCollaborationPanel.tsx; MailSwarmAgentAccessPanel.tsx; teams/agents tabs.
Finding: audit identifies fabricated teammates/PRs/deploys and fabricated agent fleet/heartbeats/kubectl output.
Required: wire to real backend contracts with honest loading/empty/error states, or remove; no theatrical operational data.

Owner: Muse
Branch: fix/fake-f1-mail-teams-agents
PR: #578
Scope: MailTeamsCollaborationPanel.tsx removed; MailSwarmAgentAccessPanel.tsx removed; fabricated Teams/Agents tabs removed
Validation: CI gate green; zero live refs to removed panels verified; merged to main
Commit SHA: 884dcbee
Notes: Staging deploy verification pending next deploy cycle.
---
# P0 — QuantMail Workspace UX

## QM-WORK-001 — Canonical QuantMail Design OS foundation
Status: [ ] TODO
Scope: @quant/brand, @quant/shared-ui, QuantMail semantic tokens/CSS.
Required: surface/type/focus/motion/responsive tokens, product accent semantics, contrast-safe pairs, no ungoverned direct colors on migrated surfaces, Indic fallback preservation.
Dependencies: QM-AUTH-002.

## QM-WORK-002 — Shell and scroll ownership
Status: [ ] TODO
Scope: AppShell.tsx, AppSidebar.tsx, global layout/CSS.
Finding: audit found nested/competing scroll owners and responsive layout issues.
Required: one documented scroll owner per layout mode; tested widths 768/1024/1280/1440/1920; preserve mobile drawer focus and Escape.
Dependencies: QM-WORK-001.

## QM-WORK-003 — Inbox flagship UX audit/upgrade
Status: [ ] TODO
Scope: M01 apps/quantmail/src/app/page.tsx plus inbox components/hooks/API.
Keep: cursor pagination, virtualizer, skeletons, empty states, swipe actions, pull-to-refresh, keyboard navigation, real smart replies.
Required: evidence-backed smart brief, clear priority explanation, commitment/needs-reply views only when backend supports them, consistent states, no fake counts/categories.
Dependencies: QM-WORK-001; QM-WORK-002.

## QM-WORK-004 — Thread contextual intelligence
Status: [ ] TODO
Scope: M02 thread route/components/backend.
Required: evidence-backed summary, decisions/commitments, related Calendar/Drive/Contacts, phishing/external-sender warnings, AI draft preview/diff, no silent mutations.
Dependencies: QM-WORK-003.

## QM-WORK-005 — Compose flagship workflow
Status: [ ] TODO
Scope: M03 compose/DockedComposer plus mail mutation APIs.
Required: recipient resolution, autosave status, attachment/Drive insertion, schedule/signature/security disclosure, AI diff/preview, clear Send, idempotent mutation, authoritative success verification.
Dependencies: QM-WORK-004; platform idempotency contract.

## QM-WORK-006 — Search and command palette truthfulness
Status: [ ] TODO
Scope: M04/M13 search + command palette.
Finding: current labels claim people search and priority inbox behavior not established by destinations.
Required: implement real universal search + priority semantics, or use honest labels until backend exists.
Dependencies: QM-WORK-003; search architecture.

## QM-WORK-007 — Calendar event detail completion
Status: [ ] TODO
Scope: M09 event-detail route/UI/backend.
Required: event details, attendees, recurrence, mail relation, Drive artifacts, reminders, edit/cancel permissions, timezone/DST states.
Dependencies: QM-WORK-004.

## QM-WORK-008 — Notifications center completion
Status: [ ] TODO
Scope: M15 notification center + notification API/bell.
Required: durable notification center, grouping/dedupe, read/unread, action reauthorization, privacy/lock-screen behavior, cross-app events.
Dependencies: notification architecture 20; workspace shell.

## QM-WORK-009 — Universal cross-app search
Status: [ ] TODO
Scope: M13.
Required: authorization-aware federation across permitted Mail/Calendar/Drive/Contacts/QuantGit resources; source hydration; stale ACL protection; deletion invalidation.
Dependencies: ecosystem resource/context contract; search architecture.

## QM-WORK-010 — Settings/security workflow completion
Status: [ ] TODO
Scope: M16/M17.
Required: devices/sessions, 2FA setup/verify/recovery, privacy controls, Quanty grants, memory controls, connected apps, step-up auth, deletion/export.
Dependencies: QM-AUTH-007/008; platform step-up task.

## QM-WORK-011 — Admin Domains + DLP/Audit
Status: [ ] TODO
Scope: M19/M20.
Required: domain administration, DLP policy, audit explorer, RBAC, tenant isolation, immutable/auditable admin actions, export/deletion/legal-hold integration.
Dependencies: security/audit backend contracts.

---
# P1 — QuantMail Backend Integrity

## QM-BACK-001 — Mail outbox/event emission
Status: [x] DONE
Finding: mail backend currently writes zero outbox rows although outbox infrastructure exists.
Required: domain mutation + outbox in one transaction; versioned mail events; idempotent consumers; replay/DLQ observability.
Dependencies: ecosystem event-spine contract.

Owner: Muse
Branch: fix/k1-mail-outbox-writes
PR: #597
Scope: apps/quantmail/backend mail mutations; outbox_events table; event consumers
Validation: CI gate green; 2,687 tests green incl. outbox emission tests; merged to main
Commit SHA: 80dbc55e
Notes: Staging deploy verification pending next deploy cycle.
## QM-BACK-002 — Optimistic concurrency + request IDs
Status: [x] DONE
Required: expectedVersion on thread/mail mutations, VERSION_CONFLICT errors, requestId/correlation propagation.
Dependencies: QM-BACK-001.

Owner: Muse
Branch: feat/qm-back-002-optimistic-concurrency
Notes: claimed 2026-10-08; PR #614 MERGED 2026-10-08 (gate green): expectedVersion on mail/thread mutations, atomic conditional updateMany + VERSION_CONFLICT 409 with recovery details, requestId from x-request-id through services into outbox payloads; migration 0084 (renamed from 0083 to avoid #611 collision); tests 16/16 green, verified by main agent; main merged in to resolve conflict
## QM-BACK-003 — Global idempotency middleware
Status: [x] DONE
Required: Idempotency-Key for mutation routes, durable result replay, bounded retention, scope by actor/tenant/route.
Dependencies: server-core.

Owner: Muse
Branch: fix/k4-idempotency-middleware
PR: #582
Scope: global Idempotency-Key middleware; 8 route files; durable result replay
Validation: CI gate green; idempotency contract tests green; merged to main
Commit SHA: f7f297bb
Notes: Staging deploy verification pending next deploy cycle.
## QM-BACK-004 — Server-side audit integrity
Status: [x] DONE
Required: authoritative audit writes from sensitive mutations; remove/close client-writable audit-log paths; redact secrets and private content.
Dependencies: QM-BACK-001/002.

Owner: Muse
Branch: fix/k9-admin-domains-dlp-audit
PR: #600
Scope: M19 Admin Domains + M20 DLP/Audit screens; audit writes server-side-only
Validation: CI gate green; audit-integrity tests green; merged to main
Commit SHA: eba5a2d8
Notes: Staging deploy verification pending next deploy cycle.
## QM-BACK-005 — Step-up authentication
Status: [x] DONE
Required: recent-auth/step-up challenge for security, destructive, financial and admin actions; explicit expiry and audit.
Dependencies: QM-AUTH-007.

Owner: Muse
Branch: fix/k6-step-up-authentication
PR: #587
Scope: requireStepUp guard; 15-min recent-auth window; 23 new tests
Validation: CI gate green; step-up contract tests green; merged to main
Commit SHA: 98c781a7
Notes: Broader 2FA state-machine hardening (QM-AUTH-007) remains open for auth-flow integration; staging deploy verification pending.
## QM-BACK-006 — Data lifecycle events
Status: [x] DONE
Required: export/deletion/retention/legal-hold events; derived-index invalidation; verified completion.
Dependencies: QM-BACK-001; universal search.

Owner: Muse
Branch: feat/qm-back-006-data-lifecycle-events
Notes: claimed 2026-10-08; PR #611 MERGED 2026-10-08 (orchestrator). Implementation verified by main agent: 10 versioned lifecycle events via K1 outbox spine, lifecycle_operations + projector_checkpoints verified completion, hold-guard 423, search-indexer invalidation (Meili+Qdrant), migration 0083; tests 12/12 + 7/7 green locally, gate green. Follow-up PR #615 MERGED 2026-10-08: fully unquoted type names in 0082. Staging backend deploy VERIFIED LIVE 2026-10-08 ~08:15 IST: run 37718753139 success, pod 1/1 Ready on new image, all 91 migrations applied (0082 fixed, 0083, 0084), /api/health 200.
## QM-BACK-007 — Dependency health / degraded modes
Status: [x] DONE
Required: dependency-level latency/error/timeout/circuit state; declared degraded behavior; mutations fail closed when authoritative state is unavailable.
Dependencies: reliability architecture.

Owner: Muse
Branch: fix/k12-slos-circuit-breakers
PR: #601
Scope: per-dependency health; circuit breakers; 5 SLOs with burn-rate alerts
Validation: CI gate green; 12/12 dep-health checks green; merged to main
Commit SHA: 52c6d91e
Notes: Staging deploy verification pending next deploy cycle.
## QM-BACK-008 — Delivery worker deployment contract
Status: [ ] TODO
Finding: outbound delivery worker exists but inspected deployment manifests do not reference it.
Required: deployment/queue worker config, health, drain/retry/DKIM/MX failure behavior and operational evidence.
Dependencies: infra owner.

---
# P1 — Quanty Integration into QuantMail

## QM-QUANTY-001 — Quanty Mail capability registry
Status: [x] DONE
Required tools: summarizeThread, draftReply, rewriteDraft, translateMail, createCalendarEvent, saveToDrive, searchMail, searchPeople, createFollowUp.
Each tool needs version, owner, input/output schema, capability, resource scope, risk tier, approval, timeout, retry, idempotency, verification, undo/compensation, audit and credit policy.
Dependencies: capability registry/resource contracts.

Owner: Muse
Branch: feat/k16-capability-registry
PR: #593
Scope: packages/app-registry: versioned capability descriptors, risk tiers 0-4, 100+ capabilities, Quanty tool projection
Validation: CI gate green; 48/48 tests green; merged to main
Commit SHA: 5326be05
Notes: Staging deploy verification pending next deploy cycle.
## QM-QUANTY-002 — Quanty inline context surfaces
Status: [x] DONE
Required: evidence links, context boundary, preview before mutation, cost/reversibility, provenance.
Dependencies: QM-QUANTY-001.

Owner: Muse
Branch: feat/qm-quanty-002-inline-context
Notes: claimed 2026-10-08; PR #612 MERGED 2026-10-08 (gate green): evidence refs (quant:// deep links + verbatim quotes ≤280ch), enforceContextBudget 32KB oldest-first + contextTruncated flag, prepareSendPreview + POST /emails/:id/send-preview (cost, reversibility, idempotency key), provenance (capability ID, model, producedBy); built ON #593 registry, 4 new capabilities registered; tests 99/99 registry + 33 quantmail green; flaky gmail-mcp tamper test fixed deterministically (final byte now guaranteed different)
## QM-QUANTY-003 — Quanty voice-to-mail workflow
Status: [ ] TODO
Example: Quanty, Rahul ko email likho aur bhejo.
Required: separate ASR confidence/entity confidence/risk; resolve recipient; draft; restate critical entities; confirmation for external send; execute through mail command; verify authoritative sent state.
Dependencies: QM-QUANTY-001; auth/session bootstrap.

## QM-QUANTY-004 — Cross-app Quanty task graph from QuantMail
Status: [ ] TODO
Example: Email Rahul and then open QuantMax.
Required: typed task graph, parallel/background work, foreground navigation, clarification node, cancellation, unknown outcome, verification and scoped handoff capability.
Dependencies: ecosystem handoff + Quanty task graph architecture.

---
# P2 — QuantMail Platform / Quality

## QM-PLAT-001 — Authenticated product shell continuity
Status: [ ] TODO
Goal: login → bootstrap → inbox transition without visual/product identity discontinuity.
Dependencies: QM-AUTH-002; QM-WORK-001/002.

## QM-PLAT-002 — Responsive visual acceptance matrix
Status: [ ] TODO
Widths: 390, 768, 1024, 1280, 1440, 1920.
Required: evidence for auth, inbox, thread, compose, search, calendar, drive, settings.
Dependencies: corresponding screen tasks.

## QM-PLAT-003 — Accessibility acceptance
Status: [ ] TODO
Required: keyboard completion, focus order/visibility, ARIA names/descriptions, live-region announcements, reduced motion, WCAG AA contrast, touch target sizing, screen-reader critical flows.
Dependencies: QM-PLAT-001/002.

## QM-PLAT-004 — QuantMail screen inventory reconciliation
Status: [ ] TODO
Required: reconcile M01–M20 with existing extra routes such as marketing, postcards, pipelines, lab, workspaces, help, privacy, terms, invite, groups/join and SSO. Every retained route must be spec'd; every removed route needs explicit disposition.
Dependencies: product decision.

## QM-PLAT-005 — QuantMail Definition-of-Done evidence
Status: [ ] TODO
Required: every completed screen must have implementation files, backend contract, tests, responsive evidence, accessibility evidence, failure/offline evidence and known limitations. Never mark DONE from appearance alone.
Dependencies: all screen tasks.

---
# Agent update protocol

Starting: [ ] → [~], then add Owner/Branch/PR.
Finishing: [~] → [x], then add exact validation, commit SHA, and remaining gaps.
Blocked: [~] → [!], record exact dependency and do not edit over another owner's scope.
New finding: append a new stable ID; preserve previous statuses and evidence.

## Core invariant
One task ID owns one coherent change. Existing working code is preserved unless evidence shows it contradicts the target contract. Architecture, UI/UX, backend, Quanty, security, QA and cross-app connections must be tracked together rather than in isolated screen-only tickets.

---
# QuantMail Screen-by-Screen / All-Platform Execution Matrix
> Added 2026-10-08. This is the execution spine for the full QuantMail + Calendar + Drive + Contacts + QuantGit completion. Each screen must be audited across Web, Tauri desktop, Capacitor mobile, and Flutter/mobile surfaces where that surface is supported. A screen is not DONE until UI, UX, source-of-truth, API, realtime/sync, offline, security, Quanty, cross-app links, accessibility, responsive behavior, failure states, and tests are evidenced.

## QM-SCREEN-000 — Platform surface inventory + ownership map
Status: [~] IN_PROGRESS
Owner: Architecture/UI audit agent
Branch: architecture/quant-company-system-v1
Scope: apps/quantmail web, flutter_apps/workspaces/phase1/apps/quantmail/flutter, shared packages, backend routes, deployment/health, QuantMail-hosted Calendar/Drive/Contacts/QuantGit routes.
Required: reconcile every route/screen and every platform implementation before modifying code; identify canonical source of truth and duplicate/legacy surfaces.
Validation: repository search started; current repo contains both Next.js web and Flutter workspace surfaces plus QuantMail-hosted Calendar/Drive/QuantGit routes.
Notes: do not assume a web screen is automatically implemented on mobile; record platform parity explicitly.

## QM-SCREEN-001 — Splash / session bootstrap / signed-out boundary
Status: [~] IN_PROGRESS
Owner: Architecture/UI audit agent
Branch: architecture/quant-company-system-v1
Scope: apps/quantmail/src/app/layout.tsx; apps/quantmail/src/components/AuthGuard.tsx; apps/quantmail/src/providers/auth-provider.tsx; apps/quantmail/src/services/browser-auth-session.ts; Flutter QuantMail app bootstrap/router/auth-session surfaces.
Audit findings: Web correctly keeps the refresh credential in an HttpOnly cookie and the access token in module memory, clears legacy browser token storage, and avoids a login-page flash while refresh/profile hydration is loading. Flutter deliberately defers secure-token hydration until after the first frame and holds the router while auth hydration is loading. However, neither platform currently has the required single authoritative workspace bootstrap contract for identity/account state/devices/permissions/product config/Quanty session, and the startup UX collapses materially different states (offline, auth service unavailable, timeout, invalid session) into a generic signed-out/error path. Flutter also has a separate auth/session contract and route set that must converge semantically with the web contract rather than merely sharing login code.
Required: cold start, warm start, expired session, refresh, offline, degraded backend, account switch, deep-link return, Quanty bootstrap, loading ownership, secure token handling, platform-specific startup behavior.
Acceptance: no flash of authenticated content; no fabricated workspace state; bootstrap is authoritative; offline/degraded/expired states are distinguishable and recoverable; Web/Tauri/Capacitor/Flutter preserve the same domain bootstrap semantics.
Validation: source audit completed across web AuthGuard/AuthProvider/browserAuthSession and Flutter AppBootstrap/LoginScreen/AppRouter; no runtime/visual/CI claim yet.
Dependencies: QM-AUTH-008; QM-PLAT-006; QM-PLAT-010.

## QM-SCREEN-028 — QuantMail web startup must consume one authoritative workspace bootstrap
Status: [ ] TODO
Finding: web startup currently refreshes the browser session and then calls `getUserInfo()`; the protected shell is considered authenticated from profile presence, but the screen contract requires one authoritative bootstrap covering identity, account state, active workspace, device/session summary, permissions/capabilities, product configuration and Quanty bootstrap. Treating profile hydration as the whole bootstrap can leave the shell without authoritative capability/config state and encourages route-by-route hydration drift.
Required: add/version the canonical bootstrap response and make AuthProvider/AuthGuard transition from session-valid to workspace-ready only after authoritative bootstrap succeeds; preserve bounded loading and explicit degraded/offline states; do not synthesize workspace state.
Scope: apps/quantmail/src/providers/auth-provider.tsx; apps/quantmail/src/components/AuthGuard.tsx; browser auth/session API; workspace bootstrap contract.
Dependencies: QM-AUTH-008; QM-PLAT-010.


## QM-SCREEN-030 — QuantMail shell must not fetch the full inbox to render unrelated product chrome
Status: [ ] TODO
Finding: `apps/quantmail/src/components/AppShell.tsx` calls `useInbox({ folderType: 'INBOX' })` at shell level and derives unread/lens counts from the loaded mail collection. Because AppShell wraps Calendar, Drive, Contacts and QuantGit routes, those products inherit a mailbox data dependency even when the active screen has no mail UI. A mailbox outage/slow query can therefore affect unrelated product chrome and the shell can perform unnecessary mail work on every route.
Required: replace full-inbox hydration in the global shell with a lightweight authoritative workspace/notification summary contract (or route-local mail summary only where needed). Mail badges must remain source-of-truth backed without loading the inbox dataset into unrelated products. Define degraded behavior when the summary service is unavailable: unrelated products remain usable and only the mail badge becomes unavailable/stale according to policy.
Acceptance: Calendar/Drive/Contacts/QuantGit navigation does not issue full inbox queries; badge counts come from a bounded summary endpoint/cache with explicit freshness; dependency failure does not block unrelated routes; Web/Tauri/Capacitor/Flutter expose equivalent semantics.
Scope: apps/quantmail/src/components/AppShell.tsx; inbox hooks; workspace bootstrap/notification-summary contract; platform adapters.
Dependencies: QM-AUTH-008; QM-SCREEN-003; QM-PLAT-007; QM-PLAT-010.


## QM-SCREEN-029 — QuantMail Flutter startup must converge on the same bootstrap semantics
Status: [ ] TODO
Finding: Flutter AppBootstrap currently hydrates TokenManager, binds silent refresh/connectivity, and relies on `authSessionProvider`/router for authentication. The route contract is centered on `/login -> /inbox`, but no authoritative workspace bootstrap is established at startup and auth loading/error states do not distinguish offline, dependency-unavailable and invalid-session conditions. This is a platform implementation gap, not a reason to duplicate web UI.
Required: consume the same versioned workspace/bootstrap domain contract as web; keep secure-storage/platform lifecycle differences in adapters only; expose explicit bootstrap states (loading, ready, offline/degraded, reauth required); prevent authenticated-looking UI before authoritative bootstrap.
Scope: flutter_apps/workspaces/phase1/apps/quantmail/flutter/packages/quant_core; quant_app router/login/bootstrap.
Dependencies: QM-AUTH-008; QM-PLAT-006; QM-PLAT-010.

## QM-SCREEN-002 — Login / registration / verification / recovery / 2FA
Status: [ ] TODO
Scope: M00 auth family.
Required: Web + Tauri + Capacitor/Flutter parity, responsive states, truthful security copy, safe navigation, recovery/verification contracts, 2FA lifecycle, anti-enumeration, secure handoff.
Dependencies: QM-AUTH-002 through QM-AUTH-010.

## QM-SCREEN-003 — Workspace shell / navigation / account switcher / command palette
Status: [ ] TODO
Required: one scroll owner, keyboard navigation, mobile drawer/bottom navigation, desktop density, route prefetch, deep links, account switching, notifications, Quanty persistent surface, accessibility.
Dependencies: QM-WORK-001/002.

## QM-SCREEN-004 — Inbox / triage / priority / bulk actions
Status: [ ] TODO
Required: cursor pagination, virtualized lists, unread/read, archive/delete/spam, labels/folders, bulk actions, swipe, keyboard, pull-to-refresh, smart brief only from real data, offline sync and conflict handling.
Dependencies: QM-WORK-003.

## QM-SCREEN-005 — Thread / reply / attachments / participants / related context
Status: [ ] TODO
Required: message state, thread ordering, reply/reply-all/forward, attachments, external sender/phishing indicators, Calendar/Drive/Contacts/QuantGit relations, Quanty evidence + draft diff, realtime and offline reconciliation.
Dependencies: QM-WORK-004.

## QM-SCREEN-006 — Compose / drafts / schedule / send verification
Status: [ ] TODO
Required: recipient resolution, autosave, attachment upload, Drive insertion, signatures, scheduled send, idempotency, send status, retry/unknown outcome, authoritative verification, voice Quanty flow.
Dependencies: QM-WORK-005; QM-QUANTY-003.

## QM-SCREEN-007 — Search / command palette / universal search
Status: [ ] TODO
Required: Mail + Calendar + Drive + Contacts + QuantGit authorization-aware federation, lexical/semantic boundaries, E2EE/local search where applicable, source hydration, stale ACL invalidation, keyboard/mobile UX.
Dependencies: QM-WORK-006; QM-WORK-009.

## QM-SCREEN-008 — Calendar home / agenda / day / week / month
Status: [ ] TODO
Required: timezone/DST, recurrence, reminders, attendee state, drag/drop where supported, mail relation, Drive artifacts, cross-app event creation, offline edits and conflict resolution, mobile gesture behavior.
Dependencies: QM-WORK-007.

## QM-SCREEN-009 — Calendar event create / edit / detail / RSVP
Status: [ ] TODO
Required: attendees, organizer permissions, recurrence, timezone, reminders, conferencing/QuantMeet links, related mail/files, cancellation, RSVP and notification semantics.
Dependencies: QM-WORK-007.

## QM-SCREEN-010 — Drive home / folders / files / recent / shared
Status: [ ] TODO
Required: object metadata, ACLs, uploads/downloads, resumable transfer, previews, favorites, sharing, trash/restore, offline cache, storage pressure, deletion lifecycle.
Dependencies: QuantDrive architecture and ecosystem resource contract.

## QM-SCREEN-011 — Drive upload / file preview / editor handoff
Status: [ ] TODO
Required: resumable uploads, malware/security scan state, signed delivery, preview capability matrix, versioning, share links, editor/Docs handoff, Quanty save/summarize actions.
Dependencies: QM-SCREEN-010.

## QM-SCREEN-012 — Contacts / people / relationship context
Status: [ ] TODO
Required: identity-root semantics, contact CRUD, merge/deduplication, autocomplete, avatars, groups, communication history references, privacy, block/restrict boundaries, Mail/Chat/Calendar linking.
Dependencies: ecosystem identity/resource contracts.

## QM-SCREEN-013 — QuantGit / repositories / files / commits / branches / PR/CI
Status: [ ] TODO
Required: repository ownership, refs, code browsing, commit/branch/PR lifecycle, CI status, secrets safety, deployment boundaries, developer profile, QuantMax/QuantCooks creator links.
Dependencies: QuantGit architecture + creator platform.

## QM-SCREEN-014 — Quanty workspace / inline / voice / cross-app task graph
Status: [ ] TODO
Required: persistent capsule, chat/voice, clarification, confirmation, task graph, background work, UI-control boundaries, evidence/provenance, cancellation, unknown outcome, cross-app handoff.
Dependencies: Quanty docs 24–34.

## QM-SCREEN-015 — Notifications / activity / reminders
Status: [ ] TODO
Required: durable notification center, grouping/dedupe, read/unread, lock-screen privacy, action reauthorization, cross-app events, quiet hours/focus.
Dependencies: notification architecture 20; QM-WORK-008.

## QM-SCREEN-016 — Settings / profile / identity / devices / sessions / security
Status: [ ] TODO
Required: account identity, linked devices, sessions, 2FA, recovery, privacy, Quanty grants, memory/personalization, connected apps, data export/deletion, step-up auth.
Dependencies: QM-WORK-010.

## QM-SCREEN-017 — Admin / domains / DLP / audit / organization policy
Status: [ ] TODO
Required: capability RBAC, tenant isolation, domain verification, DLP, audit explorer, legal hold, retention, export/deletion, incident visibility, break-glass controls.
Dependencies: QM-WORK-011; backend integrity tasks.

## QM-SCREEN-018 — Help / privacy / terms / invite / groups / SSO / legacy route disposition
Status: [ ] TODO
Required: reconcile extra routes; each retained route gets real contracts and platform behavior; each removed/legacy route gets explicit disposition and redirect; no dead links or theatrical data.
Dependencies: QM-PLAT-004.

## QM-SCREEN-019 — End-to-end connection graph verification
Status: [ ] TODO
Required verified flows:
Mail ↔ Contacts; Mail ↔ Calendar; Mail ↔ Drive; Mail ↔ QuantGit; Calendar ↔ QuantMeet/Chat; Drive ↔ Mail/Calendar/Quanty; Contacts ↔ Chat/Calendar/Mail; QuantGit ↔ creator platform/QuantMax/QuantCooks; Quanty ↔ every owned capability; Notifications ↔ every event source.
Acceptance: typed resource refs, source-of-truth ownership, authorization recheck, event propagation, failure behavior, no direct cross-product DB writes.

## QM-SCREEN-020 — All-platform acceptance matrix
Status: [ ] TODO
Platforms: Web, Tauri, Capacitor/Android, Capacitor/iOS, Flutter workspace/mobile where retained.
Widths/devices: 390, 768, 1024, 1280, 1440, 1920 plus keyboard/screen-reader/touch/reduced-motion.
Required evidence: screenshots/video where useful, test results, network/offline behavior, accessibility, performance, deep-link/SSO, background/resume, notification behavior.

---
# New findings discovered during 2026-10-08 screen audit

## QM-AUTH-011 — Never place access/session tokens in cross-app URLs
Status: [~] IN_PROGRESS
Owner: Architecture/UI audit agent
Branch: architecture/quant-company-system-v1
Finding: current login navigation code can append the access token under `token`, `accessToken`, and `__quant_sso_ticket` query parameters when the destination is external. This violates the target short-lived scoped handoff model and risks URL/history/referrer/log leakage.
Required: replace token-in-URL navigation with server-verifiable, short-lived, audience-bound, nonce/replay-protected SSO handoff; scrub sensitive query state; destination must reauthorize.
Scope: apps/quantmail/src/app/login/page.tsx; SSO/handoff backend and receiving clients.
Dependencies: QM-AUTH-009.
Validation: source audit reproduced the token query construction; no implementation claim yet.

## QM-AUTH-012 — Allowlisted login result messaging
Status: [ ] TODO
Finding: login reads arbitrary `success` query text and renders it as success UI. Replace with allowlisted internal result codes mapped to centralized copy.
Dependencies: QM-AUTH-004.

## QM-AUTH-013 — Auth security copy correction
Status: [x] DONE
Owner: Architecture/UI audit agent
Branch: architecture/quant-company-system-v1
Scope: apps/quantmail/src/components/auth/AuthBrandPanel.tsx
Finding: auth brand panel previously claimed mailbox end-to-end encryption without a supporting mailbox E2EE contract.
Implementation: replaced the unsupported claim with evidence-backed "Protected by Quant security" language and retained the accurate in-transit/at-rest statement.
Validation: source re-fetch after commit confirms the exact replacement.
Commit SHA: d71c3148095946b378797b4992b45038a46bdf42
Notes: this does not establish mailbox E2EE; cryptographic architecture remains governed by product/backend contracts.



## QM-AUTH-014 — SSO must not bypass secure browser session boundary
Status: [~] IN_PROGRESS
Owner: Architecture/UI audit agent
Branch: architecture/quant-company-system-v1
Scope: packages/shared-ui/src/interconnection/UniversalSSOTokenBridge.ts; apps/quantmail/src/app/sso/SsoChooserContent.tsx; apps/quantmail/backend/routes/auth.ts; receiving-app SSO consumers.
Finding: QuantMail already uses an HttpOnly refresh cookie and memory-scoped access token, but the SSO chooser/shared bridge serializes that bearer access token into URL parameters. The client-side handoff ticket is base64-encoded JSON, not a server-verifiable signature, and cannot provide single-use replay protection.
Required: replace bearer-token URL handoff with a server-verifiable opaque/signed short-lived ticket bound to source, audience, nonce and return target; consume exactly once; destination reauthorizes and issues its own session; never treat client decoding as authentication.
Validation: source audit confirmed secure cookie rotation in auth-session.ts and bearer URL construction in both SSO paths. No remediation implementation claim yet.
Dependencies: QM-AUTH-009; ecosystem contract 20.

## QM-AUTH-015 — Restrict SSO postMessage trust boundary
Status: [ ] TODO
Finding: UniversalSSOTokenBridge sends cross-window messages with targetOrigin='*' even though incoming origins are allowlisted. This creates an unnecessary exfiltration boundary for session events/payloads.
Required: derive exact target origin from the registered app descriptor; reject unknown origins; never broadcast credentials through postMessage.
Dependencies: QM-AUTH-014.

## QM-AUTH-016 — Remove legacy bearer-token URL consumers across ecosystem
Status: [ ] TODO
Finding: QuantChat, QuantAI, QuantWave, QuantCooks, QuantGram, QuanTube, QuantMax and QuantAds contain URL-token capture/compatibility paths in addition to QuantMail's chooser.
Required: migrate all consumers to the same one-time server handoff contract; keep temporary compatibility only behind an explicit deprecation boundary with telemetry and hard removal date.
Dependencies: QM-AUTH-014.

## QM-PLAT-006 — QuantMail web/mobile implementation divergence audit
Status: [ ] TODO
Finding: repository contains a Next.js QuantMail surface and a separate Flutter QuantMail workspace. Their screen contracts must be reconciled before claiming all-platform completion.
Required: shared domain contracts + platform-specific presentation, no duplicate business logic that can drift.

## QM-PLAT-007 — QuantMail health/deployment evidence
Status: [ ] TODO
Finding: repository contains QuantMail health/deploy infrastructure; completion must verify actual route health, worker registration, readiness, queue drain/retry and deployment manifests rather than source-only confidence.
Dependencies: QM-BACK-008; QM-BACK-007.

## QM-PLAT-008 — QuantMail fabricated operational-data audit
Status: [ ] TODO
Finding: prior audit identified Teams/Agents surfaces with fabricated-looking teammates/PR/deploy/heartbeat/kubectl data. Re-audit current branch and either connect to real sources or remove.
Dependencies: QM-TRUST-002.

---

## QM-AUTH-017 — SSO compatibility tests must be migrated with the contract
Status: [ ] TODO
Finding: shared and app-level tests currently assert the legacy `__quant_sso_ticket`/token URL handoff as the expected behavior. This can preserve the insecure architecture even after the runtime is changed.
Required: replace those assertions with one-time opaque/signed handoff exchange tests covering audience binding, expiry, nonce replay, tampering, return-target binding, URL scrubbing, destination reauthorization, and absence of bearer tokens in URLs/logs/referrers.
Scope: packages/shared-ui/src/interconnection/__tests__; apps/* SSO tests; SSO contract tests.
Dependencies: QM-AUTH-014; QM-AUTH-016.

## QM-PLAT-009 — Flutter auth must not synthesize identity on missing session data
Status: [ ] TODO
Finding: the shared Flutter QuantAuthService falls back to a hard-coded `user@quantmail.in` / `Quant Operator` profile when cached profile data is absent or malformed. That can make an authenticated-looking workspace appear to exist without authoritative identity data.
Required: remove synthetic authenticated identity; transition to an explicit bootstrap/error/reauth state and hydrate profile/workspace only from authoritative backend bootstrap.
Scope: flutter_apps/packages/quant_core/lib/auth/quant_auth_service.dart and dependent workspace bootstrap flows.
Dependencies: QM-AUTH-008; QM-SCREEN-001; QM-PLAT-006.

## QM-PLAT-010 — Flutter/web session contract must converge on one bootstrap model
Status: [ ] TODO
Finding: web auth currently centers on browser session/HttpOnly refresh behavior while the shared Flutter service persists access + refresh credentials in platform secure storage and locally cached profile/workspace data. The platforms can be secure in isolation but currently do not share a single authoritative bootstrap contract.
Required: define one versioned session/bootstrap contract: identity, account state, active workspace, devices/session summary, permissions/capabilities, product config and Quanty bootstrap. Platform adapters may differ in storage and lifecycle, but domain semantics must not drift.
Scope: packages/auth; flutter_apps/packages/quant_core; QuantMail web bootstrap; ecosystem contracts 20/21/22.
Dependencies: QM-AUTH-008; QM-PLAT-006.

---

# Deep Architecture Comparison / Execution Plan — 2026-10-08

## QuantMail target-vs-repository comparison
1. Identity/SSO: target = server-verifiable scoped handoff; repo = legacy bearer token in URL + client-decoded ticket. Priority P0.
2. Session bootstrap: target = authoritative workspace bootstrap; repo = platform-specific cached/session paths. Priority P0.
3. Mail source of truth: target = PostgreSQL/domain + transactional outbox; audit found outbox emission gap. Priority P1.
4. Cross-app context: target = typed QuantResourceRef + governed QuantContextEnvelope + short-lived handoff capability; legacy SSO currently mixes authentication and navigation. Priority P0.
5. Quanty: target = capability/risk/approval/verification governed runtime; QuantMail surfaces need to consume the same registry rather than direct product mutations. Priority P1.
6. Search: target = authorization-aware federated retrieval + source hydration + deletion invalidation; screen implementation must not imply cross-app search until those contracts are real. Priority P1.
7. UI: target = one QuantMail Design OS and one responsive shell across supported clients; repository currently has multiple presentation stacks. Priority P1.
8. Trust: target = no theatrical/fabricated operational data and no unsupported security claims. Security copy is corrected; Teams/Agents still require re-audit. Priority P0.
9. Reliability: target = dependency health, degraded modes, worker registration, queue drain/retry evidence; source presence is not runtime evidence. Priority P1.
10. Completion: target = every screen has UI + data + API + event/sync + offline + security + Quanty + cross-app + accessibility + platform evidence. This ledger remains the execution gate.

## Recommended execution order
A. P0 security boundary: QM-AUTH-011/014/015/016/017.
B. P0 session/bootstrap truth: QM-AUTH-008 + QM-SCREEN-001/002 + QM-PLAT-009/010.
C. P0 trust cleanup: QM-TRUST-001/002 + QM-PLAT-008.
D. Workspace shell: QM-WORK-001/002 + QM-SCREEN-003.
E. Flagship mail loop: QM-SCREEN-004/005/006 and backend outbox/idempotency/concurrency.
F. Calendar/Drive/Contacts/QuantGit completion: QM-SCREEN-008 through 013.
G. Universal Search + Quanty: QM-SCREEN-007/014 + QM-QUANTY-001..004.
H. Notifications/settings/admin: QM-SCREEN-015..018 + backend audit/step-up/lifecycle.
I. Cross-app graph + all-platform acceptance: QM-SCREEN-019/020 + QM-PLAT-001..005.
J. Only then mark screen/product Definition-of-Done items DONE with implementation and validation evidence.

## Current audit gate
No CI-green claim is made from this audit. Architecture findings are evidence from source inspection/search; runtime health, deployment readiness, queue behavior, E2E, accessibility and visual acceptance still require execution evidence.


## QM-PLAT-011 — QuantMail realtime WebSocket authentication must not use bearer tokens in query URLs
Status: [ ] TODO
Finding: `apps/quantmail/src/hooks/useThreadRealtime.ts` currently constructs `/api/ws/thread/:threadId?token=<access-token>`. Browser/WebSocket URLs can enter intermediary/proxy/access logs and diagnostics, so this violates the same credential-boundary principle as SSO token URLs.
Required: authenticate the WebSocket handshake without putting a bearer credential in the URL. Preferred design is an HttpOnly session/cookie-bound handshake or a short-lived, single-use, audience/resource-bound WebSocket ticket exchanged immediately before connect. Ticket must be non-replayable and must not itself be a reusable access token.
Acceptance: source + tests prove no access/refresh token is serialized into the WebSocket URL; expiry/replay/resource binding are tested; reconnect obtains a fresh bounded credential.
Dependencies: QM-AUTH-014/016/017.

## QM-PLAT-012 — QuantDrive collaboration WebSocket must share the canonical session boundary
Status: [ ] TODO
Finding: `apps/quantmail/src/app/drive/doc/[docId]/useCollabDoc.ts` currently appends the browser access token as `?token=` on the collaboration WebSocket URL. This creates a second authentication mechanism that can drift from QuantMail/QuantDrive session policy.
Required: converge document collaboration on the same versioned session/bootstrap/auth contract; authorize the document resource server-side; use a bounded handshake credential rather than a bearer token in the URL; preserve reconnect and offline semantics without credential leakage.
Acceptance: document-id/resource authorization, expiry, replay, reconnect, multi-device and offline tests; no bearer credential in URL/log/referrer surfaces.
Dependencies: QM-PLAT-011; QM-AUTH-008; QM-PLAT-010.

## QM-SCREEN-021 — QuantMail responsive breakpoint must be an explicit cross-platform contract
Status: [ ] TODO
Finding: web shell CSS and `useIsMobile` intentionally converge on a 900px breakpoint, but the acceptance matrix must prove behavior at 390/768/1024 and intermediate widths, orientation changes, keyboard, touch and reduced-motion states. A CSS/JS agreement alone is not visual acceptance.
Required: encode the breakpoint as a screen contract: mobile single-pane inbox/thread navigation below 900px, desktop split-pane at/above 900px, with no hydration/layout drift and equivalent navigation semantics on Tauri/Capacitor/Flutter.
Acceptance: screenshot/interaction matrix across required widths plus keyboard/screen-reader/touch/reduced-motion evidence; route and pane behavior must match.
Dependencies: QM-SCREEN-004; QM-PLAT-006; QM-PLAT-002/003.


## QM-SCREEN-013 — QuantGit screen must eliminate static/theatrical operational state
Status: [ ] TODO
Finding: the current QuantGit page explicitly describes its data as "largely static/mock" and initializes chat sessions, Quanty/Notion-style settings, MCP servers, skills and related workspace state locally. The surface also exposes repositories/PR/issues/actions/agents/security/insights as if they are a live developer control plane. This conflicts with the QuantGit architecture and the creator/developer platform contract unless every displayed operational state is sourced from the authoritative Git domain.
Required: classify every QuantGit field as Git-domain truth, derived projection, or UI-only draft; wire repositories, refs, commits, issues, PRs, CI runs, security findings, agents and developer identity to real contracts; show honest loading/empty/unavailable states; never present seeded sessions, fleet state, model/tool availability or deployment state as real user data. Quanty must invoke typed QuantGit capabilities rather than mutate local mock state.
Scope: apps/quantmail/src/app/quantgit/page.tsx and child tabs/components; QuantGit backend/API; creator-platform contracts.
Dependencies: QuantGit architecture; creator platform architecture.

## QM-SCREEN-022 — QuantMail implementation-status documentation must reconcile with the live screen tree
Status: [ ] TODO
Finding: docs/quant-architecture/33-implementation-status.md still reports M15 Notifications as PARTIAL and M19/M20 as MISSING, while the current tree contains a dedicated notifications route and an admin page/API surface that advertises M19/M20 routes. This creates a documentation-versus-code ambiguity that can cause agents to duplicate completed work or skip missing route implementation.
Required: re-audit each M01-M20 status against the current branch, record exact route/file evidence, distinguish route shell from production-complete screen, and update the implementation-status document only from verified source/tests. The admin page's M19/M20 links must be verified as actual routes, not merely navigation entries.
Scope: docs/quant-architecture/33-implementation-status.md; apps/quantmail/src/app; apps/quantmail/backend/routes/admin.ts; screen matrix.
Dependencies: QM-SCREEN-000; QM-SCREEN-015; QM-SCREEN-017.

## QM-PLAT-013 — QuantGit/QuantMail developer identity must not claim unverified live infrastructure
Status: [ ] TODO
Finding: QuantGit UI constructs clone URLs and developer-facing identity from local username state, while the audited page contains seeded workspace sessions and product/tool names that resemble live infrastructure. The UI must not imply a repository, CI, MCP server, agent, deployment or model is available merely because a local state object names it.
Required: backend-authoritative capability discovery, repository existence checks, signed/authorized clone endpoint generation, explicit unavailable states, and provenance for operational cards. Cross-app creator links must use typed resource references and reauthorization.
Dependencies: QM-SCREEN-013; ecosystem resource/context contract.

## QM-SCREEN-023 — QuantCalendar web reminders and contextual subviews must be source-of-truth backed
Status: [ ] TODO
Finding: the QuantMail Calendar UI contains a hard-coded reminder entry (for example, a static `rem-4` Booking Links task) inside `apps/quantmail/src/components/CalendarSubViews.tsx`. That violates the Calendar contract that events/tasks/reminders are durable domain state and risks presenting invented activity as the user's real schedule.
Required: remove seeded production reminder/activity records; render loading/empty/error states from the canonical Calendar API; preserve reminder/task CRUD, pagination/range loading and optimistic/reconciliation behavior without hard-coded user entries. Test that an empty account renders empty state and that returned API records alone determine visible activity.
Scope: apps/quantmail/src/components/CalendarSubViews.tsx; calendar hooks/API; Calendar tests.
Dependencies: QM-SCREEN-008/009; QM-WORK-007.

## QM-SCREEN-024 — QuantCalendar/QuantMeet handoff must use a real meeting resource contract
Status: [ ] TODO
Finding: the Calendar QuantMeet view exposes an `activeInstantMeeting` state and displays a constructed `https://quantmail.in/meet/{code}` URL. The screen must not imply a live meeting room merely because a local code exists. Calendar/QuantMeet ownership requires a real meeting resource, authorization, expiry and destination reauthorization.
Required: replace local-only room generation with the canonical QuantMeet create/join capability; return a typed resource reference/deep link, verify meeting existence and permissions before displaying Join/Active state, handle expired/revoked rooms, and preserve Calendar↔QuantMeet event linkage.
Scope: apps/quantmail/src/app/calendar/components/CalendarQuantMeetView.tsx; QuantMeet handoff/capability contracts; Calendar integration tests.
Dependencies: QuantChat QuantMeet architecture; QM-SCREEN-019; QM-AUTH-009.

## QM-SCREEN-025 — QuantMail Calendar platform parity must distinguish embedded Calendar from standalone QuantCalendar
Status: [ ] TODO
Finding: the repository contains both the QuantMail Flutter super-app surface and a standalone `flutter_apps/apps/quant_calendar` application. The web Calendar is substantially richer than the Flutter QuantMail surface, while the standalone Calendar has its own models/screens and tests. This creates a risk of two competing Calendar domain/presentation contracts.
Required: define one Calendar domain/API/event contract and explicitly classify standalone QuantCalendar as a destination/embedded module; map each M08/M09 capability across Web, Tauri, Capacitor and Flutter QuantMail. Platform-specific UI is allowed, duplicated business rules are not. Record unsupported capabilities honestly rather than silently diverging.
Scope: flutter_apps/apps/quant_mail; flutter_apps/apps/quant_calendar; apps/quantmail Calendar; Calendar architecture docs.
Dependencies: QM-PLAT-006; QM-SCREEN-008/009; Calendar architecture.

## QM-SCREEN-026 — QuantMail Calendar UI must eliminate misleading search-performance claims
Status: [ ] TODO
Finding: the shared QuantMail pillar header advertises `Search events, meetings, attendees… <5ms`, but the audited architecture requires authorization-aware retrieval and source hydration; no evidence establishes a universal sub-5ms SLA for Calendar search.
Required: remove the absolute performance claim or replace it with an evidence-backed product promise. Search UX must expose loading/degraded states and server-authoritative results, with performance budgets measured separately from marketing copy.
Scope: apps/quantmail/src/components/QuantPillarTopBar.tsx; Calendar search implementation/tests.
Dependencies: QM-SCREEN-007/008; search architecture.

## QM-TRUST-003 — QuantMail/Drive platform copy must not imply unverified vault, quota or health state
Status: [ ] TODO
Finding: the Flutter QuantMail design/account surfaces describe an AES-256 E2EE/zero-knowledge Drive vault, a fixed 100 GB quota with 85.8 GB free, and a healthy backend with <24ms latency. The audited repository does not establish these as authoritative runtime facts for every user/session. Product copy must not turn design targets or seeded telemetry into user-trust claims.
Required: classify each security/storage/health value as authoritative backend state, device-local capability, measured telemetry, or design target; render only the first three when actually available; otherwise show honest unavailable/estimated states. Any true client-side encrypted vault must have a separately reviewed cryptographic contract and key lifecycle before claiming E2EE/zero-knowledge.
Scope: docs/design/QUANTMAIL_FLUTTER_WEB_CONNECT_DESIGN.md; flutter_apps/apps/quant_mail account/Drive surfaces; QuantDrive security/quota/health contracts.
Dependencies: QM-SCREEN-010/016; QuantDrive architecture; QM-PLAT-006.

## QM-SCREEN-027 — QuantDrive storage/quota and security indicators must be authoritative across platforms
Status: [ ] TODO
Finding: Web and Flutter QuantMail expose Drive/storage indicators through different presentation paths, while the Flutter design includes hard-coded-looking quota/telemetry examples. The screen contract needs one authoritative quota/ACL/security state and platform adapters must not invent values.
Required: define quota response/version, used/available/pending-delete states, storage-pressure behavior, upload limits, sharing/ACL state, encryption state, malware-scan state and degraded/offline behavior. Web, Tauri, Capacitor and Flutter must render the same domain semantics even when visual presentation differs.
Acceptance: empty account, quota exhausted, upload in progress, scan pending/rejected, permission revoked, offline and stale-cache cases are tested; no seeded quota/health values reach production UI.
Dependencies: QM-SCREEN-010/011; QM-PLAT-006; QuantDrive architecture.


## QM-SCREEN-028 — Mail reactions are local-only UI state, not durable domain state
Status: [ ] TODO
Finding: `ConversationalThreadView` reads and writes message reactions under `localStorage` (`quantmail:reactions:<threadId>`) because the mail backend currently has no message-reaction endpoint. This means reactions do not converge across devices, are lost outside the browser profile, are not represented in the mail domain/outbox/event stream, and can disagree with the thread shown on another platform.
Required: either remove reactions from production UI until a mail-domain contract exists, or implement durable reaction state with authorization, idempotent mutation, outbox event, realtime/offline reconciliation and cross-device convergence. Do not use localStorage as the source of truth for collaborative message state.
Scope: apps/quantmail/src/components/ConversationalThreadView.tsx; mail backend message/reaction contract; offline sync/events.
Dependencies: QM-WORK-004; QM-BACK-001; ecosystem event-spine/offline-sync contracts.
Validation: source search confirmed localStorage read/write and an inline comment explicitly states there is no backend reaction endpoint; no implementation claim yet.

## QM-QUANTY-005 — Quanty conversation history must not become an uncontrolled browser plaintext store
Status: [ ] TODO
Finding: `QuantyCopilotDrawer` persists its transcript/history under `localStorage` (`quantmail_quanty_chats_v1`). Because the history contains user/assistant message text and the drawer can be opened with email context, this creates a durable browser-side plaintext copy outside the governed QuantDrive memory/session boundary and outside the product retention/export/deletion controls.
Required: classify Quanty chat history explicitly as ephemeral session state, governed durable history, or user-exportable product data. If durable, store it through the governed Quanty/session data contract with retention, deletion/export, device synchronization and sensitive-content policy; if ephemeral, keep it memory-only or in an explicitly bounded encrypted local store with clear lifecycle semantics. Never silently treat browser localStorage as canonical memory.
Scope: apps/quantmail/src/components/QuantyCopilotDrawer.tsx; Quanty session/history APIs; memory/data lifecycle contracts.
Dependencies: QM-QUANTY-001/002; QM-BACK-006; Quanty memory architecture.
Validation: source audit confirmed `STORAGE_KEY = 'quantmail_quanty_chats_v1'` and localStorage persistence of chat history; no remediation implementation claim yet.

## QM-SCREEN-029 — QuantMail Inbox footer must not claim unverified transport/security state
Status: [ ] TODO
Finding: `apps/quantmail/src/app/page.tsx` renders the fixed footer text "Ecosystem connected · SES/DKIM active". The audited UI does not establish that this is a per-account authoritative runtime state; SES/DKIM are infrastructure/configuration concerns and a static claim can misrepresent delivery posture.
Required: replace static infrastructure/security claims with authoritative delivery/security status only when returned by a trusted backend status contract. Otherwise remove the claim or expose a neutral product status surface with explicit scope and timestamp.
Scope: apps/quantmail/src/app/page.tsx; mail delivery/health contract; admin/observability status.
Dependencies: QM-BACK-008; QM-PLAT-007.
Acceptance: empty/healthy/degraded/unavailable states are truthful; no hard-coded SES/DKIM status reaches production UI.

## QM-SCREEN-030 — QuantMail booking security copy must match the actual cryptographic contract
Status: [ ] TODO
Finding: the booking route contains "End-to-End Encrypted Scheduling" copy, while the current QuantMail architecture does not establish end-to-end encryption for booking/scheduling data. This is a trust-boundary mismatch similar to the login security-copy finding.
Required: remove or replace the claim with evidence-backed transport/storage/security language unless a separately reviewed booking E2EE/key-management contract exists and is actually enforced.
Scope: apps/quantmail/src/app/calendar/booking/[slug]/page.tsx; booking API; security/privacy documentation.
Dependencies: QM-AUTH-003; QM-SCREEN-009.
Acceptance: product copy is derived from the implemented security contract; tests/inspection prevent regression to unsupported E2EE claims.

## QM-SCREEN-031 — QuantMail Inbox mock/derived-state audit must separate server truth from UI projections
Status: [ ] TODO
Finding: M01 now contains substantial real interactions (cursor pagination, virtualization, filters, swipe actions, selection, optimistic mutations and contacts joins), but it also derives views from client-held fields and retains compatibility lenses whose server semantics are not fully established (for example category keys whose writer is absent). The screen contract must distinguish authoritative mailbox state, derived client projection and unsupported/disabled capabilities.
Required: inventory every Inbox-visible count, lens, category, pinned/archived state, "turn" classification, contact join and footer/status indicator; map each to an API field/query or explicitly mark it derived/UI-only. Remove or disable labels whose backing domain semantics are absent, and add regression tests for empty, partial, stale and permission-revoked datasets.
Scope: apps/quantmail/src/app/page.tsx; inbox hooks; mail API schemas; Prisma mail domain; tests.
Dependencies: QM-WORK-003; QM-SCREEN-029; search/mail backend contracts.
Acceptance: no user-visible Inbox claim exists without an identified source-of-truth or documented deterministic derivation.


## QM-UIUX-001 — QuantAI mobile must not render a blank white page
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/quantai-blank-white-page)
Finding: `https://quantai.quantrinity.in` on mobile (iPhone 14, 390x844) renders a blank white viewport with only a hamburger button visible. No chat UI, no login prompt, no branding, no loading state. Screenshot evidence: `~/workspace/audits/2026-10-08-uiux-deep/ai-mobile.png`. A blank page violates the no-dead-surfaces rule; an earlier QA run reported it rendering, so this is a regression or intermittent JS init failure.
Required: anonymous users must see a real state — login prompt, chat UI, honest loading state with timeout, or honest error. Never a blank viewport. Investigate JS console errors / broken auth-gate first.
Scope: QuantAI frontend; auth-gate/init path.
Dependencies: none.
Validation: mobile screenshot of the fixed page required before DONE.

## QM-UIUX-002 — QuantMax mobile must not render a blank white page
Status: [x] DONE — PR #657 merged 2026-10-08 (feed payload normalization + bounded loading)
Finding: `https://quantmax.quantrinity.in` on mobile renders a completely blank white viewport (screenshot: `~/workspace/audits/2026-10-08-uiux-deep/max-mobile.png`). Same failure class as QM-UIUX-001 — suggests a shared broken auth-gate/shell pattern across satellite frontends.
Required: render a real state for anonymous users (login, loading with timeout, or honest empty). Audit whether QuantAI/QuantMax share the broken init path and fix the common root, not just the symptom.
Scope: QuantMax frontend; shared auth-gate if applicable.
Dependencies: QM-UIUX-001 (share root-cause findings).
Validation: mobile screenshot of the fixed page required before DONE.

## QM-UIUX-003 — QuantWave sign-in must actually redirect or stop claiming it does
Status: [~] IN_PROGRESS (Owner: Muse, Branch: fix/qm-uiux-003-wave-signin-redirect, PR: #627)
Finding: `https://quantwave.quantrinity.in` shows "Sign in to QuantWave / Taking you to sign in with your Quant account. / Go to sign in" — the copy claims an automatic redirect ("Taking you to...") but the page is static; the user must click a plain text link. Screenshot: `~/workspace/audits/2026-10-08-uiux-deep/wave-mobile.png`. Copy must be an instruction or a provable truth.
Required: either make the page actually auto-redirect to the SSO flow (preferred), or replace the copy with an honest CTA button ("Continue with Quant Account").
Scope: QuantWave landing/auth entry.
Dependencies: none.

## QM-UIUX-004 — Design-system color chaos: codemod dark surfaces to --quant-* tokens
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/qm-uiux-004-color-token-codemod; worktree in progress, ~123 files modified)
Finding: 10 competing dark background hexes in active use across QuantMail: `#090A0C`, `#090A0E`, `#0D1117`, `#0D0F12`, `#111318`, `#12151E`, `#16181D`, `#161B22`, `#21262D`, `#282C35`, `#30363D`. A `--quant-*` token system exists in `globals.css` but only 44 of 391 components use it; 212 hardcode hex. Adjacent panels render visibly different blacks, breaking the user's "deep black" direction. Full evidence: `~/workspace/audits/2026-10-08-uiux-deep/design-system-audit.md`.
Required: codemod dark-surface hexes to the canonical `--quant-*` tokens; define the missing tokens if the scale is incomplete; add a lint rule banning raw hex for surface backgrounds. Visual diff review of adjacent panels (inbox rows vs sidebar vs header) before DONE.
Scope: `apps/quantmail/src/**`; `globals.css` tokens; eslint config.
Dependencies: none.

## QM-UIUX-005 — Remove sub-minimum typography (<10px text)
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/qm-uiux-005-type-scale; worktree in progress, ~33 files modified)
Finding: 45 instances of 6-9px text across QuantMail (`text-[6px]` through `text-[9px]`), below WCAG readability minimums. The working scale is `text-[10px]` (459x) and `text-[11px]` (481x) but there is no defined type scale. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/design-system-audit.md`.
Required: define a 5-step type scale (minimum 10px for UI text); replace or remove all <10px instances; add a lint rule banning arbitrary sub-10px sizes.
Scope: `apps/quantmail/src/**`; Tailwind/eslint config.
Dependencies: QM-UIUX-004 (token/lint infrastructure can be shared).

## QM-UIUX-006 — Old amber mascot still on QuantMail sign-in header
Status: [x] CLOSED (2026-10-08, user decision): sign-in page keeps QuantMail's own original logo, NOT the white ghost — PR #622 ghost swap reverted, PR #626 restored original logo and merged, PR #658 closed without merge. Amber-ghost-square concern closed as "app logo stays as-is".
Finding: the sign-in header still shows the old amber/yellow mascot, contradicting the user's standing order (white ghost mascot everywhere, amber must go). Branch `feat/quanty-ghost-mascot` exists with the white ghost implementation. Screenshot: `~/workspace/audits/2026-10-08-uiux-deep/m1-inbox-mobile.png`.
Required: merge or port the ghost mascot to the sign-in header; delete amber mascot assets; screenshot-verify the sign-in page shows the white ghost.
Scope: sign-in header; mascot assets.
Dependencies: none.
Validation: mobile screenshot of sign-in with white ghost required before DONE.

## QM-UIUX-007 — Splash loader shows an empty logo box on first paint
Status: [~] IN_PROGRESS (Owner: Muse fix agent)
Finding: `QuantMailLogo` is a 531-line canvas-painted mark that paints nothing on first paint — the splash/sign-in shows an empty rounded square (visible in audit screenshots). Per the Fogg credibility principle, a missing logo at first paint reads as broken.
Required: use a static inline SVG for non-interactive placements (sign-in header, splash); keep the canvas only where animation is actually used.
Scope: `QuantMailLogo` component; sign-in/splash placements.
Dependencies: QM-UIUX-006 (same header area; coordinate to avoid conflicts).

## QM-UIUX-008 — Desktop app rail active tile must drop the orange edge/glow
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/desktop-f1f4-rail-rows)
Finding: the desktop app rail active tile still has the accent edge bar with glow (`boxShadow: 0 0 10px`), colored rectangular background tint, and icon drop-shadow. The user explicitly ordered: no active orange edge/glow, no colored rectangular backgrounds, no invented animation. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/desktop-audit.md` (F1).
Required: active app shows clean logo only; inactive apps dimmed. Remove edge bar, glow, tint, drop-shadow.
Scope: `DesktopAppRail` component.
Dependencies: none.

## QM-UIUX-009 — Desktop inbox rows must be deep black with no divider lines
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/desktop-f1f4-rail-rows)
Finding: desktop inbox rows are `bg-[#111318]` with `border-b border-[#282C35]` on every row. The user ordered: deep black, no divider lines. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/desktop-audit.md` (F4). The thread view already does `md:border-b-0` correctly — follow that pattern.
Required: black rows, no borders on desktop, spacing for separation.
Scope: inbox row components (desktop breakpoint).
Dependencies: QM-UIUX-004 (color tokens); QM-UIUX-008 (same agent/branch, coordinate).

## QM-UIUX-010 — QuantChat session check must time out instead of spinning forever
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/uiux-p1-spinner-signin-layout, PR: #621)
Finding: first load can stick on "Verifying your session..." with no timeout or fallback. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/satellite-audit.md`.
Required: timeout (10s) then an honest error/retry state — never an infinite spinner. Fix at the source (`useAuth`/`fetchUserFromToken`) so `isLoading` cannot hang.
Scope: `apps/quantchat/src/providers/auth-gate.tsx`; `packages/shared-ui/src/hooks/useAuth.ts`.
Dependencies: none.

## QM-UIUX-011 — Sign-in redundant copy must be an instruction or be removed
Status: [~] IN_PROGRESS (Owner: Muse fix agent)
Finding: "Sign in to QuantMail / to continue to QuantMail" — the subtitle repeats the heading verbatim. The user's rule: every word must be an instruction or a provable truth. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/mobile-audit.md`.
Required: delete the subtitle or replace it with a genuine instruction.
Scope: sign-in page copy.
Dependencies: QM-UIUX-006/007 (same page; coordinate).

## QM-UIUX-012 — Sign-in page layout: dead black space and stray hairline
Status: [~] IN_PROGRESS (Owner: Muse fix agent, Branch: fix/uiux-p1-spinner-signin-layout, PR: #621)
Finding: ~40% of the mobile viewport is empty black below the footer after scrolling; a stray hairline with an unexplained green segment sits under the sign-in header (progress-bar remnant). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/mobile-audit.md`.
Required: `min-h-dvh` flex layout with footer pinned via `mt-auto`; remove or scope the hairline to actual loading states. Desktop layout untouched.
Scope: sign-in page CSS (mobile breakpoint).
Dependencies: none.

## QM-UIUX-013 — Consolidate 6 competing text grays
Status: [ ] TODO
Finding: 6 competing text grays in use (`#A1A4AC` 696x, `#7D8590`, `#8D96A0`, etc.). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/design-system-audit.md`.
Required: reduce to a 3-step gray text scale on tokens; codemod usages; lint-ban raw gray hex for text.
Scope: `apps/quantmail/src/**`; `globals.css` tokens.
Dependencies: QM-UIUX-004 (same codemod/lint approach; do together or sequence).

## QM-UIUX-014 — Restrict amber #F59E0B to warning semantics
Status: [ ] TODO
Finding: amber `#F59E0B` used 280x as decorative accent, competing with brand orange `#FF8C42` (1231x, correctly dominant). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/design-system-audit.md`.
Required: amber reserved for warning/semantic use only; replace decorative amber with brand orange or neutral tokens.
Scope: `apps/quantmail/src/**`.
Dependencies: QM-UIUX-004.

## QM-UIUX-015 — QuantGram: stray mic button on the welcome page
Status: [ ] TODO
Finding: a blue mic FAB sits bottom-right on the QuantGram welcome page before sign-in; its purpose is unclear to an anonymous user. Screenshot: `~/workspace/audits/2026-10-08-uiux-deep/gram-mobile.png`.
Required: hide until authenticated or remove; do not show unexplained controls to anonymous users.
Scope: QuantGram welcome page.
Dependencies: none.

## QM-UIUX-016 — QuantCooks: duplicate/confusing sign-in CTAs
Status: [ ] TODO
Finding: the QuantCooks sign-in shows both "Continue with Quant Account" (gradient) and "Continue with Quant SSO" (outline) — near-identical actions competing as primaries. Screenshot: `~/workspace/audits/2026-10-08-uiux-deep/cooks-mobile.png`.
Required: one primary CTA; demote or remove the duplicate.
Scope: QuantCooks sign-in.
Dependencies: none.

## QM-UIUX-017 — QuantCooks: "OR" divider text overlaps the divider line
Status: [ ] TODO
Finding: the "OR" divider label sits awkwardly on top of the divider line (visual glitch). Screenshot: `~/workspace/audits/2026-10-08-uiux-deep/cooks-mobile.png`.
Required: proper divider with background-masked label or spaced layout.
Scope: QuantCooks sign-in.
Dependencies: QM-UIUX-016 (same page; fix together).

## QM-UIUX-018 — QuanTube: category pill cut off with no scroll affordance
Status: [ ] TODO
Finding: the "Sport" category pill is cut off at the right edge with no visible scroll affordance. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/satellite-audit.md`.
Required: edge fade or scroll hint on the pill row.
Scope: QuanTube mobile feed.
Dependencies: none.

## QM-UIUX-019 — Drive tabs unreachable on mobile
Status: [ ] TODO
Finding: `DriveContextTabsHeader` is `hidden md:flex` (desktop only); the mobile replacement `MobileSubTabStrip` was deleted — the file does not exist. No mobile tab UI in `app/drive/page.tsx`. Users are stuck on the default tab; 7 of 8 Drive surfaces unreachable on phones. Dead code: `page.tsx:316` listens for `quant:subtab-change` from a component that no longer exists. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/drive-audit.md`.
Required: restore/build a mobile tab strip for Drive (swipeable pills or bottom sheet); remove the dead event listener.
Scope: `apps/quantmail/src/app/drive/`.
Dependencies: none.

## QM-UIUX-020 — Drive fake-data purge: vault, shared, starred, cleaner
Status: [x] DONE
Owner: muse-main
Branch: fix/qm-uiux-020-drive-fake-data-purge
PR: #678 merged 2026-10-08 (merge commit 007412ef)
Finding: systemic fake data across Drive tabs — `DriveVaultSubView.tsx` hardcodes 4 fake "encrypted" files with fabricated SHA256 hashes/dates (parent passes no `items` → fakes always render); `DEFAULT_DEMO_SHARES` with fake people (Elena Rostova, Marcus Vance); `DEFAULT_DEMO_STARRED`; `DEFAULT_CLUSTERS`. The `shares.length > 0 ? shares : FAKES` fallback means even empty accounts show phantom data. The "decrypt" action is a toast claiming "Unlocked via WebCrypto SubtleCrypto L3" with no real crypto. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/drive-audit.md`.
Required: remove all hardcoded demo files/shares/starred/clusters; render honest empty states; remove the fake decrypt toast (or wire to a real capability).
Scope: `apps/quantmail/src/app/drive/` subviews.
Dependencies: none.

## QM-UIUX-021 — Remove unverified E2EE/AES-256 claims on Drive Vault tab
Status: [ ] TODO
Finding: badge `E2EE` + aria-label "AES-256 E2EE Sovereign Cryptographic Vault" with no reviewed crypto contract. Exactly what QM-TRUST-003 forbids. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/drive-audit.md`.
Required: remove the claims or replace with evidence-backed language per QM-TRUST-003.
Scope: Drive Vault tab.
Dependencies: QM-TRUST-003; QM-UIUX-020 (same files; fix together).

## QM-UIUX-022 — Calendar dead code: delete ~1,630 lines of unreferenced views
Status: [ ] TODO
Finding: `CalendarMonthView.tsx` (483 lines, zero references), `CalendarAgendaView.tsx` (446 lines, zero references), `CalendarViews.tsx` (701 lines, imported but never rendered). Live views are the `*SubView` components. Dead files duplicate month-grid logic with divergent styling. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/calendar-audit.md`.
Required: delete the three dead files; verify no imports break; run Calendar tests.
Scope: `apps/quantmail/src/components/CalendarMonthView.tsx`, `CalendarAgendaView.tsx`, `CalendarViews.tsx`.
Dependencies: none.

## QM-UIUX-023 — Calendar P1s: duplicate navigation, small touch targets
Status: [ ] TODO
Finding: (a) page-level `CalendarHeader` AND `CalendarMonthSubView` toolbar both render prev/next chevrons + "Today" — two "Today" buttons on one screen; (b) touch targets below 44px on mobile — month chevrons `size-8` (32px), "Today" `h-8`, split-button chevron `px-1.5` (~28px). Week view already uses `min-h-[44px]` — follow that pattern. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/calendar-audit.md`.
Required: single navigation source; all touch targets >= 44px on mobile.
Scope: Calendar header/subview components.
Dependencies: none.

## QM-UIUX-024 — Compose P0: Send button looks live but rejects on tap
Status: [x] DONE
Owner: muse-main
Branch: fix/qm-uiux-024-compose-send-validation
Merged: PR #676 (2026-10-08)
Finding: `EmailComposer.tsx:653-668` vs `:2047` — validation toasts errors for empty subject/body, but the button is only disabled when To is empty. Users tap a fully-actionable-looking Send and get an error toast. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/compose-audit.md`.
Required: mirror validation in the disabled state, or make subject a confirm-dialog instead of a hard block.
Scope: `apps/quantmail/src/components/EmailComposer.tsx`.
Dependencies: none.

## QM-UIUX-025 — Compose P1s: wrong mascot reaction, lying toast, latent overflow
Status: [~] IN_PROGRESS
Owner: muse-main
Branch: fix/qm-uiux-025-compose-p1s
Finding: (a) `quantyReact('mail:noRecipients')` fires for missing subject/body too — copy-paste bug, makes the AI feel fake; (b) "Message sent" toast claims sent while the 10s recall countdown runs — should say "Sending… (10s to undo)"; (c) modal compose branch `:984` is `fixed bottom-0 right-4 w-full` — latent 1rem horizontal overflow on mobile (no caller passes `modal={true}` today). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/compose-audit.md`.
Required: distinct `mail:noSubject`/`mail:noBody` reactions; honest toast copy; `inset-x-4 w-auto` on mobile for the modal branch.
Scope: `apps/quantmail/src/components/EmailComposer.tsx`.
Dependencies: QM-UIUX-024 (same file; fix together).

## QM-UIUX-026 — Delete fake contacts with real public figures' names
Status: [x] DONE
Owner: muse-main
Branch: fix/qm-uiux-026-fake-contacts-purge
Merged: PR #675 (2026-10-08)
Finding: `ContactsSubViews.tsx:18` hardcodes `SOVEREIGN_DEFAULT_CONTACTS` — 10 fake contacts including REAL public figures (Sundar Pichai, Satya Nadella, Sam Altman, Linus Torvalds, Demis Hassabis) with FABRICATED phone numbers, injected into every user's list at two points (`:199-201` "Ensure sovereign VIPs are present", `:360-361` CompaniesSubView). The fake numbers are wired to `tel:` links — tapping "call" dials a stranger. Using real people's names with fake numbers is a reputational/legal risk. The "3 EXECUTIVES" badge derives from these fakes. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/contacts-audit.md`.
Required: delete `SOVEREIGN_DEFAULT_CONTACTS` and both injection points; the honest empty state already exists — make it reachable; remove the fake "3 EXECUTIVES" badge (or wire to a real count).
Scope: `apps/quantmail/src/components/ContactsSubViews.tsx`.
Dependencies: none.

## QM-UIUX-027 — Account deletion and data export must be real or removed
Status: [ ] TODO
Finding: `account/page.tsx` "Permanently Delete My Account" uses `setTimeout` to toast "scheduled for immediate purge" — NO API call, NO backend endpoint exists. The user types DELETE and believes their account is erased; it is not. Same pattern for "Request Archive" (data export): `setTimeout` toasts "encrypted export will be delivered to your inbox" with no backend. Deletion copy invents specifics ("Erased within 60 seconds... pruned from backups within 30 days"). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/settings-audit.md`.
Required: either wire to real backend endpoints (deletion + export with honest timelines), or remove the controls entirely. Never show a fake destructive action.
Scope: `apps/quantmail/src/app/account/page.tsx`.
Dependencies: QM-BACK-006 (data lifecycle) for the real deletion path.

## QM-UIUX-028 — QuantGit: stop fabricating repo metadata, fix fake MCP count
Status: [x] DONE
Owner: muse-main
Branch: fix/qm-uiux-028-quantgit-fabrication
Merged: PR #677 (2026-10-08)
Finding: (a) `page.tsx:560-580` — when the API omits fields, the UI invents them: hardcoded SHA `'948e3612'`, `checksStatus: 'passing'` (always), `branchCount: 4`, `commitCount: 2118`, fake topics. A repo with no data shows "Initial commit / passing checks". (b) Fake MCP count "288"/"288+" while the catalog has 7 entries. (c) "Zero-mock" hero copy contradicts the fabrication in the same view. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: render "unknown"/"—" for missing API fields, never invent; show the real MCP catalog count (7) or remove the badge; fix hero copy to be truthful.
Scope: `apps/quantmail/src/app/quantgit/page.tsx`.
Dependencies: none.

## QM-UIUX-029 — Purge "<5ms" search-performance claims (QM-SCREEN-026 not actually done)
Status: [ ] TODO
Finding: QM-SCREEN-026 required removing the absolute "<5ms" search claim, but it is still live: 5 placeholders in `QuantPillarTopBar.tsx` (including the exact cited string `'Search events, meetings, attendees… <5ms'`), a visible `<5ms LIVE` badge with pulsing dot, `QuantMailSuperAppHeader.tsx` placeholder, "Sub-5ms Performance" lines in booking and QuantGit. The `SearchBar` latency pill measures only the local FTS5 query while results come from the server — misleading. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/search-audit.md`.
Required: purge all `<5ms`/`Sub-5ms` from user-visible copy; re-mark QM-SCREEN-026 as not done; latency pill must measure end-to-end or be removed.
Scope: `QuantPillarTopBar.tsx`, `QuantMailSuperAppHeader.tsx`, booking, QuantGit.
Dependencies: QM-SCREEN-026 (reopen).

## QM-UIUX-030 — Search text must not persist across app tabs
Status: [ ] TODO
Finding: `QuantPillarTopBar` holds `internalSearch` via one-time `useState`; the topbar lives in layout-level `AppShell`, so switching Mail → Calendar → Drive leaves stale query text while the page's own `searchQuery` is empty. Known P1 from the customer audit, still present. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/search-audit.md`.
Required: key the search input by route or clear on tab switch.
Scope: `QuantPillarTopBar.tsx`, `AppShell`.
Dependencies: none.

## QM-UIUX-031 — Contacts/QuantGit/Settings P1s: touch targets, copy, pills
Status: [ ] TODO
Finding: (a) Contacts "+ New" add button ~24px tall (below 44px minimum) and the ONLY add path on mobile — add a proper FAB or enlarge; (b) "Sovereign" marketing fluff across Contacts/QuantGit/Settings copy ("instant sovereign dial", "verified sovereign tenants", "Quant Sovereign privacy guarantees"); (c) QuantGit meaningless "Cloud OS" pill; (d) Settings inconsistent crypto claims ("TLS 1.3" on account page vs "TLS 1.2+" on Security tab); (e) Search input 12px on mobile (iOS auto-zoom) — use `Status: [~] IN_PROGRESStext-base`; (f) Voice search silent failure when `SpeechRecognition` unavailable — honest disabled state. Evidence: contacts/quantgit/settings/search audit reports.
Required: fix each per the finding; no invented copy.
Scope: Contacts, QuantGit, Settings, Search components.
Dependencies: QM-UIUX-005 (type scale covers e).

## QM-UIUX-032 — QuantChat /call page simulates a call connection
Status: [~] IN_PROGRESS
Owner: muse-main
Branch: fix/qm-uiux-032-quantchat-call-simulation
Finding: `apps/quantchat/src/app/call/page.tsx:56` has the comment `// Simulate connection (in production, LiveKit SDK would handle this)` — it fakes a 1.5s "connecting" state then shows a connected call UI with zero participants and a running timer. No WebRTC, no media. This is a reachable route. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantchat-auth-audit.md`.
Required: wire to the real LiveKit path (`/meet/[roomId]` already does real `livekit-client` with server tokens), or delete the route. Never simulate a call.
Scope: `apps/quantchat/src/app/call/`.
Dependencies: none.

## QM-UIUX-033 — Delete dead VideoCall.tsx theater code
Status: [ ] TODO
Finding: `apps/quantchat/src/components/VideoCall.tsx` — 170 lines, no `RTCPeerConnection`/`getUserMedia`, fake "HD" indicator, local-only state toggles. Zero references outside its own file. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantchat-auth-audit.md`.
Required: delete the file before someone wires it up thinking it works.
Scope: `apps/quantchat/src/components/VideoCall.tsx`.
Dependencies: QM-UIUX-032 (same area; do together).

## QM-UIUX-034 — Accessibility P0s: input labels and focus indicators
Status: [x] DONE — PR #637 merged 2026-10-08 (113 inputs labeled, 46 focus rings; duplicate aria-label fixed)
Branch: fix/a11y-labels-focus-v2
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/637
Finding: (a) 113 visible inputs with no accessible name (WCAG 1.3.1/3.3.2/4.1.2) — e.g. `EmailSendLater.tsx:65,72` date/time inputs, `DockedComposer.tsx` "To" field uses `<span>` instead of `<label>`; (b) 46 elements use `focus:outline-none` with no fallback (WCAG 2.4.7) — including the command-palette search input. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/accessibility-audit.md`.
Required: real `<label htmlFor>` + `id` on every input; backfill `focus-visible:ring-2` where focus outline was killed.
Scope: `apps/quantmail/src/**`.
Dependencies: none.

## QM-UIUX-035 — Accessibility P1s: reduced-motion, icon labels, contrast
Status: [ ] TODO
Finding: (a) 127 animations ignore `prefers-reduced-motion` (WCAG 2.3.3) — add a global CSS kill-switch for `animate-*`; (b) 56 icon-only buttons without accessible names (WCAG 4.1.2) — add `aria-label`; (c) `#6B6E76` text fails WCAG AA at 76 usages (3.64-4.12:1, needs 4.5:1) — replace with `#8D96A0`. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/accessibility-audit.md`.Required: fix each per the finding.Scope: `apps/quantmail/src/**`; global CSS.
Dependencies: QM-UIUX-013 (gray consolidation covers c); QM-UIUX-034 (same area).

## QM-UIUX-036 — AI error honesty + global fetch timeout
Status: [ ] TODO
Finding: (a) `AIAssistant.tsx:171` catches errors and shows generic "Something went wrong" — the real exception is discarded; (b) no global fetch timeout — if the backend hangs forever, the spinner never resolves (PR #621 added 10s AbortController for auth; the same pattern is needed at the API layer). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/empty-error-states-audit.md`.
Required: surface sanitized `err.message` in AI errors; add a global fetch timeout so hung requests land on the honest ErrorState + retry.
Scope: `AIAssistant.tsx`; API fetch layer.
Dependencies: none.

## QM-UIUX-037 — App switcher: single accent-color source of truth
Status: [x] DONE — PR #638 merged 2026-10-08 (PILLAR_ACCENTS single source; rebased after #639; 34/34 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/638
Note 2026-10-08: rebased onto main after #639 merged (DesktopPillarRail deleted); PILLAR_ACCENTS now wired into shared pillarTiles.tsx; 34/34 tests pass; CI re-running.
Finding: mobile and desktop use DIFFERENT accent colors for the same apps (Drive: #34A853 green on mobile vs #F59E0B amber on desktop; all 5 apps differ). Two switchers, two color systems. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/appswitcher-audit.md`.
Required: single `PILLAR_ACCENTS` source of truth used by both mobile and desktop switchers. (The final per-app color mapping still needs the user's confirmation — this task only unifies the two systems to whatever mapping is decided.)
Scope: app switcher components (mobile + desktop).
Dependencies: none.

## QM-UIUX-038 — Delete dead DesktopPillarRail with banned glow
Status: [x] DONE — PR #639 merged 2026-10-08 (deleted 491-line dead DesktopPillarRail; tile defs in shared pillarTiles.tsx; 2/2 tests pass)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/639
Note: overlaps #638 (both touch DesktopPillarRail) — rebase #639 after #638 merges if conflict appears.
Owner: f2f8c3d4-1a2b-4c5d-8e9f-0a1b2c3d4e5f
Branch: fix/qm-uiux-038-pillarrail
Finding: `DesktopPillarRail.tsx` (400+ lines) still carries the glowing edge pill, tinted active background, and icon drop-shadow the user explicitly banned. Not rendered in production (AppShell uses `DesktopAppRail`, fixed by PR #624), but one rewire away from going live. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/appswitcher-audit.md`.
Required: delete the component; keep tile definitions in a shared file if still needed.
Scope: `apps/quantmail/src/components/DesktopPillarRail.tsx`.
Dependencies: QM-UIUX-037 (same area).

## QM-UIUX-039 — Performance: memoize EmailRow, lazy images, drop dead font
Status: [x] DONE — PR #640 merged 2026-10-08 (EmailRow memoized, 13 imgs lazy, Pacifico dropped, yjs lazy; 38/38 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/640
Owner: f929fb66-0810-4dbd-88ed-c06a3a84fddd (uuid c7d9e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f)
Branch: fix/qm-uiux-039-perf
Finding: (a) `EmailRow` not memoized in the virtualized inbox (`page.tsx:301`) — every parent state change re-renders all visible rows (only 1 `React.memo` in the whole codebase); (b) zero `next/image` usage — 13 raw `<img>`, 1 lazy; (c) Pacifico font loaded on every page but never used — dead network request; (d) yjs statically imported (~100KB+) before needed. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/performance-audit.md`.
Required: wrap `EmailRow` in `React.memo`; migrate to `next/image` or add `loading="lazy"`; remove Pacifico until used; dynamic-import yjs.
Scope: inbox page; `layout.tsx`; `useCollabDoc.ts`; image tags.
Dependencies: none.

## QM-UIUX-040 — Inbox P1s: swipe hint, cursor pagination, hook cleanup
Status: [ ] TODO
Finding: (a) swipe actions not discoverable — no hint for new users; (b) page-based pagination can drift when new mail arrives during scroll — cursor-based is correct; (c) `useInfiniteInbox` and `useInbox` both exist — verify which is live, delete the dead one. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/inbox-deep-audit.md`.
Required: one-time dismissible swipe hint; cursor pagination; remove dead hook.
Scope: inbox components and hooks.
Dependencies: none.

## QM-UIUX-041 — HTML email: strip inline styles for dark mode
Status: [~] IN_PROGRESS — Owner: 8a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d; Branch: fix/qm-uiux-041-email-darkmode
Finding: `<div style="background:#ffffff">` and `<p style="color:#333">` survive DOMPurify sanitization — verified with real DOMPurify run using prod config. Result: white boxes in the black read view (violates "fully black" rule) and dark-gray-on-black unreadable text. Zero dark-mode CSS rewriting exists. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/html-email-audit.md`.
Required: post-sanitize pass stripping `background*`/`color` from inline styles (~15 lines in `sanitize.ts`).
Scope: email HTML sanitizer (`lib/safe-html`, `sanitize.ts`).
Dependencies: none.

## QM-UIUX-042 — HTML email: remote image consent (tracking pixels)
Status: [x] DONE — PR #643 merged 2026-10-08 (remote images blocked by default; consent banner; per-sender allowlist; 13/13 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/643
Finding: remote images load with no consent — no blocking, no "Show images" banner, no per-sender trust. Every `<img>` hits the sender's server on open (IP + timestamp = silent read receipt). Weaker than Gmail/Apple Mail. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/html-email-audit.md`.
Required: default-block remote images; one-tap "Show images" banner; per-sender allowlist.
Scope: email body renderer (`EmailLetterCard.tsx`, `useSafeEmailHtml`).
Dependencies: none.

## QM-UIUX-043 — HTML email: forbid class attribute
Status: [ ] TODO
Finding: email HTML renders inside the app DOM, so `class="bg-white text-black"` applies real Tailwind utilities to attacker-controlled markup — breaks the black UI. Not XSS, but visual breakage. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/html-email-audit.md`.
Required: add `'class'` to `EMAIL_FORBID_ATTR` (one line).
Scope: email sanitizer config.
Dependencies: none.

## QM-UIUX-044 — App-switch blur: load-tied, drop full-main filter blur
Status: [x] DONE — PR #644 merged 2026-10-08 (load-tied blur; transform+opacity only; 43/43 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/644
Finding: (a) app-switch blur is a fixed 380ms timer (`AppShell.tsx:614`), not load-tied — route loads in 50ms → user stares at blur for 330ms for nothing; route takes 800ms → blur lifts mid-load; (b) `filter: blur(10px)` on full `<main>` (`AppShell.tsx:1000`) is NOT GPU-composited — repaints entire inbox list every frame, real jank risk on low-end mobile. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/motion-audit.md`.
Required: tie `setIsSwitching(false)` to real route settle (380ms as max fallback); restrict blur to lightweight overlay or drop for transform+opacity only.
Scope: `AppShell.tsx`.
Dependencies: none.

## QM-UIUX-045 — Delete fake AIInlineSummary
Status: [~] IN_PROGRESS — Owner: 3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a; Branch: fix/qm-uiux-045-fake-ai
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/641
Finding: `AIInlineSummary` labeled "AI summary" (aria-label + sparkle icon) but is pure keyword matching (`includes('action required')` → "Action needed"). Its own comment admits "In production, this would call the AI backend" — the upgrade path doesn't exist. Zero usages (dead). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quanty-ai-audit.md`.
Required: delete the component; if summarization is wanted, wire to the real `aiSummarize` backend (QM-UIUX-046).
Scope: `AIInlineSummary` component.
Dependencies: none.


## QM-UIUX-046 — Summarize: add UI entry point in thread view
Status: [x] DONE — PR #652 merged 2026-10-08 (real summarize entry point in thread view; 6/6 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/652
Finding: backend `POST /emails/:id/summarize`, `apiClient.aiSummarize`, and well-designed `AISummaryCard` all exist — but nothing mounts or calls them. No "Summarize" button in thread view. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quanty-ai-audit.md`.
Required: add "Summarize" entry point in thread view wired to the real backend.
Scope: thread view; `AISummaryCard`.
Dependencies: QM-UIUX-045 (decide fake vs real first).

## QM-UIUX-047 — AI Memory: mount the panel (no surface today)
Status: [ ] TODO
Finding: real CRUD on `/api/drive/memory` with delete-confirm, but `AIMemoryPanel` is never mounted. Users can't see or forget what Quanty remembers. No duplicate cards in inbox (verified gone). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quanty-ai-audit.md`.
Required: mount `AIMemoryPanel` in an appropriate surface (settings or Quanty drawer); verify no duplicates.
Scope: `AIMemoryPanel`; settings or drawer.
Dependencies: none.

## QM-UIUX-048 — Delete dead "AI-powered" components (Nudge, Digest)
Status: [x] DONE — PR #651 merged 2026-10-08 (dead fake AI Nudge/Digest deleted)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/651
Finding: `EmailNudge.tsx` ("Smart Nudge — AI-powered contextual reminders") and `InboxDigest.tsx` ("AI-powered Inbox Digest") have no AI and no renderers. Dead components with fake claims. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quanty-ai-audit.md`.
Required: delete both, or build honestly with real backend.
Scope: `EmailNudge.tsx`, `InboxDigest.tsx`.
Dependencies: none.

## QM-SCREEN-032 — Calendar reminders must come only from the authoritative reminder domain
Status: [ ] TODO
Finding: the current branch still seeds a production-looking `rem-4` reminder directly in both `apps/quantmail/src/components/CalendarSubViews.tsx` and `apps/quantmail/src/app/calendar/components/CalendarRemindersView.tsx`. The standalone Flutter Calendar model also seeds a `rem-4` reminder. These records can appear as user activity without an authoritative Calendar API record and the web/Flutter copies are not guaranteed to converge.
Required: remove seeded production reminder/activity records from every Calendar surface; load reminders/tasks from the canonical Calendar contract; define pagination/range loading, CRUD, optimistic reconciliation, offline behavior and cross-device convergence; empty accounts must remain empty.
Scope: `apps/quantmail/src/components/CalendarSubViews.tsx`; `apps/quantmail/src/app/calendar/components/CalendarRemindersView.tsx`; `flutter_apps/apps/quant_calendar/lib/models/calendar_models.dart`; Calendar API/service/tests.
Dependencies: QM-SCREEN-008/009; QM-WORK-007; QM-PLAT-006.
Validation: source search on 2026-10-08 reproduced `rem-4` in all three Calendar surfaces; no implementation claim yet.

## QM-SCREEN-033 — Drive mobile vault security state must match the actual encryption contract
Status: [ ] TODO
Finding: `apps/quantmail/src/app/drive/components/DriveVaultSubView.tsx` explicitly says client-side encryption is not available yet, while `DriveMobileTabStrip.tsx` still exposes an `E2EE` badge and encrypted-vault accessibility label. This is a direct same-product contradiction and can cause users to infer a cryptographic guarantee that the current Drive surface does not provide.
Required: derive the vault security badge/label from one authoritative encryption capability contract; until client-side encryption is actually available and reviewed, remove the E2EE claim from mobile and desktop indicators. If a Secret Notes/Vault Documents zero-knowledge path is retained, scope the claim to that exact resource type and document key lifecycle/availability rather than branding the general Drive vault.
Scope: `apps/quantmail/src/app/drive/components/DriveVaultSubView.tsx`; `apps/quantmail/src/app/drive/components/DriveMobileTabStrip.tsx`; Drive encryption/capability contract.
Dependencies: QM-TRUST-003; QM-SCREEN-010/011; QuantDrive security architecture.
Validation: source audit on 2026-10-08 confirmed the contradictory copy in both components; no remediation implementation claim yet.

## QM-SCREEN-034 — Contacts must purge seeded public-figure identities across Web and Flutter
Status: [ ] TODO
Finding: the current Web Contacts implementation still exports `SOVEREIGN_DEFAULT_CONTACTS` containing real public figures (Sundar Pichai, Satya Nadella, Sam Altman) with fabricated-looking phone/email/contact metadata, and the same component renders a hard-coded Sundar Pichai collision/Personal Address Book scenario plus executive/circle membership derived from named people. Flutter separately seeds the same real-person identities in `composer_models.dart` and the Contacts pillar. This is broader than the previously tracked Web contact-list cleanup: the platform-specific Flutter composer/VIP/circle surfaces can still inject invented identities even after the Web default-contact path is removed.
Required: remove all production seeded public-figure identities and fabricated contact details from Web and Flutter; make autocomplete, VIP, collision, company and circle views derive only from the authenticated user's contact domain; keep fixtures confined to explicit tests; ensure phone/call actions can only target an actual user-owned contact record.
Scope: `apps/quantmail/src/app/contacts/components/ContactsSubViews.tsx`; `apps/quantmail/src/app/contacts/page.tsx`; `flutter_apps/apps/quant_mail/lib/models/composer_models.dart`; `flutter_apps/apps/quant_mail/lib/screens/contacts/contacts_pillar_view.dart`; contact APIs/services/tests.
Dependencies: QM-UIUX-026; QM-SCREEN-012; QM-PLAT-006.
Validation: source search on 2026-10-08 reproduced public-figure seed data in both Web and Flutter; no remediation implementation claim yet.

## QM-SCREEN-035 — QuantGit Security Center must never manufacture vulnerability state
Status: [ ] TODO
Finding: `apps/quantmail/backend/routes/repos.ts` initializes repository security state from hard-coded `DEFAULT_BACKEND_DEPENDABOT_ALERTS`, `DEFAULT_BACKEND_SECRET_ALERTS`, and `DEFAULT_BACKEND_CODEQL_ALERTS`; the scan endpoint returns fixed metrics (`48` files, `14` commits, `124ms`) without performing a scan; and the Dependabot fix-PR endpoint generates a random PR number with `Math.random()`. The UI therefore has a path where critical vulnerabilities, leaked secrets, scan completion and remediation PRs can appear authoritative without coming from repository/scanner state.
Required: replace seeded security findings with repository-authoritative scanner integrations/results; persist scan jobs/results with provenance, commit/ref, timestamps and scanner version; make scan status asynchronous and truthful; create fix PRs only through the real QuantGit PR mutation path and return its authoritative ID; render unavailable/not-configured/never-scanned states explicitly. Never use deterministic-looking seeded findings or fixed scan metrics as production security evidence.
Scope: `apps/quantmail/backend/routes/repos.ts`; QuantGit SecurityTab and related security APIs/services; scanner/job infrastructure; PR creation path; tests.
Dependencies: QM-SCREEN-013; QM-PLAT-013; QuantGit security architecture.
Validation: source audit on 2026-10-08 confirmed hard-coded findings, fixed scan metrics and random PR-ID generation; no remediation implementation claim yet.

## QM-SCREEN-036 — QuantGit Secret Scanning must not ship raw secret material in backend source
Status: [ ] TODO
Finding: `DEFAULT_BACKEND_SECRET_ALERTS` contains literal `rawMatch` values including an AWS access-key example, GitHub/GitLab tokens, an OpenAI API-key-shaped value, an RSA private-key fragment and a database connection string/password. Even if these are intended as fixtures, they live in a production backend route module and are returned as part of the security-alert model path. This violates the secret-scanning trust boundary and risks accidental exposure through logs, API responses or future UI wiring.
Required: remove all raw secret material from production code; use non-sensitive fingerprints/masked placeholders only in tests; ensure API DTOs can never include raw secret values; add regression tests that reject secret-shaped fixture content and assert only masked/fingerprint metadata crosses the API boundary. If scanner fixtures are needed, isolate them under test-only modules that cannot be imported by production routes.
Scope: `apps/quantmail/backend/routes/repos.ts`; QuantGit security DTOs; secret-scanner tests/fixtures.
Dependencies: QM-SCREEN-035; security/secrets architecture.
Validation: source audit on 2026-10-08 inspected the default secret-alert array and confirmed raw secret-shaped values are embedded in the backend route; no remediation implementation claim yet.

## QM-SCREEN-037 — Remove the dead Drive legacy sample dataset from production source
Status: [ ] TODO
Finding: `apps/quantmail/src/components/DriveSubViews.tsx` still allocates a large `_sampleFeedItems` array with invented file names, sizes, dates, media metadata and preview gradients. The code comment says it is “kept for reference” and it is not rendered, but the repository's implementation-status document independently lists this exact dataset as a dead legacy dataset that should be removed. Keeping it in the production component creates a second implied data model and makes future regressions easier: a later refactor can accidentally re-enable fabricated Drive activity.
Required: delete the legacy `_sampleFeedItems` dataset and any now-unused types/imports/helpers; keep representative feed fixtures only in explicit test/Storybook fixture locations; add a regression check that the Drive feed has no production seed dataset and is populated only from the canonical Drive API/query layer.
Scope: `apps/quantmail/src/components/DriveSubViews.tsx`; Drive feed tests/fixtures; dead-code baseline if applicable.
Dependencies: QM-SCREEN-033; Drive data-source consolidation.
Validation: source inspection on 2026-10-08 found the dataset still present at the component level; repository implementation-status documentation also flags the same dataset for removal. It is currently non-rendered, so this is a cleanup/integrity task rather than a claim that users currently see these files.


## QM-UIUX-049 — QuantMax feed desktop adaptation
Status: [x] DONE — PR #653 merged 2026-10-08 (QuantMax desktop: centered column + keyboard/wheel nav; 254/254 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/653
Finding: QuantMax feed has zero desktop adaptation (`quantmax/src/pages/index.tsx`) — touch-only swipe, no keyboard arrows/space, no wheel handler, no `md:`/`lg:` breakpoints. Full-bleed `h-screen w-full` video stretched across wide screens instead of centered phone-like column (TikTok web pattern). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/satellite-desktop-audit.md`.
Required: `md:max-w-[420px]` centered column + arrow-key/wheel nav (~30 lines).
Scope: `apps/quantmax/src/pages/index.tsx`.
Dependencies: none.

## QM-UIUX-050 — Schedule-send broken on full-page /compose
Status: [x] DONE — PR #645 merged 2026-10-08 (full-page schedule-send calls sendEmail with sendAt; 21/21 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/645
Finding: `app/compose/page.tsx` `handleSend` does `if (data.scheduledAt) return;` — saves draft, never calls `sendEmail`. Toast says "Email scheduled" but draft sits in Drafts forever, never delivered. Root cause: frontend sends `scheduledAt`, backend compose schema only accepts `sendAt` (zod silently strips it). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/drafts-schedule-audit.md`.
Required: one-line fix — `apiClient.sendEmail(draft.id, { sendAt: data.scheduledAt })`.
Scope: `apps/quantmail/src/app/compose/page.tsx`.
Dependencies: none.

## QM-UIUX-051 — Draft autosave (no autosave today; comment lies)
Status: [x] DONE — PR #646 merged 2026-10-08 (real 10s debounced draft autosave; 14/14 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/646
Finding: zero `setInterval` in EmailComposer/DockedComposer — draft saving is manual-only. But `handleSaveDraft`'s comment claims "A draft save happens on a timer". False. Work is lost if user navigates away without pressing Save. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/drafts-schedule-audit.md`.
Required: real autosave on a timer + honest save-state indicator; fix/remove the lying comment.
Scope: `EmailComposer.tsx`, `DockedComposer.tsx`.
Dependencies: none.

## QM-UIUX-052 — New email must create a notification (bell never fires)
Status: [x] DONE — PR #647 merged 2026-10-08 (notification created on new mail; spam skipped; idempotent; 53/53 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/647
Finding: `apps/quantmail/backend/routes/inbound-webhook.ts` stores inbound mail but never creates a `prisma.notification` record. `emails.ts:37` instantiates `CrossAppDispatcher` and never calls it (0 usages). The bell can never fire for real mail. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/notif-backend-audit.md`.
Required: wire new-mail arrival → notification creation.
Scope: `apps/quantmail/backend/routes/inbound-webhook.ts`, `emails.ts`.
Dependencies: none.

## QM-UIUX-053 — Push notifications unwired (no delivery path)
Status: [ ] TODO
Finding: `PushService` (real FCM/APNs code) is never instantiated. No device-token registration, no service worker, no VAPID, no `PushSubscription` writes from QuantMail. No delivery path from server to device exists. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/notif-backend-audit.md`.
Required: wire the push delivery path (device registration → subscription → PushService invocation).
Scope: QuantMail backend + frontend.
Dependencies: QM-UIUX-052 (notifications must exist first).

## QM-UIUX-054 — Notification engine facade: wire or delete
Status: [ ] TODO
Finding: `NotificationFanout.fanout()` only returns routing decisions — never persists or sends. `InAppNotificationService` has zero instantiations. `server-core` notifications plugin wires singletons nothing invokes. ws-gateway `'notifications'` channel has zero publishers. ~15 files of dead infrastructure. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/notif-backend-audit.md`.
Required: wire the engine into the real path (QM-UIUX-052) or delete the dead files.
Scope: notification engine files.
Dependencies: QM-UIUX-052.

## QM-SCREEN-038 — Standalone QuantDrive Flutter must stop rendering hardcoded user/storage truth
Status: [ ] TODO
Finding: the standalone Flutter QuantDrive app is currently driven by an in-memory `DriveDataSource` rather than an authoritative Drive API/domain source. `flutter_apps/apps/quant_drive/lib/data/drive_data_source.dart` hardcodes user-looking storage/telemetry values (`14.2 GB` used of `100 GB`, `4.8 GB` reclaimable, `94.2%` bandwidth saved, `76,800` duplicate chunks, `82.8 GB` raw ingest and related FastCDC parameters) and also contains seeded file/share/version records. Multiple reachable production screens instantiate `DriveDataSource.instance` directly, including Drive Explorer, Shared Files, Starred Files, FastCDC Cleaner, Cryptographic Vault, file preview and the app shell. This means the standalone app can present invented files, collaborators, versions, quota and deduplication telemetry without a backend response, and local star/reclaim mutations do not establish cross-device/domain persistence.
Required: replace the production singleton dataset with the canonical QuantDrive API/domain contract; hydrate identity, files/folders, shares/ACLs, versions, starred/trash state, quota, deduplication/cleaner telemetry and vault capability from authoritative sources. Mutations must be authenticated, authorized and persisted server-side with optimistic/offline reconciliation where supported. Empty/new accounts must render empty/unknown states rather than seeded files or telemetry. Keep representative fixtures only in explicit test/demo builds and prevent production imports of those fixtures.
Scope: `flutter_apps/apps/quant_drive/lib/data/drive_data_source.dart`; `flutter_apps/apps/quant_drive/lib/main.dart`; `flutter_apps/apps/quant_drive/lib/screens/drive_explorer_screen.dart`; `shared_files_screen.dart`; `starred_files_screen.dart`; `fastcdc_cleaner_screen.dart`; `cryptographic_vault_screen.dart`; `file_preview_lightbox.dart`; QuantDrive API/auth/sync contracts; tests.
Dependencies: QM-SCREEN-027; QM-SCREEN-033; QM-PLAT-006; QuantDrive architecture.
Validation: source audit on 2026-10-08 reproduced hardcoded quota/telemetry in `DriveDataSource` and direct `DriveDataSource.instance` consumption across the listed production screens; no remediation implementation claim yet. Test file values matching the same baseline do not make the production singleton authoritative.


## QM-SCREEN-039 — QuantDrive public-link role must match the capabilities actually exposed
Status: [ ] TODO
Finding: `POST /drive/shares/link` lets an owner create a public link with role `viewer` or `editor`, and the UI presents the latter as “Can edit”. The unauthenticated public-link surface currently exposes metadata and a download endpoint only; `GET /drive/public/share/:token/download` streams the file and there is no corresponding public-link mutation endpoint that authorizes editor writes. This makes an `editor` public link claim a capability the public contract does not actually provide and risks confusing users about what possession of the link permits.
Required: either remove the public `editor` option until a complete, separately authorized public-edit contract exists, or implement the full capability deliberately: authenticated/anonymous write authorization bound to the link, safe mutation scope, versioning/concurrency, abuse/rate limits, revocation/expiry enforcement and audit trail. UI role labels must be generated from the same capability contract as the public API. Never advertise editor access when the link is download-only.
Scope: `apps/quantmail/backend/routes/drive.ts`; `apps/quantmail/src/app/drive/components/FileShareModal.tsx`; public Drive share contract/tests.
Dependencies: QM-SCREEN-027; QuantDrive sharing/security architecture.
Validation: source audit on 2026-10-08 confirmed `role: viewer|editor` in link creation and only metadata/download handlers for the token; no public editor mutation endpoint was found. No remediation implementation claim yet.

## QM-SCREEN-040 — QuantDrive share notifications must report actual delivery state
Status: [ ] TODO
Finding: `POST /drive/files/:id/share` creates an inbox email record directly and sets `deliveryStatus: 'delivered'` without invoking the mail delivery/outbox pipeline. If the Prisma email write fails, the code catches the error, leaves `notificationSent = false`, but still returns `notificationSent: true` both inside the share DTO and at the top level. The result can therefore tell the owner that a notification was delivered when no notification was created, and even when created the record is marked delivered without delivery evidence.
Required: route share invitations through the canonical transactional-outbox/mail-delivery contract; distinguish persisted/in-queue/sent/delivered/bounced/failed states; return the actual state rather than hard-coded success. Share creation must remain successful if notification delivery is asynchronous, but the UI must say “Invitation queued” (or equivalent) until delivery is authoritative. Add tests for email-service unavailable, outbox retry, duplicate invitation/idempotency and eventual delivery status.
Scope: `apps/quantmail/backend/routes/drive.ts`; mail outbox/delivery service; Drive share UI; notification tests.
Dependencies: QM-BACK-001; QM-SCREEN-027; mail delivery architecture.
Validation: source audit on 2026-10-08 reproduced `deliveryStatus: 'delivered'`, best-effort catch behavior and unconditional `notificationSent: true` in the Drive share response. No remediation implementation claim yet.


## QM-SCREEN-041 — QuantDrive folder sharing must have a complete authoritative ACL path
Status: [ ] TODO
Finding: the QuantDrive persistence model already supports both `fileId` and `folderId` on `drive_shares`, `loadDecorations()` maps folder shares into folder DTOs, and `GET /drive/shares/received` explicitly returns folder-share records. The product architecture also describes QuantDrive as providing “granular sharing/ACLs”. However, the inspected production mutation/access path only exposes `GET/POST/DELETE /drive/files/:id/share...` for file targets; `shareSchema` contains only an email and permission, there is no corresponding folder-share creation/revoke contract, and `fileAccess()` authorizes a user only from a direct accepted file share. A folder share therefore has a persistence representation and read-side DTO shape without a complete mechanism to create it or inherit its permission to files beneath the folder.
Required: define one canonical folder-sharing contract before exposing folder ACLs: owner-only create/update/revoke, recipient identity validation, permission semantics, pending/accepted lifecycle, notification/outbox integration, and audit events. Define and test inheritance semantics explicitly (for example, whether accepted folder access grants access to existing and newly created descendants, how direct file ACLs override/merge, and what happens when a folder/file is moved). Extend authorization so every file/folder read/write/download/preview/version operation evaluates the canonical effective ACL rather than only direct file shares. Keep folder-share records out of the API unless they are actionable, and ensure Web/Flutter received-share views use the same effective-permission model.
Scope: `apps/quantmail/backend/routes/drive.ts`; Drive share schema/migrations; `apps/quantmail/src/hooks/useDrive.ts`; Web/Flutter shared-folder UI; authorization service; notification/outbox; ACL and cross-platform parity tests.
Dependencies: QM-SCREEN-027; QM-SCREEN-039; QM-SCREEN-040; QuantDrive sharing/security architecture.
Validation: source audit on 2026-10-08 confirmed `drive_shares.folderId` in the persistence schema, folder-share decoration/received-share read paths, but no folder-share mutation route and no folder-aware `fileAccess()` authorization. Product docs also explicitly describe granular sharing/ACLs. No remediation implementation claim yet.


## QM-SCREEN-042 — QuantDrive version restore must preserve version history and authoritative current-state semantics
Status: [ ] TODO
Finding: QuantDrive is documented as a versioned object store with “file versioning + restore”. The production restore route `POST /drive/files/:id/versions/:versionId/restore` reads the selected historical object and directly overwrites the file's current `encryptedContent`, encryption metadata, hash and size. It does **not** create a new `FileVersion` representing the pre-restore current state or the restore operation. Consequently, restoring an older version can move the current pointer backward without recording the state that was replaced, making the operation non-auditable as a version transition and potentially causing a user to lose a recoverable current state if that state was not already represented by a version row.
Required: define the canonical restore invariant explicitly. Preferred behavior is non-destructive restore: treat restore as a new version whose content equals the selected historical version, atomically update the file's current pointer to the new version, retain all prior versions, and record actor/time/sourceVersion metadata for audit. If destructive pointer restore is intentionally required, document that contract and provide an explicit snapshot/audit record before replacement; do not leave semantics ambiguous. Ensure version numbering is concurrency-safe, object references remain immutable, quota accounting handles the new retained object correctly, and authorization is evaluated through the effective Drive ACL. Web and Flutter version-history UIs must consume the authoritative returned version/current state and refresh history after restore. Add concurrency, rollback, authorization, deleted-file and cross-device tests proving no historical state disappears after restore.
Scope: `apps/quantmail/backend/routes/drive.ts`; Drive `FileVersion` schema/migration if needed; version-history service; `apps/quantmail/src/components/drive/FileVersionHistoryModal.tsx`; `apps/quantmail/src/hooks/useDrive.ts`; Flutter QuantDrive version UI/data source; audit/version tests.
Dependencies: QM-SCREEN-027; QM-SCREEN-038; QM-SCREEN-041; QuantDrive versioning/storage architecture.
Validation: source audit on 2026-10-08 confirmed the restore handler directly updates the current `File` row from the selected `FileVersion` and returns without creating a new version/audit record. Product documentation independently describes QuantDrive as versioned with restore. No remediation implementation claim yet.


## QM-SCREEN-043 — QuantDrive quota reservations must be transactionally/concurrently safe
Status: [ ] TODO
Finding: StorageQuotaService.reserveQuota() is documented in the production code as an atomic reservation that “prevents parallel uploads from bypassing the user's storage quota”, but the implementation performs checkQuota() first and only afterwards inserts the reservation into a process-local static Map. checkQuota() itself reads database usage and the current in-memory reservations across async boundaries. Two concurrent uploads can therefore both observe the same remaining capacity before either reservation is recorded, then both succeed and collectively exceed the configured quota. The reservation state is also process-local, so separate backend workers/instances do not share reservations at all; a restart loses pending reservations. This is a correctness issue even before horizontal scaling because the check-and-reserve sequence is not one atomic operation.
Required: move quota reservation state and the check/reserve invariant into an authoritative shared persistence mechanism (preferably a database reservation/lease table with a transaction and row/advisory lock or equivalent atomic conditional update). The invariant must be enforced server-side as persisted non-deleted usage + active reservations + requested bytes <= effective tier limit. Make reservation creation idempotent by reservation/upload ID, define lease expiry and cleanup semantics, and make commit/release atomic with the corresponding upload lifecycle. Handle concurrent uploads, retries, abandoned uploads, process restarts and multiple backend instances without double-counting or losing reservations. Do not rely on a process-local static Map for production quota enforcement. Add stress/concurrency tests that launch overlapping reservations near the quota boundary and assert that at most the allowed capacity is admitted, plus restart/multi-worker and retry/idempotency tests.
Scope: apps/quantmail/backend/services/storage-quota.service.ts; Prisma schema/migration for durable reservations; upload/chunked/multipart lifecycle services and routes; quota API; deployment/runtime assumptions; quota/concurrency tests.
Dependencies: QM-SCREEN-038; Drive upload/storage architecture; durable job/state infrastructure.
Validation: source audit on 2026-10-08 confirmed reserveQuota() calls checkQuota() before StorageQuotaService.reservations.set(), while the reservations are a process-local static Map; the source comment explicitly claims atomic parallel-upload protection. No remediation implementation claim yet.

## QM-UIUX-055 — QuantChat: fix typing indicators (protocol mismatch)
Status: [x] DONE — PR #648 merged 2026-10-08 (typing protocol aligned to backend; 42/42 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/648
Finding: `useRealtimeChat` publishes `{type:'typing:start'}` frames the backend silently ignores (backend only handles `type:'typing'`), and subscribes to `chat:<id>` channel the backend never sends to. `typingUsers` always empty — typing indicators never render. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantchat-realtime-audit.md`.
Required: align frontend/backend typing protocol; verify indicators render.
Scope: `apps/quantchat/src/` realtime hooks.
Dependencies: none.

## QM-UIUX-056 — QuantChat: failed sends vanish silently
Status: [x] DONE — PR #650 merged 2026-10-08 (failed-send error UI + retry; 1197/1197 tests)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/650
Finding: `handleSend` calls `sendMessage.mutate()` with no `onError` and no error UI. No optimistic message — on REST failure the user's text just disappears. No retry, no "failed" state. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantchat-realtime-audit.md`.
Required: error UI + retry for failed sends; don't lose user text.
Scope: QuantChat conversation page.
Dependencies: none.

## QM-UIUX-057 — QuantChat: delete dead realtime implementations
Status: [x] DONE — PR #654 merged 2026-10-08 (~1000 lines dead realtime code deleted; 544/544 tests; RealtimeProvider kept — see QM-UIUX-060)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/654
Finding: FOUR competing realtime implementations (1,630 lines): `websocket-client.ts` (477 lines, zero usages), `useChat.ts` (284 lines, zero usages), `RealtimeProvider` (live socket, dead protocol), `chat-socket` singleton (only working path). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantchat-realtime-audit.md`.
Required: delete the three dead paths; keep only the working singleton.
Scope: `apps/quantchat/src/`.
Dependencies: QM-UIUX-055 (typing fix touches same area).

## QM-UIUX-058 — Custom folders: wire to backend API
Status: [x] DONE — PR #655 merged 2026-10-08 (custom folders sync to backend; legacy local folders migrated; tsc clean)
Finding: backend `/api/folders` CRUD exists and is tested, but UI creates folders with local IDs in `localStorage` only. No cross-device sync; lost on storage clear. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/labels-folders-audit.md`.
Required: wire `handleCreateFolder` to POST `/api/folders`.
Scope: `apps/quantmail/src/app/page.tsx:1269`.
Dependencies: none.

## QM-UIUX-059 — Flutter: purge fake data (contacts, stats, claims)
Status: [x] DONE — PR #649 merged 2026-10-08 (Flutter fake contacts/stats/claims/streaming purged)
PR: https://github.com/quantrinitylab/Quant-Ecosystem/pull/649
Finding: Flutter QuantMail still ships fake contacts with real people's names (Demis Hassabis etc., `isVerified: true`), fake QuantGit stats ('14.8k stars'), `<5ms FTS5` claims, fake "Quanty AI" simulated streaming, `MailHeaderSecurity` defaulting every mail to 'Kyber-1024 + AES-256-GCM' with SPF/DKIM/DMARC 'PASS', hardcoded unread badges and infra claims. Web purged all of these; Flutter didn't. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/flutter-parity-audit.md`.
Required: remove all fake data/claims from Flutter app (same purge standard as web).
Scope: `flutter_apps/apps/quant_mail/`.
Dependencies: none.


## QM-SCREEN-044 — QuantDrive public-link management must be fully surfaced and authoritative
Status: [ ] TODO
Finding: QuantDrive **does have** an owner-only backend revoke endpoint: `DELETE /drive/shares/link/:id` deletes the corresponding `DriveShare` row, so the earlier audit wording that no revoke endpoint exists was incorrect and is superseded by this corrected task. The remaining production gap is the client lifecycle: the main `FileShareModal.tsx` creates a public link and keeps only the returned URL in local React state; it does not hydrate existing `DriveShare` records, show all active links, expose the backend revoke action, or reconcile link state across devices/sessions. The backend public metadata/download handlers treat absence of the row as invalid, so deletion is authoritative, but the Web UI does not expose that authoritative lifecycle. Repeated link creation can therefore leave multiple valid public tokens with no visible inventory or per-link management in the main Share modal.
Required: expose a canonical QuantDrive public-link management contract: list links for an owner/file with role, creation time, expiry and active state; revoke an individual link through the existing owner-authorized `DELETE /drive/shares/link/:id`; hydrate the Share modal from that source whenever opened; reconcile create/revoke responses into local state and refresh on focus/retry so multiple devices converge. Define and test whether generating a new link coexists with or replaces previous links. Public metadata/download must continue to reject deleted/revoked rows and expired links. Add tests for immediate revoke, expired links, repeated link creation, unauthorized revoke, deleted files, password-protected links, concurrent revoke/download races and cross-device visibility.
Scope: `apps/quantmail/backend/routes/drive.ts`; DriveShare Prisma/API types; `apps/quantmail/src/app/drive/components/FileShareModal.tsx`; Drive client hooks; public-share tests.
Dependencies: QM-SCREEN-027; QM-SCREEN-039; QuantDrive sharing/security architecture.
Validation: source audit on 2026-10-08 confirmed `DELETE /drive/shares/link/:id` exists and owner-checks `createdById` before deleting the `DriveShare`; the same audit confirmed the main Web `FileShareModal.tsx` resets `publicShareUrl` locally on open and has no fetch/revoke call for existing DriveShare records. No remediation implementation claim yet.

## QM-SCREEN-045 — QuantDrive search must use the canonical authorized-content scope
Status: [ ] TODO
Finding: the production `GET /drive/search` route searches only files and folders where `userId` equals the current authenticated user. QuantDrive separately exposes accepted received shares through `GET /drive/shares/received`, and `fileAccess()` allows an accepted shared file to be downloaded and previewed. Therefore a user can have legitimate Drive access to a shared file while the global Drive search endpoint categorically excludes that file because it is not owned by the user. The current implementation also uses a simple filename `contains` query rather than the broader content/search capability described elsewhere in the product architecture, so search scope and authorization scope are not represented by one canonical contract.
Required: define the authoritative search scope as the set of Drive resources the caller is actually authorized to discover, and make the search service enforce that scope rather than duplicating owner-only filtering. Decide explicitly whether accepted file shares and inherited folder shares are searchable; if they are, include them without leaking metadata from unaccepted/declined/revoked shares. Align filename search, AI/content search and any future semantic index around the same authorization predicate, with consistent visibility of owner, name, folder context, snippets and ranking. Ensure deleted/trash items, public-link-only access and pending shares are handled according to the documented product policy. Add tests proving owner, accepted-share, revoked-share, declined-share and folder-inherited access produce exactly the intended search visibility across Web and Flutter.
Scope: `apps/quantmail/backend/routes/drive.ts`; Drive search/index services; `apps/quantmail/src/hooks/useDrive.ts`; Web/Flutter search UI and DTOs; ACL/search authorization tests.
Dependencies: QM-SCREEN-041; QM-SCREEN-038; QuantDrive search/ACL architecture.
Validation: source audit on 2026-10-08 reproduced `GET /drive/search` queries with `where: { userId, isDeleted: false, ... }`, while the same backend exposes accepted received shares and `fileAccess()` authorizes direct accepted shared files. Product architecture separately describes QuantDrive search/content capabilities. No remediation implementation claim yet.

## QM-SCREEN-046 — QuantDrive folder moves must validate the full hierarchy and commit atomically
Status: [ ] TODO
Finding: the production folder-move implementation claims cycle detection, but `folderTree()` stops traversal after `MAX_DEPTH = 30`. `handleMove()` relies on that bounded result before changing `parentId`. A folder hierarchy deeper than 30 levels can therefore contain a descendant beyond the inspection limit; moving an ancestor into that descendant may bypass the intended circular-reference check and create an invalid cycle. The same move operation is not one database transaction: files are updated first, each requested folder is updated separately, and descendant `path` rows are rewritten one-by-one. A later validation/update failure can leave `parentId` and path data partially changed, while the endpoint can still have already moved earlier items. `POST /drive/move` and the compatibility `POST /drive/files/move` both call the same non-transactional handler.
Required: replace the depth-limited cycle check with an authoritative hierarchy invariant that cannot be bypassed by depth (for example, a transactionally validated ancestor walk, recursive query/CTE where supported, or a persisted closure/path strategy with explicit integrity checks). Reject the move before mutating anything if the target is the moved folder itself or any descendant at any depth. Execute a multi-file/multi-folder move as one database transaction with deterministic locking/order so `parentId` and every affected descendant path are committed together or not at all. Validate all requested IDs and target ownership/state before the transaction, return actual moved counts, and never silently skip invalid/missing requested items. Add tests for >30-level trees, deepest-descendant cycle attempts, multi-item moves with injected failure, concurrent moves, stale target folders, duplicate IDs and cross-device reads during/after a move.
Scope: `apps/quantmail/backend/routes/drive.ts`; folder hierarchy schema/indexes; Drive move API/client; Web/Flutter folder navigation; hierarchy integrity and concurrency tests.
Dependencies: QM-SCREEN-041; QuantDrive folder/ACL architecture; durable transaction/concurrency infrastructure.
Validation: source audit on 2026-10-08 reproduced `MAX_DEPTH = 30` in `folderTree()` and confirmed `handleMove()` performs separate `file.updateMany`, `folder.update`, and descendant updates without a surrounding transaction; missing folder IDs are explicitly skipped and requested file counts are returned rather than database-confirmed counts. No remediation implementation claim yet.

## QM-SCREEN-047 — QuantDrive version numbering must be concurrency-safe and uniquely constrained
Status: [ ] TODO
Finding: `nextVersion(prisma, fileId)` reads the latest `FileVersion.versionNumber` and returns `latest + 1`, but the resulting number is calculated outside the version-creation transaction. The Prisma `FileVersion` model also has only `@@index([fileId])` and no unique constraint on `(fileId, versionNumber)`. Two concurrent version uploads can therefore both observe the same latest number and create distinct rows with the same version number. The version-history API orders only by `versionNumber desc`, so equal-number rows have no deterministic historical ordering. This undermines the product contract of ordered file versions and can make restore/history UI ambiguous under concurrent edits.
Required: make version identity authoritative at the database/service layer. Add a unique constraint/index on `(fileId, versionNumber)` and allocate the next number inside a transaction with appropriate row/advisory locking or an atomic per-file counter. Define retry behavior for serialization/unique conflicts so clients do not receive a false success or duplicate history entry. Preserve immutable version objects and make history ordering deterministic with version number plus a stable creation sequence/timestamp. Apply the same invariant to restore-created versions if QM-SCREEN-042 adopts non-destructive restore. Add concurrent upload tests that start many writers against one file and assert a contiguous, unique version sequence, exactly one committed version per successful request, deterministic history ordering and correct cross-device refresh.
Scope: `apps/quantmail/backend/routes/drive.ts`; `packages/database/prisma/schema.prisma` and migration; Drive version service/API; Web/Flutter version-history consumers; concurrency/migration tests.
Dependencies: QM-SCREEN-042; QM-SCREEN-043; QuantDrive versioning/storage architecture.
Validation: source audit on 2026-10-08 confirmed `nextVersion()` performs a standalone latest-version read before the transaction, while `FileVersion` defines only `@@index([fileId])` with no `(fileId, versionNumber)` uniqueness constraint. No remediation implementation claim yet.


## QM-SCREEN-048 — QuantDrive purge must reconcile object storage with database state

Status: [ ] TODO
Finding: the QuantDrive purge implementation deletes ciphertext objects from external S3/R2 storage before it performs the database transaction that removes the corresponding FileIndex, FileVersion, Share, File and Folder rows. purgeRows() first collects object keys and executes deleteDriveObject(key) sequentially for every current-file/version object, then starts prisma.$transaction([...]). The object-store deletes and the database transaction therefore have no atomicity or durable compensation boundary. If an object delete succeeds and a later object delete fails, the request aborts with the database rows still present but some referenced blobs already gone. If all object deletes succeed but the subsequent DB transaction fails/rolls back, the database can still reference ciphertext that has already been permanently deleted. The retention cleanup route also uses the same purgeRows() path, so this is not limited to a user-triggered single-item purge.

Required: make Drive deletion a durable two-phase/lifecycle workflow rather than treating external object deletion as part of a DB transaction. First atomically mark the exact file/version/object records as pending purge (or otherwise establish a durable deletion operation/outbox record) in the database; only then execute idempotent object-store deletes through a retryable worker/job, and finalize DB deletion after successful object deletion, with explicit handling for already-missing objects. Persist object keys/version IDs in the deletion operation so retries do not depend on rows that may already be gone. Define failure states, retry/backoff, dead-letter/manual-repair behavior, retention cleanup idempotency and concurrent purge protection. Do not report purge success until the authoritative lifecycle reaches its documented terminal state. Add tests for failure on the first/middle/last object delete, DB transaction failure, worker retry, already-404 object, concurrent purge, process restart, and verification that no live DB row points to a deleted object.

Scope: apps/quantmail/backend/routes/drive.ts; apps/quantmail/backend/services/drive-storage.service.ts; Drive deletion/lifecycle schema and worker; File/FileVersion/FileIndex cleanup; retention cleanup; purge API/client; operational repair tooling; failure/retry/concurrency tests.
Dependencies: QM-BACK-001; QM-BACK-006; QM-SCREEN-027; QM-SCREEN-042; QuantDrive storage/lifecycle architecture.
Validation: source audit on 2026-10-08 reproduced purgeRows() deleting every collected S3/R2 object before entering prisma.$transaction([...]). deleteDriveObject() throws on non-404 storage failure, so a mid-loop failure can leave earlier objects deleted while database rows remain. No remediation implementation claim yet.

## QM-SCREEN-049 — QuantDrive public-share passwords must never be accepted through URL query strings

Status: [ ] TODO
Finding: the password-protected public-download endpoint correctly prefers the x-share-password header, but it also explicitly accepts request.query.password as a fallback. This makes a reusable share password transportable in a URL such as /drive/public/share/:token/download?password=.... URL credentials can be exposed through browser history, proxy/load-balancer/access logs, monitoring traces, copied links, screenshots and referrer propagation, even when the server itself does not intentionally log the value. The source comment acknowledges that the query form is retained for plain-navigation downloads, so this is an intentional production contract rather than dead code. Existing parity tests exercise the safer header path, but the inspected route still leaves the weaker transport enabled.

Required: remove password query parameters from the public-share contract. Require a non-URL credential channel (prefer the x-share-password header or a short-lived server-issued download authorization after password verification), and ensure clients never construct/share password-bearing URLs. Return a clear 4xx error for query-supplied passwords rather than silently accepting them. Redact share-password headers from request logging/tracing middleware and document the no-URL-secret invariant. Add regression tests for header success, missing password, wrong password, query-password rejection, access-log/trace redaction and cross-browser download flows.

Scope: apps/quantmail/backend/routes/drive.ts; public-share Web/Flutter download clients; request logging/tracing/redaction middleware; Drive public-share API docs and tests.
Dependencies: QM-SCREEN-039; QM-SCREEN-044; security/logging architecture.
Validation: source audit on 2026-10-08 reproduced the public download handler reading x-share-password first and falling back to request.query.password; existing deep parity tests use the header form. No remediation implementation claim yet.

## QM-UIUX-060 — QuantChat: migrate RealtimeProvider consumers to chat-socket singleton
Status: [ ] TODO
Finding: QM-UIUX-057 deleted 3 dead realtime paths but `providers/RealtimeProvider.tsx` could NOT be deleted — it has 6 live consumers (ConnectionStatusBanner, usePresence, NotificationBadge, useChatThemeSync, app/map/page.tsx, useRealtimeChat). The audit's "dead protocol" claim was only true for the chat-typing path. Evidence: PR #654 notes.
Required: migrate all 6 consumers to the working `chat-socket` singleton, then delete RealtimeProvider. Do not break notification/presence/banner behavior.
Scope: `apps/quantchat/src/`.
Dependencies: QM-UIUX-057 (PR #654) merged first.

## QM-UIUX-061 — Contacts: "AI Duplicate Contact Cleaner" wizard is theater
Status: [ ] TODO
Finding: `DedupWizardSubView` shows hardcoded "Detected Collision: Sundar Pichai" + fake "98% Match Confidence". Merge/Rescan buttons only flip local state — zero API calls. The real `ContactsDedupeModal` (real getContactDuplicates/merge APIs) exists but is bypassed. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/contacts-audit.md`.
Required: delete the fake wizard and route the dedup tab to the real ContactsDedupeModal, or wire the wizard to real APIs.
Scope: Contacts views.
Dependencies: none.

## QM-UIUX-062 — Contacts: "Enterprise Circles" hardcoded
Status: [ ] TODO
Finding: `CirclesSubView` renders 3 fake circles with hardcoded counts (4/8/3) and fake member names ('Core 1', 'Core 2', 'Astra AI'); broadcast falls back to fake exec_board@quantrinity.in. Shown when user has no real groups. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/contacts-audit.md`.
Required: remove fake circles; show honest empty state when user has no real groups.
Scope: Contacts views.
Dependencies: none.

## QM-UIUX-063 — QuantGit: sidebar shows fabricated stats
Status: [ ] TODO
Finding: `CodeTab.tsx:2502-2520` — `starsCount={selectedRepo.stars || 111000}` — a repo with 0 stars renders "111,000 stars". Also hardcoded releasesCount={28144}, usedByCount="110K", latestReleaseTag="v1.0.5", fake language breakdown. Always shown. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: show real counts or honest unknown states; remove fabricated fallbacks.
Scope: QuantGit CodeTab.
Dependencies: none.

## QM-UIUX-064 — QuantGit: ActionsTab fabricates CI runs
Status: [ ] TODO
Finding: `ActionsTab.tsx:51-96` — when backend returns zero runs, renders 3 fake workflow runs with fake actors, fake SHAs, fake timestamps, fabricated build logs. Header claims "Real GitHub Actions CI Pipeline". Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: show honest empty state when no runs; remove fabricated runs/logs and false header claim.
Scope: QuantGit ActionsTab.
Dependencies: none.

## QM-UIUX-065 — QuantGit: NotificationsInbox is 100% fake
Status: [ ] TODO
Finding: `NotificationsInbox.tsx` — SAMPLE_NOTIFICATIONS hardcoded as initial state, zero API calls. Fabricated notifications about merged PRs and test suites. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: wire to real notification API or remove the inbox.
Scope: QuantGit NotificationsInbox.
Dependencies: none.

## QM-UIUX-066 — QuantGit: InsightsTab hardcoded
Status: [ ] TODO
Finding: Entire 39-line file: "48 Commits", "100% CI Health", "11 GitHub Actions workflows green", fake bar chart. Takes zero props. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: compute from real data or remove the tab.
Scope: QuantGit InsightsTab.
Dependencies: none.

## QM-UIUX-067 — QuantGit: no git server (clone/push/pull theater)
Status: [ ] TODO
Finding: No git-upload-pack/git-receive-pack//info/refs handler anywhere in backend. Clone menu copies https://quantmail.in/quantgit/<repo>.git URLs that `git clone` cannot use. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: implement smart-HTTP git server OR remove/honestly label the clone menu.
Scope: QuantGit backend + UI.
Dependencies: none.

## QM-UIUX-068 — QuantGit: seed engagement + MCP fake counts
Status: [ ] TODO
Finding: Backend seeds fake engagement (starCount 342/128/95/76); MCP Registry shows fake install counts (186715 etc.) with "Install" button that only toggles local state. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/quantgit-audit.md`.
Required: seed with zero counts (real starring is Prisma-backed) or honest unknown; wire MCP install to real API or remove button.
Scope: QuantGit backend seeds + MCP Registry.
Dependencies: none.

## QM-UIUX-069 — Delete or wire fake AICodeSearch
Status: [ ] TODO
Finding: `AICodeSearch.tsx` has deliberate 600ms simulated delay, hardcoded mock results, and fake "We have SEMANTIC search" claim. Dead code — zero mounts. A real backend exists (AICodeSearchService at POST /code-search). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/search-code-audit.md`.
Required: delete the fake component or wire it to the real backend.
Scope: QuantGit/QuantMail code search.
Dependencies: none.

## QM-UIUX-070 — Remove unused /api/search/parse proxy
Status: [ ] TODO
Finding: `/api/search/parse` proxy route exists but is unused by the frontend — dead API surface. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/search-code-audit.md`.
Required: remove the dead route or wire it up.
Scope: QuantMail search API routes.
Dependencies: none.

## QM-CHAT-001 — P0: /chat/[id] crashes universally ("Cannot read properties of undefined (reading 'find')")
Status: [~] IN_PROGRESS
Owner: muse-fix-agent
Branch: fix/qm-chat-001-chat-page-crash
Finding: Opening ANY conversation on quantchat.quantrinity.in crashes the app — messaging 100% unusable. Root cause: backend `GET /conversations` (and `GET /conversations/:id`) returns raw Prisma records with NO `participants` array, but frontend `apps/quantchat/src/app/chat/[id]/page.tsx` calls `conversation.participants.find(...)` unguarded (line 84). TypeScript type declares `participants` required, runtime omits it. Evidence: customer audit 2026-10-08 (`~/workspace/goals/quantecosystem-competitors-se-behtar-ai-super-apps/hidden_files/customer-audits/2026-10-08-chat-power-user.md`).
Required: (1) fail-closed frontend guard so a missing `participants` can never crash the page; (2) backend includes active members (with user) mapped to the participant DTO shape so the chat header resolves the real contact name.
Scope: apps/quantchat frontend chat page + useConversations; apps/quantchat/backend/services/conversation.service.ts.
Dependencies: none.

## QM-M39-001 — Drive: "Shared by me" view (screen 5)
Status: [x] DONE
Owner: Muse fix agent
Branch: fix/qm-m39-001-shared-by-me
PR: #664 (open, not merged; branch fix/qm-m39-001-shared-by-me)
Evidence: backend GET /drive/shares/sent (apps/quantmail/backend/routes/drive.ts) — one record per owned file/folder shared, real recipients (name/email/permission/status), real sharedCount, real link state (role/expiry/password gate; token never exposed); revoked shares + deleted/unowned targets excluded. UI: DriveSharedByMeSubView sub-filter inside Shared tab (Shared with me | Shared by me), honest empty state "You haven't shared anything yet", expandable recipient list, link chips, View-access entry (files). Fixed latent bug: Shared tab never loaded received shares (loadShares keyed on unreachable activeFilter value). Tests: 5/5 new backend route tests green, 7/7 new component tests green (drive-subviews 35/35), drive-parity 8/8 green, eslint 0 errors.
Finding: M39 screen 5 ("Shared by me") does not exist — only "Shared with me" (DriveSharedSubView) is built. Sharing principle requires separating current access from proposed changes.
Required: backend endpoint listing files/folders the user owns and has shared (with whom, permission, link state); UI view under /drive?tab=shared sub-filter or own tab; real counts or no counts (never fake).
Scope: apps/quantmail drive API + drive page.
Dependencies: none.

## QM-M39-002 — Drive: "Recent" view (screen 6)
Status: [x] DONE — PR #665 (drive recent view, tests green, unmerged)
Finding: M39 screen 6 ("Recent") has no dedicated honest view (only a media "Feed" tab and scattered mentions). Must be a real recency-ordered view from backend data, not client-sorted theater.
Required: backend query for recently modified/opened files across the user's drive; UI view; empty state honest ("No recent files").
Scope: apps/quantmail drive API + drive page.
Dependencies: none.

## QM-M39-003 — Drive: Upload center with queue, progress, scan states (screen 15)
Status: [x] DONE — PR #668 (drive upload center, tests green, unmerged)
Finding: M39 screen 15 requires an upload center: queue → progress → scan → available. Upload route exists but there is no visible queue/progress/scan state machine; scan state is absent from drive surfaces.
Required: real upload queue UI with per-file progress; distinct states for queued/uploading/scanning/available/failed; retry on failure; no fake progress values.
Scope: apps/quantmail drive upload route + drive page.
Dependencies: QM-M39-009 (scan state backend).

## QM-M39-004 — Drive: capability-aware preview system (screens 9–14)
Status: [x] DONE — PR #667 (drive capability-aware preview, tests green, unmerged)
Finding: M39 preview principle: preview is progressive and capability-aware — a file can exist while preview, download, or scan is unavailable; never collapse into one generic loading state. DriveFilePreview exists but capability separation (image/video/PDF-audio/document/unsupported-file distinct states) is unverified.
Required: explicit per-type preview states; unsupported-file honest state (screen 14); separate indicators for preview-unavailable vs download-unavailable vs scan-pending; no fake "loading" masks.
Scope: apps/quantmail DriveFilePreview + doc editor.
Dependencies: QM-M39-009.

## QM-M39-005 — Drive: permissions/access viewer (screen 21)
Status: [x] DONE
Owner: Muse
Branch: fix/qm-m39-005-permissions-viewer
Finding: M39 screen 21 (permissions/access viewer) is missing — FileShareModal covers share changes but there is no read view of current access. Sharing principle: UI must separate CURRENT access from PROPOSED changes.
Required: read-only access viewer showing current collaborators, roles, link scope/audience/expiry; distinct from the share-change flow; real backend data only.
Scope: apps/quantmail drive shares API + FileShareModal/page.
Dependencies: QM-M39-001.
Completed: 2026-10-08 — PR #670 (fix/qm-m39-005-permissions-viewer). New owner-only GET /drive/files/:id/links backend route (link scope/audience/expiry, token+password-hash never exposed); GET proxy for /drive/files/:id/share; FilePermissionsViewer read-only modal wired to the drive feed lightbox with a 'Manage sharing' handoff to FileShareModal. Note: QM-M39-001/PR #664 not merged on main, so no GET /drive/shares/sent exists; viewer uses GET /drive/files/:id/share instead. Validation: 11 new frontend tests + 4 new backend route tests + 2 fail-closed reachability entries, all green; existing suites green (186 drive frontend, 12 parity, 24 reachability); eslint clean; frontend tsc clean.

## QM-M39-006 — Drive: link sharing with scope/audience/expiry + authoritative confirmation (screen 22)
Status: [x] DONE — PR #671 open (drive link sharing: scope anyone/org/specific, audience, expiry enforced server-side, authoritative confirmation dialog); backend 45/45 + frontend 14/14 tests green, tsc/eslint/build clean
Finding: M39 screen 22 requires link sharing that exposes scope, audience, expiry, permission — and saving a share change requires authoritative confirmation. shares/link route exists; full scope/audience/expiry UI + confirmation is unverified.
Required: link dialog with scope (anyone/org/specific), audience, expiry picker, permission; confirmation step before save; backend enforces expiry; honest states (never claim a link exists when it doesn't).
Scope: apps/quantmail drive shares/link + UI.
Dependencies: QM-M39-005.

## QM-M39-007 — Drive: file details panel (screen 24)
Status: [x] DONE — PR #672 open (drive file details panel: GET /drive/files/:id/details + FileDetailsPanel slide-over, real DB data, scan state wired); backend 6/6 + frontend 11/11 new tests green, existing suites green, frontend tsc clean, build green (backend tsc: 70 pre-existing errors in packages/auth+database, none in touched files)
Finding: M39 screen 24 (file details) missing. File identity rule: every file surface must make name, type, owner, modified time, location, sharing state, scan/availability state, and version context understandable when relevant.
Required: details panel (side or modal) with all identity fields from real backend data; location breadcrumb; sharing summary; version count; scan state; no fabricated metadata.
Scope: apps/quantmail drive page + files API.
Dependencies: QM-M39-009.

## QM-M39-008 — Drive: activity/history view (screen 25)
Status: [x] DONE
Owner: Muse
Branch: fix/qm-m39-008-activity-view
PR: #669 (open, unmerged; commit a30b016e — backend event log + FileActivityModal + honest empty state + 31 tests)
Finding: M39 screen 25 (activity/history) missing — no per-file event log surface exists.
Required: backend event log for file actions (upload, rename, move, share change, version restore); UI timeline per file; honest empty state; no fake activity entries.
Scope: apps/quantmail drive backend + drive page.
Dependencies: none.
Validation: 18/18 backend route tests pass (upload/rename/move/share add-update-revoke/version-restore events recorded with real payloads; no event for unchanged rename or no-op move; unowned files not logged; event-write failure never breaks the action; GET newest-first, honest empty list, 401/404/403, missing-migration degradation, limit cap 200); 13/13 frontend tests pass (truthful descriptions, honest empty state, timeline render); existing drive backend (61) + frontend (61) suites pass; ESLint 0 errors; tsc clean on changed files. Migration 0087_drive_file_activity_events ships in the PR — run at deploy time (code degrades gracefully without it).

## QM-M39-009 — Drive: security/scanning state surface (screen 29)
Status: [~] IN_PROGRESS
Owner: Muse
Branch: fix/qm-m39-009-drive-scan-state
PR: #663 (open, unmerged — backend scan states + UI badges + quarantine gates)
Finding: M39 screen 29 (security/scanning state) missing. Files have no visible scan/availability state; preview principle depends on it.
Required: backend scan-job states (pending/scanning/clean/quarantined/unknown); UI state indicators on files and in details; "unknown" must render as unknown, never as safe.
Scope: apps/quantmail drive backend + UI.
Dependencies: none.

## QM-M39-010 — Drive: mail attachment handoff (screen 30)
Status: [~] IN_PROGRESS (Owner: muse-m39-wave5, Branch: fix/qm-m39-010-mail-handoff)
Finding: M39 screen 30: Mail attachment → Drive preview/save → canonical Drive file. Drive owns file objects; mail attachment references must not be duplicate Drive objects. No such handoff exists.
Required: "Save to Drive" on mail attachments creating a canonical Drive object with dedupe (content-hash based, not duplicate rows); preview via Drive preview; return-to-Mail context.
Scope: apps/quantmail mail attachment UI + drive backend.
Dependencies: QM-M39-004.

## QM-M39-011 — Drive: Quanty file workspace (screen 31)
Status: [~] IN_PROGRESS (Owner: muse-m39-wave5, Branch: fix/qm-m39-011-quanty-workspace)
Finding: M39 screen 31 (Quanty file workspace) missing — FileAISummaryDrawer gives one-shot summaries, not a workspace where Quanty helps organize (move/copy suggestions, dedupe, find files).
Required: Quanty-assisted file operations surface wired to real Quanty tools (search files, suggest destination, summarize); every action must execute real backend ops and report real results; no simulated Quanty streaming (already banned pattern).
Scope: apps/quantmail drive + Quanty integration.
Dependencies: QM-M39-004, QM-M39-008.

## QM-M39-012 — Drive: settings handoff (screen 32)
Status: [~] IN_PROGRESS (Owner: muse-m39-wave5, Branch: fix/qm-m39-012-drive-settings)
Finding: M39 screen 32 (Drive settings handoff) missing — no Drive settings surface (storage management, offline, sync preferences, default sharing).
Required: Drive settings surface with real, working controls only; every toggle must persist via backend; remove or never-add decorative controls.
Scope: apps/quantmail drive page + backend.
Dependencies: none.

## QM-M39-013 — Drive: fake-data purge across all drive surfaces
Status: [x] DONE
Owner: Muse
Branch: fix/qm-m39-013-drive-fake-purge
PR: #662 (open, not merged; commit d94db9923)
Finding: Standing user rule — no fake stats/counts/collaborators/activity. Drive surfaces (StorageQuotaBar, shared counts, starred counts, AI memory vault, cleaner) must be audited: every number/person/activity must be backend-provable or removed.
Required: audit + remove all fabricated drive data; quota from real usage; counts real or absent; zero fake collaborators/activity; evidence per surface.
Scope: all apps/quantmail drive components and API routes.
Dependencies: none.
Validation: 2 fakes removed — (1) hardcoded '4.8 GB duplicate storage reclaimed via FastCDC 64KB CAS' toast in drive/page.tsx cleaner tab (dead onReclaimComplete; prop also removed from DriveCleanerSubView interface); (2) invented 0.95 AI-search score default in DriveAISearchBar (score now number|null; '% Match' badge hidden when backend reports none). Verified real: StorageQuotaBar (DB-aggregated quota, 'Calculating…' until loaded), shared/starred counts (real receivedShares/starred items), FileShareModal (no fake collaborators), AI memory vault (no demo records, real /api/drive/memory), feed (real media or empty), upload toasts (real counts), search (real APIs), doc collab (real socket, empty default), version history + AI summary (real APIs). All 9 drive vitest suites pass: 152/152 incl. new null-score test. tsc unavailable in this env (repo typechecks via CI); edited files transform cleanly under vitest.

## QM-M39-014 — Drive: large-collection performance (virtualization + pagination)
Status: [x] DONE — PR #666 (virtualization + cursor pagination, tests green, unmerged)
Finding: M39 requires desktop virtualized list/grid + cursor pagination, mobile progressive loading with compact metadata; sorting/filtering server-compatible and restorable. DriveFilesSubView (545 lines) implementation of this is unverified.
Required: verify or implement virtualization for large folders; cursor pagination on files API; mobile progressive loading; restore sort/filter state; no client-only fake pagination.
Scope: apps/quantmail drive files API + DriveFilesSubView.
Dependencies: none.


## QM-SCREEN-050 — QuantDrive chunked-upload completion must atomically reconcile blob, metadata and quota

Status: [ ] TODO
Finding: the production ChunkedUploadService.complete() has a failure window across object storage, database state and quota state. It first creates a File row, then uploads the encrypted object with putDriveObject(), then attempts the File update + FileVersion transaction. If the object upload succeeds but the transaction fails, the catch deletes the File row but does not delete the newly uploaded object. The object therefore becomes an orphaned ciphertext blob. The same failure path does not call releaseReservation(uploadId), so the reserved quota can remain held until its in-memory reservation expires. Conversely, quota is committed only after the DB transaction, so the operation has no durable single lifecycle connecting the reservation to the final file/version records.

Required: define a durable upload state machine spanning quota reservation, object creation, File/FileVersion creation and final commit. Persist the upload operation/object key before or together with the authoritative DB state so recovery can identify every temporary blob and reservation. On any post-upload DB failure, delete the object idempotently and release the reservation, with retryable cleanup if either external action fails. On successful commit, atomically transition the reservation to committed usage and mark the upload terminal. Make retries/idempotency keyed by uploadId so a client retry cannot create duplicate File/FileVersion rows or double-charge quota. Return the authoritative persisted file/version after commit. Add failure-injection tests for object PUT failure, File create failure, transaction failure after object PUT, quota commit failure, process restart, retry-after-timeout, duplicate completion and orphan-object reconciliation.

Scope: apps/quantmail/backend/services/chunked-upload.service.ts; apps/quantmail/backend/services/storage-quota.service.ts; Drive upload schema/operations; File/FileVersion persistence; object-storage cleanup worker; quota lifecycle; chunked-upload API/client; failure/retry/concurrency tests.
Dependencies: QM-SCREEN-043; QM-SCREEN-048; QM-BACK-001; durable upload/job infrastructure.
Validation: source audit on 2026-10-08 reproduced complete() creating a File row, calling putDriveObject(key, ...), then wrapping File update + FileVersion creation in a DB transaction; the catch deletes only the File row and does not call deleteDriveObject(key) or releaseReservation(uploadId). No remediation implementation claim yet.

## QM-SCREEN-051 — QuantDrive resumable upload sessions must be durable across workers and restarts

Status: [ ] TODO
Finding: the primary production ChunkedUploadService stores resumable sessions in a process-local static Map (ChunkedUploadService.sessions) and stores every uploaded chunk as a Buffer inside that same process memory. The service documentation describes resumable uploads and the route exposes initiate/upload/status/complete/abort operations, but a session disappears when the backend process restarts and is not shared across multiple backend workers/instances. A request routed to another worker can therefore receive SESSION_NOT_FOUND even though the client has a valid uploadId. Large chunk data also consumes application heap instead of durable object storage, making memory pressure and worker restarts part of the data-integrity path. The separate legacy bedriveSessions/bedriveChunks implementation in the same production service is also process-local, creating a second non-authoritative upload-session model.

Required: move the authoritative resumable-upload session metadata to durable shared persistence with ownership/tenant binding, expiry, state, expected size/chunk count and idempotency. Store chunks in durable object storage or a managed multipart-upload primitive rather than process memory; persist per-chunk checksums/ETags and completion state so uploads survive worker restarts and load balancing. Enforce authorization on every session operation, reject cross-user uploadId access, make duplicate chunk submission idempotent only when the bytes/checksum match, and make completion/abort/expiry transitions concurrency-safe. Remove or isolate the duplicate legacy in-memory upload engine from production paths so there is one canonical upload protocol. Add multi-worker/restart tests, out-of-order chunks, duplicate/mismatched chunks, expired sessions, concurrent completion/abort, partial-object cleanup and cross-device resume tests.

Scope: apps/quantmail/backend/services/chunked-upload.service.ts; Drive upload routes; upload-session schema/migrations; S3/R2 multipart or chunk-object lifecycle; quota reservation state; worker/runtime deployment; Web/Flutter upload clients; upload protocol tests.
Dependencies: QM-SCREEN-043; QM-SCREEN-050; QM-SCREEN-048; QuantDrive upload/storage architecture.
Validation: source audit on 2026-10-08 reproduced private static sessions = new Map<string, ChunkedSession>() with each session containing chunks: Map<number, Buffer>, plus a separate bedriveSessions/bedriveChunks in-memory implementation in the same production service. No remediation implementation claim yet.


## QM-SCREEN-052 — QuantDrive direct S3 multipart uploads must be authorized, encrypted and transactionally reconciled

Status: [ ] TODO
Finding: the separate direct multipart upload protocol in production Drive routes is not bound to an authoritative upload-session record. POST /drive/upload/multipart/initiate creates an object-store multipart upload and then reserves quota using the returned uploadId, but the uploadId/key/name/size/folder/owner relationship is not persisted as a durable Drive upload operation. The follow-up POST /drive/upload/multipart/:uploadId/part-url only authenticates the caller and accepts an arbitrary key and partNumber; it does not verify that the uploadId and key were issued to that user or that the multipart session is active. Complete and abort likewise accept a client-supplied key without an ownership/session lookup. This makes the object-store multipart identifier/key a bearer capability without an application authorization binding and leaves lifecycle state outside the database.

The completion path also bypasses the Drive encryption contract: it calls storage.completeMultipartUpload() directly on the uploaded object and creates File/FileVersion rows with encryptionIV='', encryptionAuthTag='', encryptionKey='', while normal Drive storage uses AES-256-GCM envelope encryption and checkedPlaintext() requires a valid IV/auth-tag/wrapped-key envelope. The resulting multipart-created file therefore cannot satisfy the same decrypt-and-integrity-read contract as ordinary Drive files. The route also trusts the client-provided totalSize and metadata at completion instead of deriving/validating the completed object size against the initiated session and completed parts.

There are additional failure windows: initiate creates the remote multipart upload before quota reservation, so a reservation failure can orphan a remote multipart upload; complete finalizes the remote object before File/FileVersion persistence and quota commit, but has no compensating abort/delete/reconciliation path if DB creation, version creation or quota commit fails; quota commit is not part of a durable transaction; abort releases the reservation only after the storage abort call and has no durable operation state for retry/reconciliation. These are separate from QM-SCREEN-050/051 because this protocol uses the direct S3/R2 multipart API rather than the process-memory ChunkedUploadService.

Required: introduce one durable multipart-upload operation/session record bound to user/tenant, uploadId, exact object key, filename, MIME type, destination folder, expected total size, part size/count, state, expiry and quota reservation. Never accept client-supplied key as authorization: every part-url/complete/abort operation must load the server-issued session, verify ownership, state and expiry, and use the stored key/uploadId. Enforce idempotent part-url issuance and completion/abort with concurrency-safe state transitions. Define an explicit encryption architecture for multipart uploads: either encrypt parts/client-side before storage with a verifiable envelope compatible with Drive's checkedPlaintext contract, or use a server-side streaming/encryption assembly step before publishing the canonical encrypted Drive object; never create ordinary Drive File rows whose encryption fields are empty. Derive/verify final byte size and part manifest from authoritative multipart state rather than trusting completion metadata. Make initiate/complete/abort compensatable and retryable: persist state before external calls where needed, abort/delete remote multipart state or completed objects on downstream failure, release/commit quota exactly once, and run a durable expiry/reconciliation worker for abandoned multipart uploads. Add tests for cross-user uploadId/key substitution, arbitrary-key presign attempts, expired/replayed sessions, mismatched size/parts/ETags, concurrent complete/abort, DB failure after remote completion, quota failure, restart/retry, and successful decrypt + SHA-256 integrity verification of a multipart-created Drive file.

Scope: apps/quantmail/backend/routes/drive.ts multipart initiate/part-url/complete/abort routes; @quant/storage multipart primitives; storage-quota.service.ts; Drive upload-session schema/migration; Drive encryption/storage contract; cleanup/reconciliation worker; Web/Flutter multipart clients; authorization, lifecycle and failure-injection tests.
Dependencies: QM-SCREEN-043; QM-SCREEN-048; QM-SCREEN-050; durable upload/job infrastructure.
Validation: source audit on 2026-10-08 verified the four direct multipart routes. Initiate creates the remote multipart upload then calls reserveQuota without a durable session record; part-url/complete/abort authenticate only the current user and accept client-supplied key; complete creates File/FileVersion with empty encryptionIV/encryptionAuthTag/encryptionKey after completing the remote upload; complete has no compensating cleanup around File/FileVersion/quota failure. No remediation implementation claim yet.


## QM-SCREEN-053 — QuantDrive direct uploads must reserve quota before accepting bytes

Status: [ ] TODO
Finding: the normal production POST /drive/upload path performs only a non-transactional quota check before creating the File row and storing the object. It calls StorageQuotaService.checkQuota(userId, bytes.length), then encrypts the payload, creates the File row, uploads the object and creates FileVersion metadata. checkQuota reads current non-deleted File usage plus process-local reservations, but this direct upload path creates no reservation before the check. Two or more concurrent direct uploads can therefore observe the same remaining capacity, all pass checkQuota, and all persist successfully, allowing committed File.size usage to exceed the user's configured quota. This is distinct from QM-SCREEN-043 because that task covers the reservation mechanism itself; this finding is the uncovered production caller that still bypasses reservation and is reachable through the standard upload endpoint.

The same race applies to other Drive operations that use checkQuota directly for new stored bytes, including the copy path where applicable. A quota check is a read/validation, not an admission lock. Once multiple requests pass it, there is no authoritative capacity hold tying the requested bytes to the eventual File/FileVersion commit. The current getQuota percentage can consequently report usage above 100% after concurrent admission.

Required: route every quota-consuming upload/copy operation through the durable quota reservation protocol from QM-SCREEN-043 (or an equivalent DB-atomic admission primitive), reserving the exact byte amount before external object creation. Bind the reservation to an operation ID and owner, expire/reconcile it durably, commit it exactly once only after the canonical File/FileVersion state is persisted, and release it on every failure path. Preserve the existing object-storage cleanup guarantees and make reservation/object/metadata transitions retryable and idempotent. For copy, reserve before creating the new File and release/commit through the same lifecycle. Add concurrency tests that start enough simultaneous uploads/copies to cross the remaining quota boundary and assert that the committed non-deleted File.size plus active durable reservations never exceeds the limit; include process-restart/multi-worker coverage and failure injection between reservation, object PUT, File creation, FileVersion creation and commit.

Scope: apps/quantmail/backend/routes/drive.ts POST /drive/upload and Drive copy path; apps/quantmail/backend/services/storage-quota.service.ts; durable quota reservation schema/worker; File/FileVersion persistence; object-storage cleanup; upload/copy tests.
Dependencies: QM-SCREEN-043; QM-SCREEN-050; durable quota/upload operation infrastructure.
Validation: source audit on 2026-10-08 verified POST /drive/upload calls checkQuota() directly and never reserveQuota(), while checkQuota only reads aggregate File usage plus process-local reservations. The same audit verified the copy route calls checkQuota() before File.create(). No remediation implementation claim yet.


## QM-SCREEN-054 — QuantMail archived shelf must show a compact live message badge, not a conversation-count sentence

Status: [ ] TODO

Finding: the live Inbox implementation already has the agreed top-of-list Archived shelf (ArchivedFolderRow), but its current contract is still conversation-count based. ArchivedFolderRow receives count from currentArchivedThreads.length, renders the secondary sentence "{count} archived conversation(s)", and renders the same raw count as the orange badge. This is the wrong product metric for the agreed design: the shelf should remain a compact shortcut inside the Inbox, with the primary numeric affordance representing the number of archived messages, capped visually at 99+. The current value is also derived from the client-side archived rows rather than an authoritative mailbox aggregate, so it can describe only the loaded page/window rather than the complete archive.

The shelf must not become a second Archive page. Keep the top Archived shelf as the quick-access affordance already present in the Inbox, but make it visually compact: Archive icon/label + one numeric badge, with no "3 archived conversations" prose. The badge presentation must be deterministic: 0/unknown -> no numeric badge; 1..99 -> exact count; >=100 -> 99+. The underlying authoritative count must never be truncated. Accessibility text must expose the real full count while the visual badge uses the capped representation.

Required: replace the current conversation-count presentation with a canonical archived-message-count field supplied by the mailbox-count contract from QM-SCREEN-055; render the visual badge with the 99+ cap; remove the redundant count sentence from the shelf; preserve the tap behavior that opens/toggles the Archive workspace; keep loading/unknown/error states distinct from a genuine zero; make the badge update after archive/unarchive, send/receive, delete/restore, mark-read changes where the chosen metric is affected; add responsive visual tests for 0, 1, 99, 100, 1000+ and accessibility assertions for the uncapped accessible name/description.

Scope: apps/quantmail/src/app/page.tsx (ArchivedFolderRow, archive query/count derivation and render); shared mailbox-count DTO/query contract; QuantMail Inbox visual tests; accessibility tests.

Dependencies: QM-SCREEN-055; QM-SCREEN-056.

Validation: source audit on 2026-10-08 verified the current shelf renders count twice (the secondary "{count} archived conversation(s)" sentence and the orange badge), with count={currentArchivedThreads.length}. No 99+ message-count contract exists in the inspected live code.

## QM-SCREEN-055 — QuantMail needs an authoritative mailbox message-count model split by MAIL and CHAT

Status: [ ] TODO

Finding: QuantMail now deliberately stores two message kinds in the same Email model: Prisma Email.messageKind is MAIL | CHAT, the client exposes MessageKind = 'mail' | 'chat', and thread grouping exposes kindMix = 'mail' | 'chat' | 'mixed'. However, the persistent EmailThread.messageCount is only one undifferentiated integer, while EmailFolder has emailCount/unreadCount without a MAIL-vs-CHAT breakdown. The client ConversationThread.count is likewise just messages.length, and kindMix is derived from the loaded messages rather than accompanied by authoritative per-kind counts. The result cannot support the agreed product requirement that QuantMail distinguish message counts across email and chat wherever counts are surfaced.

The current Inbox/Archive list is also paginated: GET /emails calculates total and unreadCount for the selected mailbox predicate, but the Inbox page's Archived shelf does not consume those aggregates. Instead it fetches folderType=ARCHIVE, groups the returned page into client-side threads, and uses currentArchivedThreads.length. Therefore a mailbox with more rows than the loaded page can display an incorrect archive count. The backend also has no inspected authoritative archive-count response containing total messages, unread messages, MAIL messages and CHAT messages together.

Required: define one canonical mailbox-count contract scoped by authenticated user/mailbox/folder/filter semantics. At minimum expose total message count, unread message count, MAIL count, CHAT count, unread MAIL count and unread CHAT count for Inbox/Archive/Spam/Sent/Drafts and any other surfaces that need the metric. Define explicitly whether a "message" means a stored mailbox row, a logical send after duplicate-delivery collapse, or another canonical unit; apply the same rule to counts and list/thread grouping. Do not use paginated list length as a global count. Do not infer MAIL/CHAT from body shape, subject, HTML presence or UI labels; use persisted messageKind. If conversation counts are also required, expose them as a separate metric (conversationCount) rather than overloading messageCount.

Make the count source authoritative and concurrency-safe. A durable aggregate table/counter is acceptable only if every mail/chat mutation updates it transactionally; otherwise compute from indexed canonical rows through a dedicated aggregate query/service with bounded performance and consistent predicates. Archive/unarchive, inbound delivery, outbound send/internal delivery, chat send, trash/restore, spam rescue, folder moves, deduplicated delivery copies and hard deletion must update/recompute the correct counters exactly once. Add migration/backfill/reconciliation tooling for existing Email, EmailThread and EmailFolder data, including rows with the default MAIL kind. Add invariant tests proving: total = MAIL + CHAT; unread = unread MAIL + unread CHAT; archive counts exclude Trash; moving a message between Inbox and Archive changes both mailbox totals without changing its kind; duplicate delivery copies do not double-count a logical send when the product's canonical counting rule says they are one; and concurrent mutations cannot drift counters.

Scope: packages/database/prisma/schema.prisma (Email.messageKind, EmailThread.messageCount, EmailFolder.emailCount/unreadCount); apps/quantmail/backend/routes/emails.ts GET /emails and mailbox mutations; apps/quantmail/backend/services/email.service.ts; thread/realtime services; count/aggregate service and migration/reconciliation; apps/quantmail/src/types/index.ts; apps/quantmail/src/lib/threading.ts; apps/quantmail/src/services/api-client.ts.

Dependencies: QM-BACK-001/002/003; QM-SCREEN-054; existing mail/chat delivery and threading contracts.

Validation: source audit on 2026-10-08 verified persisted Email.messageKind and client ThreadKindMix, but only one EmailThread.messageCount, folder-level emailCount/unreadCount, and client ConversationThread.count. GET /emails returns page-local total/unreadCount; the archived shelf ignores those aggregates and derives its count from grouped client rows. No authoritative MAIL-vs-CHAT mailbox counter DTO was found.

## QM-SCREEN-056 — QuantMail mailbox counts must update in real time, not only through 30-second polling

Status: [ ] TODO

Finding: the current Inbox uses useInbox({ folderType: 'INBOX' }) and useInbox({ folderType: 'ARCHIVE' }). The canonical useInbox query is configured with refetchInterval: 30_000, refetchOnWindowFocus: true, and refetchIntervalInBackground: false. The inspected Inbox page has no mailbox realtime subscription of its own, even though the backend mail routes already publish thread realtime events for new messages. Consequently an archive badge/count can remain stale for up to the polling interval when another device, another tab, an inbound message, or another client archives/unarchives a message. Backgrounded tabs intentionally stop polling, making "real-time" even less true.

Required: connect authoritative mailbox-count changes to the existing event/outbox/realtime architecture. Define versioned events for mailbox membership/count-affecting mutations (inbound message, chat message, send/delivery copy, archive/unarchive, folder move, spam/trash/restore, read/unread and deletion as applicable). The event must be scoped to the affected user/mailbox and carry enough information for the client to update or invalidate the canonical count query without guessing. The client must subscribe through the authenticated realtime transport, update/invalidate the mailbox-count query immediately, and fall back to cursor/poll reconciliation after reconnect or an event gap. Do not make the visual badge optimistic without authoritative confirmation for cross-device changes. Preserve offline behavior: cached counts may be shown as stale/unknown, but must not be presented as freshly authoritative after reconnect until reconciliation completes.

Add tests for same-device mutation, second-tab mutation, second-device mutation, inbound mail, chat send, archive/unarchive, mark read/unread, reconnect after missed events, duplicate event delivery, out-of-order events and background/foreground transitions. Measure that the count changes after the authoritative event rather than waiting for the 30-second poll.

Scope: apps/quantmail/src/hooks/useMail.ts; apps/quantmail/src/app/page.tsx; mailbox-count query/cache; thread-realtime/mail event publisher and outbox consumers; WebSocket/SSE client transport; offline mailbox snapshot/reconciliation; realtime and cross-device tests.

Dependencies: QM-BACK-001; QM-BACK-007; QM-SCREEN-055; existing thread realtime architecture.

Validation: source audit on 2026-10-08 verified the Inbox mailbox hooks use a 30-second polling interval and no direct realtime subscription in page.tsx/useMail.ts. Backend emails.ts does broadcast thread-level realtime events for sent/replied messages, but the inspected Inbox count path does not consume those events to update the mailbox count.

## QM-SCREEN-057 — QuantMail bottom navigation and all count surfaces must consume the same canonical counters

Status: [ ] TODO

Finding: the current live ContextBottomNavBar correctly defines the agreed Mail tabs as Inbox, Teams, Agents, Archive, but its badge wiring is incomplete for the agreed count architecture. AppShell passes only inbox: unreadCount and teams: mailLensCounts.teams; there is no Archive numeric override, and the Agents tab uses a static badgeText: 'AI' rather than a live workload count. The Inbox page itself independently derives lensCounts, turnCounts, filterCounts, thread count, thread unreadCount, and the Archived shelf count from different client-side populations. This creates multiple competing definitions of "count" and makes it possible for bottom-nav, chip, shelf and thread counts to disagree.

Required: define a single count vocabulary and projection contract for every QuantMail count surface. At minimum distinguish conversationCount, messageCount, unreadMessageCount, mailMessageCount, chatMessageCount, unreadMailMessageCount, and unreadChatMessageCount; define which one each surface displays. The bottom nav should use the product-defined metric for each tab and apply the same visual cap (99+) where a numeric badge is used. The Inbox tab should not silently mix unread messages with conversation totals; Archive should use the canonical archive metric from QM-SCREEN-055; Teams should use an authoritative team/unread metric rather than an inbox lens-derived approximation; Agents should show a numeric badge only when there is a real pending agent workload, otherwise no fabricated number/badge. Top Inbox lenses, Archive shelf, folder pages, thread rows, notifications and app-shell badges must all resolve from the same canonical count service/query family.

Define update semantics for every count-affecting mutation and make cross-surface invalidation atomic from the user's perspective. Ensure the 99+ visual cap is presentation-only and accessibility exposes the full count. Add a count-matrix test suite that compares the same mailbox state across desktop/mobile shell, top lenses, Archive shelf, bottom nav, folder pages and thread rows, including mixed MAIL+CHAT conversations. Empty state must be zero/hidden rather than a stale previous badge.

Scope: apps/quantmail/src/components/ContextBottomNavBar.tsx; apps/quantmail/src/components/AppShell.tsx; apps/quantmail/src/app/page.tsx; QuantPillarTopBar; mailbox count/query service; notifications; Web/Flutter/other QuantMail clients that surface mailbox counts.

Dependencies: QM-SCREEN-054; QM-SCREEN-055; QM-SCREEN-056; QM-PLAT-002/003.

Validation: source audit on 2026-10-08 verified the Mail bottom-nav tab set is Inbox/Teams/Agents/Archive, but AppShell supplies only Inbox and Teams numeric overrides; Archive has no numeric badge and Agents has a static AI badge. The Inbox page independently derives archive, lens, thread and unread counts from client-side collections. No unified count projection contract was found.

## QM-SCREEN-058 — QuantDrive folder rename must update the full descendant path atomically

Status: [ ] TODO

Finding: the live QuantDrive folder rename path updates the root folder and every descendant folder as separate database writes. In `apps/quantmail/backend/routes/drive.ts`, `PUT /drive/files/:id` first calls `prisma.folder.update()` for the renamed root, then queries descendants with `path.startsWith(`${oldPath}/`)`, and loops over them calling `prisma.folder.update()` one at a time. There is no surrounding database transaction covering the root update plus descendant path rewrite. A mid-loop database error, worker failure, timeout, or concurrent folder mutation can therefore leave a partially rewritten hierarchy: the root can have the new name/path while some descendants still carry the old path, or different descendants can reflect different generations of the path.

This is not the same failure mode as QM-SCREEN-046. QM-SCREEN-046 covers folder MOVE hierarchy validation and atomicity; this task covers the separate RENAME/path-cascade contract. Path is persisted denormalized hierarchy state and is consumed by other Drive operations, so a partial rename is an integrity defect even when parentId relationships remain correct.

Required: treat a folder rename as one authoritative hierarchy mutation. Validate the requested name, parent state, ownership, collision policy and resulting path before changing anything. Snapshot the complete descendant set from the parentId hierarchy rather than relying only on the current path prefix; this lets the operation detect and repair an already inconsistent path tree instead of silently propagating corruption. Compute every resulting descendant path from the new root path and immutable relative suffixes. Apply the root and all descendant path changes in one database transaction with deterministic ordering/locking appropriate for concurrent folder operations. If the hierarchy is too large for one transaction, implement a durable path-rewrite operation/state machine with a visible pending state and reconciliation, but never expose a half-renamed hierarchy as a completed mutation. Do not use a best-effort loop followed by `{ ok: true }`.

The rename contract must define how files are affected: file.folderId remains authoritative for membership, while any file path/index/search projection that derives from folder paths must be updated or invalidated consistently. Define behavior for renamed folders containing deleted/trash descendants and for concurrent rename/move/restore operations. Preserve idempotency so a retried rename cannot apply a second path transformation. Add audit/event emission only after the transactionally authoritative state exists.

Tests: rename a root with 0, 1, 100+, and deeply nested descendants; inject failure at every descendant update boundary and assert no partial committed hierarchy; concurrent rename-vs-move and double-submit retries; pre-existing path inconsistency; deleted/trash descendants; same-name sibling collision; authorization/ownership; path prefix collision such as `/foo` versus `/foobar`; and post-rename search/list/breadcrumb consistency.

Scope: `apps/quantmail/backend/routes/drive.ts` folder rename handler; Drive folder/path domain service; Prisma folder transaction/indexes; file/search/index projections if path-derived; realtime/audit events; Web and Flutter Drive clients; backend and integration tests.

Dependencies: QM-SCREEN-046; QM-SCREEN-050; QM-SCREEN-051; existing Drive folder/path contract.

Validation: source audit on 2026-10-08 against `main` verified the rename handler updates the root folder first, then finds descendants by `path.startsWith(`${oldPath}/`)`, then performs one `folder.update()` per descendant outside a transaction, and finally returns `{ ok: true }`. No transaction or durable rewrite state surrounds the full root+descendant path mutation.


## QM-SCREEN-059 — QuantDrive trash subtree expansion must not silently truncate at 30 levels

Status: [ ] TODO

Finding: the live Drive trash endpoint uses the shared `folderTree()` helper to expand a folder before soft-deleting its descendants. That helper hard-caps traversal at `MAX_DEPTH = 30` and then returns the visited IDs without signalling that the frontier was truncated. `POST /drive/files/trash` therefore treats a folder with descendants deeper than 30 levels as fully trashed even though the traversal can stop before reaching the deepest folders. The transaction then marks only the returned folder IDs and their files as deleted, while deeper descendants can remain active. The API still returns `{ ok: true }`, so the client has no indication that the requested subtree was only partially moved to Trash.

## QM-SCREEN-061 — QuantMail Flutter composer attachment picker must use real files, not invented attachment metadata

Status: [ ] TODO

Finding: the live Flutter QuantMail composer exposes an "Attach File" action, but `_showAttachmentPicker()` in `flutter_apps/apps/quant_mail/lib/screens/composer/email_composer_modal.dart` does not open a device/file picker or a Drive attachment contract. It renders four hardcoded choices such as `Architecture Specification (PDF)`, `Impeller Benchmark Traces (ZIP)`, `System Topology Schema (PNG)` and `Raw Sensor Recording (MP4)`. Selecting one immediately constructs an `EmailAttachment` containing an invented ID, filename, byte size and MIME type and adds it to the draft; no file bytes, URI, Drive file ID, upload operation or backend attachment reference is established.

This makes the attachment UI look functional while the draft only contains metadata. The 25 MB guard is therefore guarding declared sizes rather than actual attachment bytes, and a downstream send path cannot safely assume these attachment records identify deliverable content. The hardcoded titles/sizes are not a test-only fixture: the picker is reachable from the production composer toolbar.

Required: replace the hardcoded attachment menu with a real attachment source contract. Device files must come through the platform file/document picker with authoritative URI/name/size/MIME metadata and a secure upload/read path; Drive files must resolve to canonical Drive IDs with authorization and version/snapshot semantics. The draft must persist a stable attachment reference/state (queued/uploading/ready/failed) rather than pretending metadata is an attached file. Enforce the size limit against authoritative byte size and revalidate before send. The send operation must include only attachments that are durably uploaded/resolvable and must fail clearly if an attachment becomes unavailable; no invented attachment IDs or sizes.

Define cancellation, duplicate selection, offline/retry, large-file streaming, permission loss, upload failure, draft restore and cross-device resume semantics. Ensure local draft persistence does not store inaccessible raw file paths without a secure revalidation mechanism. Add tests for real picker selection, wrong/missing file, size mismatch, >25 MB rejection, upload interruption/retry, stale Drive reference, unauthorized Drive attachment, duplicate attachment, send-time revalidation and empty/no-attachment state. If the current hardcoded picker is retained for UI previews, move it to isolated test/demo fixtures that cannot be reachable from production builds.

Scope: flutter_apps/apps/quant_mail/lib/screens/composer/email_composer_modal.dart; flutter_apps/apps/quant_mail/lib/models/composer_models.dart; attachment picker/upload service; QuantMail send API/attachment DTO; QuantDrive handoff if supported; draft persistence; Web/Flutter parity and attachment tests.

Dependencies: QM-WORK-005; QuantDrive canonical file contract; mail attachment/send contract.

Validation: source audit on 2026-10-08 against main verified `_showAttachmentPicker()` renders four fixed file entries and `_attachmentOption.onTap` directly appends an `EmailAttachment` with generated `att-<timestamp>` ID, hardcoded `sizeBytes`, generated filename and MIME type. No device file picker, Drive file reference, file upload or attachment-byte source is used by this production picker. No remediation implementation claim yet.

## QM-SCREEN-062 — QuantMail Flutter failed sends must not erase the recoverable autosaved draft

Status: [ ] TODO

Finding: the production Flutter Undo Send state machine clears the local autosaved draft in a `finally` block, even when the final send callback throws. In `flutter_apps/apps/quant_mail/lib/screens/composer/undo_send_manager.dart`, `_flushSend()` awaits `_onFinalSend!(draft)`; the `catch` reports `Delivery error: Failed to reach sovereign mail gateway.`, but the following `finally` always executes `DraftLocalStorage.instance.clearDraft()`. The inline comment says the draft should be cleared "after successful transmission", but the control flow also clears it after a failed transmission. This is production-reachable: `superapp_home_screen.dart` wires the composer `onSendQueued` callback into `_undoSendManager.enqueueDraft(... onFinalSend: ...)`.

Required: make draft deletion conditional on authoritative successful send completion, never merely on leaving the send attempt. Preserve the exact draft until the mail gateway/API returns an accepted authoritative send result and the local state has been reconciled; on network failure, timeout, 4xx/5xx rejection, serialization/upload failure or ambiguous result, keep the recoverable draft and surface a retry/recovery state. If the server may have accepted an ambiguous request, use an idempotent client operation/send key and reconciliation before deciding whether the draft can be cleared, so retry cannot duplicate delivery. Define the state machine separately for recalled, queued, sending, accepted, failed-retryable, failed-terminal and ambiguous outcomes. A successful send should clear only the matching draft ID/version, not an unrelated newer autosave created while the request was in flight.

Tests: final-send callback succeeds -> draft clears; callback throws -> draft remains; timeout/ambiguous response -> draft remains until reconciliation; 4xx terminal rejection -> draft remains for correction/retry; user edits/re-autosaves while send is in flight -> newer draft is preserved; double send/retry is idempotent; undo during countdown restores the same draft; app navigation/backgrounding does not accidentally clear it. Add regression coverage around the exact `try/catch/finally` path.

Scope: `flutter_apps/apps/quant_mail/lib/screens/composer/undo_send_manager.dart`; `flutter_apps/apps/quant_mail/lib/screens/superapp/superapp_home_screen.dart`; draft persistence/recovery; mail send API operation/idempotency contract; Flutter tests.

Dependencies: QM-SCREEN-061; mail send/delivery contract; durable draft contract.

Validation: source audit on 2026-10-08 verified the live `_flushSend()` catches send failures but unconditionally executes `DraftLocalStorage.instance.clearDraft()` in `finally`. The same audit verified the production SuperApp composer enqueues the draft into this manager and supplies an `onFinalSend` callback.

## QM-SCREEN-063 — QuantMail Flutter autosaved drafts must survive app restart and use durable account-scoped persistence

Status: [ ] TODO

Finding: the Flutter composer labels its local draft mechanism as autosave, but `DraftLocalStorage` in `flutter_apps/apps/quant_mail/lib/models/composer_models.dart` is only an in-memory singleton: it stores one `EmailDraft?` in the process field `_savedDraft`. `loadDraft()` returns that field and `saveDraft()` replaces it; there is no file/database/secure-storage persistence, account namespace, draft ID index, encryption-at-rest policy, or recovery after process termination. The composer calls `DraftLocalStorage.instance.loadDraft()` on initialization and periodically saves through this singleton, so a force-stop, OS process eviction, crash or app restart can silently lose what the UI describes as an autosaved draft.

Required: define the authoritative Flutter draft persistence contract. Persist drafts durably per authenticated account/device, with stable draft IDs and revision/version metadata, timestamps, recipient/subject/body/attachment references and explicit dirty/saved/sync states. Do not persist raw attachment paths as if they were durable attachment ownership; use the attachment contract from QM-SCREEN-061. Protect sensitive draft contents with the platform-appropriate encrypted storage/database boundary and never log body/recipient data. Support multiple drafts rather than a single global singleton if the product contract exposes multiple compose windows/drafts. On account switch/logout, isolate or clear access to the previous account's drafts according to the server/device policy; never hydrate another account's draft. Define server synchronization if drafts are intended to appear cross-device, including conflict resolution, revision tokens and offline queueing. If the product intentionally promises device-local-only recovery, make that explicit in UX and still guarantee restart/crash durability on that device.

Tests: save -> force process termination -> restart -> recover; crash during write; concurrent autosave revisions; account A logout/account B login isolation; multiple drafts; stale revision conflict; attachment reference becomes unavailable; storage full/corrupt database recovery; encryption-at-rest and no-sensitive-logging checks; draft clear after successful send only for the matching draft revision. Add migration coverage from the current in-memory representation without treating process memory as persisted truth.

Scope: `flutter_apps/apps/quant_mail/lib/models/composer_models.dart`; `flutter_apps/apps/quant_mail/lib/screens/composer/email_composer_modal.dart`; draft repository/storage layer; authentication/account switching; mail draft API if cross-device sync is required; attachment persistence; Flutter integration tests.

Dependencies: QM-SCREEN-061; QM-SCREEN-062; canonical QuantMail draft/mail contract.

Validation: source audit on 2026-10-08 verified `DraftLocalStorage` contains only the private in-memory field `EmailDraft? _savedDraft` and no durable storage dependency. The composer reads/writes this singleton as its autosave path, while the repository test explicitly describes it as an "In-Memory singleton".

## QM-SCREEN-064 — QuantMail Flutter SuperApp composer must call the real send contract instead of reporting success from a local toast

Status: [ ] TODO

Finding: the production Flutter SuperApp compose path wires `EmailComposerModal.show(... onSendQueued: ...)` into `UndoSendManager.enqueueDraft`, but its `onFinalSend` callback does not call a mail API, repository, transport or outbox. In `flutter_apps/apps/quant_mail/lib/screens/superapp/superapp_home_screen.dart`, `onFinalSend: (d) async { ... }` only invokes `ScaffoldMessenger.of(context).showSnackBar(...)` with `Email sent to ...`. It completes normally, so `UndoSendManager._flushSend()` transitions the message to `sent` and displays its own successful-delivery toast even though no send operation is performed by this path. This is a direct production-flow gap, not a test fixture.

Required: connect the Flutter composer to the canonical QuantMail send command/API/outbox contract. The send command must submit the complete authoritative draft (recipients, subject/body, attachments from QM-SCREEN-061, draft ID/revision and an idempotency/send operation key), authenticate and authorize the mailbox, validate recipients/content/attachment state server-side, persist the outbound message transactionally, enqueue delivery work, and return an authoritative accepted/queued result. The Flutter manager must map that result to explicit states such as queued/accepted/delivered/failed/ambiguous rather than equating a locally completed callback with network delivery. The UI copy must say "queued/scheduled" when only accepted by the outbox and must reserve "sent/delivered" for the corresponding authoritative status.

Do not duplicate sends on retry or app restart: the server operation must be idempotent and the client must retain the operation ID until reconciliation. Handle offline, timeout, authentication expiry, rate limits, invalid recipients, attachment upload failure, server rejection and ambiguous network responses without falsely marking the message sent. Persist/reconcile the draft and send operation according to QM-SCREEN-062/063. Ensure Web and Flutter use the same canonical send DTO and delivery-state vocabulary.

Tests: inspect the final-send callback and assert a real transport/repository invocation; mock successful API acceptance and verify one outbound message/outbox operation; mock rejection/timeout and verify no success state; retry the same operation ID and verify exactly one message; verify attachments are referenced by durable IDs; offline send queues or fails explicitly according to policy; app restart reconciles pending send; delivery-state UI never claims delivery from a local snackbar alone; cross-device mailbox state reflects the authoritative outbound row.

Scope: `flutter_apps/apps/quant_mail/lib/screens/superapp/superapp_home_screen.dart`; `flutter_apps/apps/quant_mail/lib/screens/composer/undo_send_manager.dart`; Flutter QuantMail API/repository/client; backend email send route/service/outbox; attachment contract; draft/send operation persistence; Web/Flutter parity tests.

Dependencies: QM-SCREEN-061; QM-SCREEN-062; QM-SCREEN-063; canonical QuantMail send/delivery contract.

Validation: source audit on 2026-10-08 fetched the live `_openEmailComposer()` implementation and verified its `onFinalSend` body contains only `ScaffoldMessenger.of(context).showSnackBar(... 'Email sent to ...')`; no network/API/send-service invocation occurs in that callback. Because the callback completes normally, the existing UndoSendManager then marks the draft `sent`.

## QM-QUANTY-006 — Quanty browser-agent must execute real browser actions, not only model action types and in-memory session records
Status: [ ] TODO
Finding: @quant/browser-agent defines click/type/scroll/navigate/extract/screenshot/wait/select actions, a planner, trust framework and SessionManager, but the live QuantAI browser route only exposes session create/list/get/end. SessionManager stores sessions in an in-memory Map and only records actions; it does not own or invoke a browser process/page. No verified production path was found that executes a BrowserAction against Chromium/Edge/Firefox, returns authoritative PageState, captures a real screenshot, or verifies the resulting UI state. Playwright usage elsewhere is primarily E2E testing, not agent browser execution.
Required: implement a production Browser/Computer Runtime with a real browser driver behind a strict adapter. Provision an isolated browser context per task/session; bind it to user, task and policy; enforce navigation/network policy; expose observe/read/screenshot plus semantic DOM/accessibility interaction; execute click/type/select/scroll/navigate/upload/download/wait; and return an action receipt containing action ID, precondition evidence, execution result and postcondition evidence. Never report success merely because an action was appended to an in-memory log.
Define provision -> ready -> observe -> act -> verify -> idle -> expired/cancelled -> destroyed lifecycle. Handle browser crash, worker restart, stale page, navigation races, popups, tabs, downloads/uploads, cookies/storage state, network timeout, captcha/2FA handoff and cancellation. Keep secrets outside model-visible args/logs. Add domain allowlists, quotas and hard cleanup.
Validation: source audit on 2026-10-08 verified browser-agent routes only manage sessions; SessionManager only creates/records/ends in memory; BrowserAction is data only; no production browser driver invocation was found.
Scope: packages/browser-agent/*; apps/quantai/backend/routes/browser-agent.ts; browser runtime adapter; session store; worker pool; observation/screenshot/accessibility; upload/download; policy/audit; integration tests.
Dependencies: QM-QUANTY-001; QM-QUANTY-004; browser security architecture.

## QM-QUANTY-007 — Quanty device Computer Use ActionExecutor must perform real platform actions and verify them
Status: [ ] TODO
Finding: packages/agent-runtime/src/device/action-executor.ts exposes tap, swipe, type, scroll and longPress, but each method only constructs ActionResult with success:true, appends an in-memory log and returns. There is no platform bridge, accessibility API, input injection, screenshot/observation, target validation or post-action verification. AppLauncher similarly reports success by updating an in-memory runningApps Set rather than proving an OS app actually launched.
Required: replace placeholders with Android/iOS/Web/desktop adapters. Implement observe -> target resolution -> action -> observe/verify. Results must distinguish requested, dispatched, observed-success, failed and unknown. App launch must use real OS/deep-link APIs and verify foreground/package state. Sensitive actions require policy/step-up and user permissions; no privilege escalation.
Define platform-specific capabilities and failure states for permissions, missing apps, stale targets, display/orientation changes, interrupted gestures, process death and ambiguous results. Add emulator/real-device acceptance tests and fail closed when an adapter is unavailable.
Validation: source audit on 2026-10-08 verified all current ActionExecutor methods return success without invoking a platform API and AppLauncher only updates an in-memory Set.
Scope: packages/agent-runtime/src/device/action-executor.ts; packages/agent-runtime/src/device/app-launcher.ts; platform bridges; observation layer; permissions; device tests.
Dependencies: QM-QUANTY-006; platform adapter architecture; identity/permission contract.

## QM-QUANTY-008 — Quanty agent-runtime tasks must be tenant/user scoped and durable
Status: [ ] TODO
Finding: apps/quantai/backend/routes/agent-runtime.ts authenticates POST task creation but does not pass request.auth.userId into Orchestrator.executeTask. GET task status calls getTaskStatus(id) without ownership checking, and the agents list returns the process-wide worker set. packages/agent-runtime/src/orchestrator.ts stores tasks/workers in process-local Maps and OrchestratorTask has no owner/tenant/session identifier. A caller with another task ID can therefore reach global task state through the route, and all task state disappears on process restart.
Required: bind every task to tenantId/userId/sessionId and persist task state/checkpoints in a shared store. Enforce ownership at every read/mutation boundary; never treat a task ID as authorization. Workers receive immutable principal/task/capability/resource scope. Support leases, heartbeat, cancellation, retry, checkpoint/resume and idempotent completion.
Tests: cross-user read/cancel denial; cross-tenant worker isolation; restart recovery; worker crash/lease recovery; duplicate delivery; cancellation races; monotonic status; enumeration resistance; sensitive-data log checks.
Validation: source audit on 2026-10-08 verified executeTask has no user/tenant parameter, task records have no owner field, status lookup is global and getRunningAgents exposes process-wide workers.
Scope: apps/quantai/backend/routes/agent-runtime.ts; packages/agent-runtime/src/orchestrator.ts; task persistence/queue; worker leases; auth context; API tests.
Dependencies: QM-AUTH-008; QM-QUANTY-004; durable jobs architecture.

## QM-QUANTY-009 — Quanty high-risk approval must be a blocking, durable gate before execution
Status: [ ] TODO
Finding: packages/agent-runtime/src/orchestrator.ts detects ACT_HIGH/FULL_AUTO and calls approvalQueue.submit, but then immediately proceeds to worker.start and worker.run without awaiting or checking an approval decision. Recording an approval request is not the same as blocking execution, creating a fail-open path for high-risk actions.
Required: make approval a mandatory WAITING_APPROVAL state. Persist exact action/resource/risk/policy version/expiry/requester and an action hash. Resume only after authenticated approval matches that exact node and has not expired. Rejection, expiry and cancellation must stop the action and retries must not bypass approval. Prefer the canonical Quanty approval engine over parallel in-memory approval implementations.
Tests: prove external tool is never invoked before approval; approval/expiry/rejection/duplicate decision; action changes after approval; restart while waiting; concurrent cancel/approve; malicious client cannot mark approval locally. Audit every decision.
Validation: source audit on 2026-10-08 verified approvalQueue.submit is followed by worker.run with no approval wait/check in this Orchestrator path.
Scope: packages/agent-runtime/src/orchestrator.ts; approval queue/engine; task state machine; Quanty gateway; audit/event spine; tests.
Dependencies: QM-BACK-005; QM-QUANTY-001; canonical approval/step-up contract.

## QM-QUANTY-010 — Quanty external MCP must have a real transport plus server/tool policy enforcement
Status: [ ] TODO
Finding: apps/quantai/backend/services/mcp-bridge.service.ts defines external MCP registration/discovery/invocation but its default transport is NullMcpTransport, and repository search found no concrete implementation of this bridge McpTransport interface. The service comment says real adapters are wired in staging, but the checked code does not provide them. invokeTool also forwards the requested tool and args without bridge-level schema/risk/policy validation.
Required: ship audited HTTP and stdio MCP transports with handshake, timeout, cancellation, TLS/endpoint validation, connection limits, subprocess sandboxing and secret isolation. After tools/list, validate/normalize schemas, assign stable capability IDs and risk tiers, and require policy before tools/call. Validate args against schema, bound payload/output size, redact sensitive output and emit audit/correlation data. Refresh cached capabilities on list changes.
For stdio, prevent arbitrary executable/arg/env injection; use allowlisted runtime images/commands or a sandbox with CPU/memory/network/filesystem limits. For HTTP, prevent SSRF to internal/private networks. Add MCP conformance tests for initialize/list/call, malformed responses, poisoning, schema mismatch, oversized output, timeout, disconnect and reconnect.
Validation: source audit on 2026-10-08 verified the bridge default is NullMcpTransport and search for implements McpTransport found no concrete bridge transport. invokeTool forwards tool/args to the configured transport without schema/risk enforcement.
Scope: apps/quantai/backend/services/mcp-bridge.service.ts; MCP HTTP/stdio transports; connector registration; schema/policy registry; SSRF/sandbox; audit/telemetry; tests.
Dependencies: QM-QUANTY-001; QM-BACK-005; connector/credential security architecture.

## QM-QUANTY-011 — Quanty MCP tool discovery must be live, schema-validated and policy-filtered
Status: [ ] TODO
Finding: the QuantMail Quanty planner contains a TODO stating the LLM planner should call the model with listTools() as function schemas and currently falls back to a local planner. The Gmail MCP client caches tools/list permanently after the first call and its server notification handling does not process tool-list changes. The QuantAI connector catalog advertises browser tools such as browser.navigate/read/search while QM-QUANTY-006 shows the current browser runtime does not execute them.
Required: establish one canonical live capability projection. Discover tools from authoritative registries/MCP servers, validate input/output schemas, filter by authenticated grants, resource scope, risk, plan/credits and runtime availability, and expose only executable tools to the model. Separate advertised, enabled and executable capability states. Support bounded refresh/change notifications, schema versions and capability fingerprints. A static UI catalog must never by itself make a capability model-callable.
Tests: every advertised tool has an executable handler and valid schema; destructive tools have policy/approval; revoked connectors disappear from model projection; disabled runtime cannot be called; stale schemas are rejected; MCP list changes propagate; args/results conform; selection/execution/verification are observable.
Validation: source audit on 2026-10-08 verified the planner TODO/fallback path, one-time Gmail tools/list cache, and browser connector declarations; browser execution gap is independently established by QM-QUANTY-006.
Scope: apps/quantmail/backend/services/quanty-agent/planner.ts; apps/quantmail/backend/services/quanty-agent/mcp/*; apps/quantai/backend/services/mcp-bridge.service.ts; connector catalog; canonical capability registry; model tool projection; schema/policy/availability tests.
Dependencies: QM-QUANTY-001; QM-QUANTY-006; QM-QUANTY-010; connector permission model.
