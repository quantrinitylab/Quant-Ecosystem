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
Status: [ ] TODO
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
Status: [ ] TODO
Finding: 10 competing dark background hexes in active use across QuantMail: `#090A0C`, `#090A0E`, `#0D1117`, `#0D0F12`, `#111318`, `#12151E`, `#16181D`, `#161B22`, `#21262D`, `#282C35`, `#30363D`. A `--quant-*` token system exists in `globals.css` but only 44 of 391 components use it; 212 hardcode hex. Adjacent panels render visibly different blacks, breaking the user's "deep black" direction. Full evidence: `~/workspace/audits/2026-10-08-uiux-deep/design-system-audit.md`.
Required: codemod dark-surface hexes to the canonical `--quant-*` tokens; define the missing tokens if the scale is incomplete; add a lint rule banning raw hex for surface backgrounds. Visual diff review of adjacent panels (inbox rows vs sidebar vs header) before DONE.
Scope: `apps/quantmail/src/**`; `globals.css` tokens; eslint config.
Dependencies: none.

## QM-UIUX-005 — Remove sub-minimum typography (<10px text)
Status: [ ] TODO
Finding: 45 instances of 6-9px text across QuantMail (`text-[6px]` through `text-[9px]`), below WCAG readability minimums. The working scale is `text-[10px]` (459x) and `text-[11px]` (481x) but there is no defined type scale. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/design-system-audit.md`.
Required: define a 5-step type scale (minimum 10px for UI text); replace or remove all <10px instances; add a lint rule banning arbitrary sub-10px sizes.
Scope: `apps/quantmail/src/**`; Tailwind/eslint config.
Dependencies: QM-UIUX-004 (token/lint infrastructure can be shared).

## QM-UIUX-006 — Old amber mascot still on QuantMail sign-in header
Status: [~] IN_PROGRESS (Owner: Muse fix agent)
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
Status: [ ] TODO
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
Status: [ ] TODO
Finding: `EmailComposer.tsx:653-668` vs `:2047` — validation toasts errors for empty subject/body, but the button is only disabled when To is empty. Users tap a fully-actionable-looking Send and get an error toast. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/compose-audit.md`.
Required: mirror validation in the disabled state, or make subject a confirm-dialog instead of a hard block.
Scope: `apps/quantmail/src/components/EmailComposer.tsx`.
Dependencies: none.

## QM-UIUX-025 — Compose P1s: wrong mascot reaction, lying toast, latent overflow
Status: [ ] TODO
Finding: (a) `quantyReact('mail:noRecipients')` fires for missing subject/body too — copy-paste bug, makes the AI feel fake; (b) "Message sent" toast claims sent while the 10s recall countdown runs — should say "Sending… (10s to undo)"; (c) modal compose branch `:984` is `fixed bottom-0 right-4 w-full` — latent 1rem horizontal overflow on mobile (no caller passes `modal={true}` today). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/compose-audit.md`.
Required: distinct `mail:noSubject`/`mail:noBody` reactions; honest toast copy; `inset-x-4 w-auto` on mobile for the modal branch.
Scope: `apps/quantmail/src/components/EmailComposer.tsx`.
Dependencies: QM-UIUX-024 (same file; fix together).

## QM-UIUX-026 — Delete fake contacts with real public figures' names
Status: [ ] TODO
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
Status: [ ] TODO
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
Finding: (a) Contacts "+ New" add button ~24px tall (below 44px minimum) and the ONLY add path on mobile — add a proper FAB or enlarge; (b) "Sovereign" marketing fluff across Contacts/QuantGit/Settings copy ("instant sovereign dial", "verified sovereign tenants", "Quant Sovereign privacy guarantees"); (c) QuantGit meaningless "Cloud OS" pill; (d) Settings inconsistent crypto claims ("TLS 1.3" on account page vs "TLS 1.2+" on Security tab); (e) Search input 12px on mobile (iOS auto-zoom) — use `text-base`; (f) Voice search silent failure when `SpeechRecognition` unavailable — honest disabled state. Evidence: contacts/quantgit/settings/search audit reports.
Required: fix each per the finding; no invented copy.
Scope: Contacts, QuantGit, Settings, Search components.
Dependencies: QM-UIUX-005 (type scale covers e).

## QM-UIUX-032 — QuantChat /call page simulates a call connection
Status: [ ] TODO
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
Finding: (a) 127 animations ignore `prefers-reduced-motion` (WCAG 2.3.3) — add a global CSS kill-switch for `animate-*`; (b) 56 icon-only buttons without accessible names (WCAG 4.1.2) — add `aria-label`; (c) `#6B6E76` text fails WCAG AA at 76 usages (3.64-4.12:1, needs 4.5:1) — replace with `#8D96A0`. Evidence: `~/workspace/audits/2026-10-08-uiux-deep/accessibility-audit.md`.
Required: fix each per the finding.
Scope: `apps/quantmail/src/**`; global CSS.
Dependencies: QM-UIUX-013 (gray consolidation covers c); QM-UIUX-034 (same area).

## QM-UIUX-036 — AI error honesty + global fetch timeout
Status: [ ] TODO
Finding: (a) `AIAssistant.tsx:171` catches errors and shows generic "Something went wrong" — the real exception is discarded; (b) no global fetch timeout — if the backend hangs forever, the spinner never resolves (PR #621 added 10s AbortController for auth; the same pattern is needed at the API layer). Evidence: `~/workspace/audits/2026-10-08-uiux-deep/empty-error-states-audit.md`.
Required: surface sanitized `err.message` in AI errors; add a global fetch timeout so hung requests land on the honest ErrorState + retry.
Scope: `AIAssistant.tsx`; API fetch layer.
Dependencies: none.

## QM-UIUX-037 — App switcher: single accent-color source of truth
Status: [~] IN_PROGRESS — Owner: a5aee1ae-9aa5-4a6c-9d4f-3ae1e1e5a2b1; Branch: fix/qm-uiux-037-accents
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
Status: [~] IN_PROGRESS — Owner: 1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e; Branch: fix/qm-uiux-042-img-consent
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
Status: [~] IN_PROGRESS — Owner: 2c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f; Branch: fix/qm-uiux-044-blur
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
Status: [ ] TODO
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
Status: [ ] TODO
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

