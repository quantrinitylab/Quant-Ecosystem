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
Status: [ ] TODO
Scope: MailTeamsCollaborationPanel.tsx; MailSwarmAgentAccessPanel.tsx; teams/agents tabs.
Finding: audit identifies fabricated teammates/PRs/deploys and fabricated agent fleet/heartbeats/kubectl output.
Required: wire to real backend contracts with honest loading/empty/error states, or remove; no theatrical operational data.

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
Status: [ ] TODO
Finding: mail backend currently writes zero outbox rows although outbox infrastructure exists.
Required: domain mutation + outbox in one transaction; versioned mail events; idempotent consumers; replay/DLQ observability.
Dependencies: ecosystem event-spine contract.

## QM-BACK-002 — Optimistic concurrency + request IDs
Status: [ ] TODO
Required: expectedVersion on thread/mail mutations, VERSION_CONFLICT errors, requestId/correlation propagation.
Dependencies: QM-BACK-001.

## QM-BACK-003 — Global idempotency middleware
Status: [ ] TODO
Required: Idempotency-Key for mutation routes, durable result replay, bounded retention, scope by actor/tenant/route.
Dependencies: server-core.

## QM-BACK-004 — Server-side audit integrity
Status: [ ] TODO
Required: authoritative audit writes from sensitive mutations; remove/close client-writable audit-log paths; redact secrets and private content.
Dependencies: QM-BACK-001/002.

## QM-BACK-005 — Step-up authentication
Status: [ ] TODO
Required: recent-auth/step-up challenge for security, destructive, financial and admin actions; explicit expiry and audit.
Dependencies: QM-AUTH-007.

## QM-BACK-006 — Data lifecycle events
Status: [ ] TODO
Required: export/deletion/retention/legal-hold events; derived-index invalidation; verified completion.
Dependencies: QM-BACK-001; universal search.

## QM-BACK-007 — Dependency health / degraded modes
Status: [ ] TODO
Required: dependency-level latency/error/timeout/circuit state; declared degraded behavior; mutations fail closed when authoritative state is unavailable.
Dependencies: reliability architecture.

## QM-BACK-008 — Delivery worker deployment contract
Status: [ ] TODO
Finding: outbound delivery worker exists but inspected deployment manifests do not reference it.
Required: deployment/queue worker config, health, drain/retry/DKIM/MX failure behavior and operational evidence.
Dependencies: infra owner.

---
# P1 — Quanty Integration into QuantMail

## QM-QUANTY-001 — Quanty Mail capability registry
Status: [ ] TODO
Required tools: summarizeThread, draftReply, rewriteDraft, translateMail, createCalendarEvent, saveToDrive, searchMail, searchPeople, createFollowUp.
Each tool needs version, owner, input/output schema, capability, resource scope, risk tier, approval, timeout, retry, idempotency, verification, undo/compensation, audit and credit policy.
Dependencies: capability registry/resource contracts.

## QM-QUANTY-002 — Quanty inline context surfaces
Status: [ ] TODO
Required: evidence links, context boundary, preview before mutation, cost/reversibility, provenance.
Dependencies: QM-QUANTY-001.

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