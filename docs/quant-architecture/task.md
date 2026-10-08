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
Status: [~] IN_PROGRESS
Required: expectedVersion on thread/mail mutations, VERSION_CONFLICT errors, requestId/correlation propagation.
Dependencies: QM-BACK-001.

Owner: Muse
Branch: TBD (agent worktree, PR-only to main)
Notes: claimed 2026-10-08; Optimistic concurrency + request IDs; dep QM-BACK-001 met via #597
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
Status: [~] IN_PROGRESS
Required: export/deletion/retention/legal-hold events; derived-index invalidation; verified completion.
Dependencies: QM-BACK-001; universal search.

Owner: Muse
Branch: feat/qm-back-006-data-lifecycle-events
Notes: claimed 2026-10-08; PR #611 OPEN (agent complete 2026-10-08): 10 versioned lifecycle events via K1 outbox spine, lifecycle_operations + projector_checkpoints verified completion, hold-guard 423, search-indexer invalidation (Meili+Qdrant), migration 0083; tests 12/12 + 7/7 green locally, CI typecheck green; main merged in (review_by fix); awaiting gate → merge
Notes: claimed 2026-10-08; Data lifecycle events; dep QM-BACK-001 met via #597
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
Status: [~] IN_PROGRESS
Required: evidence links, context boundary, preview before mutation, cost/reversibility, provenance.
Dependencies: QM-QUANTY-001.

Owner: Muse
Branch: TBD (agent worktree, PR-only to main)
Notes: claimed 2026-10-08; Quanty inline context surfaces; dep QM-QUANTY-001 met via #593
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
Status: [ ] TODO
Required: cold start, warm start, expired session, refresh, offline, degraded backend, account switch, deep-link return, Quanty bootstrap, loading ownership, secure token handling, platform-specific startup behavior.
Acceptance: no flash of authenticated content; no fabricated workspace state; bootstrap is authoritative.

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
