# Quant Ecosystem — TASK.md

> Living execution contract. No task is complete until implementation, UX, security, tests, observability, cross-device behaviour, and rollback gates pass.

## Global Definition of Done
- [ ] Current implementation inspected; no capability assumed from folder names/docs alone.
- [ ] Keep / Extend / Borrow / Replace / Reject decision recorded with evidence.
- [ ] No mandatory paid SDK/API/license dependency introduced; infrastructure cost tracked separately.
- [ ] Product source-of-truth remains product-owned; Quanty gets scoped capabilities, never direct DB access.
- [ ] AuthN/AuthZ, tenant/user isolation, rate limits, abuse cases, secrets and privacy reviewed.
- [ ] Idempotency, retries, timeout, failure mode and rollback designed for every mutation/remote call.
- [ ] Unit + integration + contract + E2E + negative/security + accessibility tests pass.
- [ ] Web + Android + iOS + Windows + macOS + Linux behaviour verified where supported.
- [ ] Offline/reconnect/multi-device conflict behaviour tested where state is synchronized.
- [ ] OpenTelemetry traces/metrics/logs and actionable alerts exist for critical paths.
- [ ] UI passes keyboard, screen-reader, focus, responsive, loading/empty/error/offline and reduced-motion checks.
- [ ] UX is calm, consistent and original: premium system-level polish without copying Google/Apple trade dress.
- [ ] No TODO/mock/fake success path remains in a production-critical flow.
- [ ] Documentation and runbook updated; evidence linked before checkbox closes.

## Phase 0 — Truth Baseline & Test Harness
- [ ] P0.01 Freeze architecture inventory: apps, packages, engines, workers, DBs, queues, caches, object storage, K8s services.
- [ ] P0.02 Build capability matrix: implemented / partial / missing / duplicate / dead.
- [ ] P0.03 Reconcile STUB-INVENTORY against current code; delete stale claims only after tests prove replacement.
- [ ] P0.04 Map every external dependency and license; flag AGPL/GPL/source-available/paid-service coupling.
- [ ] P0.05 Establish golden user journeys and Playwright/mobile/desktop E2E harness.
- [ ] P0.06 Establish performance budgets: startup, interaction latency, API p95/p99, sync latency, memory, battery, bundle size.
- [ ] P0.07 Establish visual regression baseline for every flagship screen and shared component.
- [ ] P0.08 Establish accessibility CI: WCAG AA target, keyboard-only, screen-reader semantics, contrast, zoom/text scaling.
- [ ] P0.09 Establish security regression suite: auth bypass, IDOR, CSRF, XSS, SSRF, replay, token leakage, rate-limit/abuse.
- [ ] P0.10 Establish chaos/failure tests for DB, Redis, queue, object storage, network partitions and dependency timeout.

## Phase 1 — Quant Identity / SSO Foundation
### Current evidence
- QuantMail backend currently acts as ecosystem identity root in several flows.
- UniversalSSOTokenBridge re-verifies handoff server-side and fails closed.
- Dedicated id.quantrinity.in identity surface is designed but not the final independent plane.
- Residual query-token realtime carve-outs must be removed.

### Tasks
- [ ] P1.01 Extract logical Quant Identity Plane from QuantMail product domain without breaking current sessions.
- [ ] P1.02 Define OIDC/OAuth2-style authorization, token, userinfo, revoke/logout, discovery and key-rotation contracts.
- [ ] P1.03 Preserve opaque one-time SSO handoff tickets; enforce expiry, audience, nonce, replay prevention and server verification.
- [ ] P1.04 Build device registry: device ID, public-key binding where appropriate, platform, trust, last-seen, revoke.
- [ ] P1.05 Build session registry and “sign out this device / all devices”.
- [ ] P1.06 Implement step-up auth policy for dangerous capabilities.
- [ ] P1.07 Replace all realtime query-string bearer tokens with short-lived scoped realtime tickets/cookie-safe flows.
- [ ] P1.08 Add silent SSO with strict origin validation and no token leakage to URL/history/referrer/logs.
- [ ] P1.09 Add account chooser, session-expired, device-approval and recovery UX.
- [ ] P1.10 Test SSO across every Quant app and every supported shell/browser, including expiry/revocation/offline/replay.
- [ ] P1.11 Migration/rollback: dual-read/compat window, session migration metrics, instant rollback path.

## Phase 2 — QuantMail Domain Core
- [ ] P2.01 Audit mailbox/thread/message/draft/attachment schema and transactional invariants.
- [ ] P2.02 Fix unread/read persistence regression and add multi-device regression test.
- [ ] P2.03 Make mail mutations idempotent by contract, not optional convention.
- [ ] P2.04 Verify compose, autosave, reply, reply-all, forward, labels, star, archive, trash, spam and restore end-to-end.
- [ ] P2.05 Harden threading via Message-ID/References/In-Reply-To plus deterministic fallback.
- [ ] P2.06 Build attachment lifecycle: upload, validation, malware scan, metadata/text extraction, preview, signed access, retention.
- [ ] P2.07 Add quota/storage accounting and graceful full-mailbox behaviour.
- [ ] P2.08 Add import/export/migration paths with integrity verification.
- [ ] P2.09 Test concurrent edits, duplicate requests, retries, DB rollback and partial attachment failure.

## Phase 3 — Internet Mail Edge & Deliverability
- [ ] P3.01 Keep fast internal Quant→Quant delivery path; prove transaction/event consistency.
- [ ] P3.02 Deploy and wire existing external DeliveryWorker; queue must drain in staging before release.
- [ ] P3.03 Harden inbound SMTP/MTA boundary; evaluate Stalwart vs existing implementation by missing capability, not hype.
- [ ] P3.04 Implement/verify SPF, DKIM, DMARC and ARC processing and DNS lifecycle.
- [ ] P3.05 Evaluate Rspamd for spam/reputation/phishing; integrate only if it materially beats current stack.
- [ ] P3.06 Implement durable outbound retry/backoff, MX fallback, TLS policy, bounce/DSN and complaint processing.
- [ ] P3.07 Add IP/domain reputation telemetry, suppression and abuse controls.
- [ ] P3.08 Test malformed MIME, mail bombs, spoofing, unicode/domain tricks, malicious attachments and backscatter.
- [ ] P3.09 Load/soak test SMTP edge and queues; prove recovery after worker outage.

## Phase 4 — Search & Intelligence
- [ ] P4.01 Benchmark current search for mailbox size, latency, operators and ACL correctness.
- [ ] P4.02 Build authorization-aware indexing for headers/body/attachment text.
- [ ] P4.03 Evaluate Meilisearch/OpenSearch only against measured gaps; select minimum operationally sufficient engine.
- [ ] P4.04 Add deterministic search operators and typo/fuzzy behaviour with privacy-safe ranking.
- [ ] P4.05 Add semantic retrieval as a separate evidence layer; never weaken authorization.
- [ ] P4.06 Quanty summaries/retrieval must cite resource references and respect user scopes.
- [ ] P4.07 Test deletion/index invalidation, stale indexes, permission changes and search leakage.

## Phase 5 — Event Spine, Realtime & Notifications
- [ ] P5.01 Complete transactional outbox adoption for critical domain events.
- [ ] P5.02 Define versioned event envelopes, dedupe IDs, ordering semantics and replay policy.
- [ ] P5.03 Build realtime gateway auth with scoped short-lived tickets.
- [ ] P5.04 Presence uses leases/TTL; never treat ephemeral presence as durable source-of-truth.
- [ ] P5.05 Notification intents → policy → routing → device delivery → read/dismiss sync.
- [ ] P5.06 Test reconnect storms, duplicate/out-of-order events, slow consumers and gateway failover.

## Phase 6 — Omnipresence / Cross-Device Fabric
- [ ] P6.01 Define DeviceIdentity + Session + PresenceLease + SyncCursor + CapabilityContext.
- [ ] P6.02 Build per-product delta-sync contract with monotonic cursors/versioning.
- [ ] P6.03 Build encrypted local cache and mutation journal for offline-capable clients.
- [ ] P6.04 Sync read/unread, labels, stars, drafts, notification state and task state across devices.
- [ ] P6.05 Use CRDT (Yjs/Automerge evaluation) only for genuinely concurrent collaborative objects such as shared drafts.
- [ ] P6.06 Build secure device handoff using references/context—not raw bearer forwarding.
- [ ] P6.07 Resume the same Quanty task ID across devices; never duplicate execution on handoff.
- [ ] P6.08 Test phone→web→desktop handoff, offline edits, clock skew, conflicts, revoked device and network partition.
- [ ] P6.09 Battery/network budgets for background sync and realtime clients.

## Phase 7 — Quanty Capability Plane
- [ ] P7.01 Audit app-registry capabilities against real routes; active means verified implementation only.
- [ ] P7.02 Expand QuantMail capabilities: read/search/prepare draft/update/send/reply/label/archive/attachment actions.
- [ ] P7.03 Separate read tools from side-effect commands and assign risk tiers/scopes.
- [ ] P7.04 High-risk actions require preview/approval/step-up according to policy.
- [ ] P7.05 Task graph must compile fail-closed for missing/preview capabilities.
- [ ] P7.06 Persist task execution/checkpoints so tasks survive process/device failure.
- [ ] P7.07 Add retry/compensation semantics and human-readable action audit trail.
- [ ] P7.08 Cross-app flow test: mail → attachment/file → calendar/chat action → notification, with permission boundaries.
- [ ] P7.09 Prompt-injection/data-exfiltration tests for malicious email and attachments.

## Phase 8 — Shared Media & Document Engines
- [ ] P8.01 KEEP and harden existing FFmpeg media implementation; do not duplicate transcoder stacks.
- [ ] P8.02 Turn media package into shared service/SDK for QuanTube, QuantGram, QuantCooks, QuantAds and mail previews.
- [ ] P8.03 Benchmark Sharp/native image pipeline for thumbnails/resizes/format conversion.
- [ ] P8.04 Evaluate Apache Tika/other extractors for document text/metadata only where current extraction is weaker.
- [ ] P8.05 Sandbox untrusted parsers/codecs; enforce resource/time limits.
- [ ] P8.06 Test corrupt/hostile media, decompression bombs, huge dimensions, codec failures and cancellation.

## Phase 9 — QuantMail UX/UI Screen-by-Screen
### Design system
- [ ] P9.01 Define typography, spacing, radius, elevation, iconography, motion and density tokens.
- [ ] P9.02 Build consistent light/dark/high-contrast themes and platform-aware system chrome.
- [ ] P9.03 Shared primitives: buttons, menus, dialogs, sheets, command palette, tooltips, toasts, skeletons, empty/error/offline states.
- [ ] P9.04 Every interaction has hover/focus/pressed/disabled/loading/success/error semantics.
- [ ] P9.05 Motion is purposeful, fast and reduced-motion aware; no decorative performance tax.

### Screens
- [ ] P9.10 Sign in / account chooser / recovery / device approval.
- [ ] P9.11 Inbox: density, categories, unread hierarchy, selection, keyboard navigation, virtualization.
- [ ] P9.12 Thread reader: message hierarchy, attachments, security indicators, collapse/expand, actions.
- [ ] P9.13 Compose: autosave, recipients, formatting, attachments, scheduling, undo-send, failure recovery.
- [ ] P9.14 Search: instant query, operators, filters, recent queries, zero/error states.
- [ ] P9.15 Labels/folders/spam/trash/archive flows.
- [ ] P9.16 Settings: accounts, signatures, filters, forwarding, security, devices, notifications, appearance.
- [ ] P9.17 Quanty sidecar: contextual suggestions, explicit scope, preview before side effects, visible provenance.
- [ ] P9.18 Responsive layouts for phone/tablet/foldable/desktop/large desktop.
- [ ] P9.19 Keyboard power-user model and command palette.
- [ ] P9.20 Visual-regression and usability test each screen before closing it.

## Phase 10 — Native/Universal Clients
- [ ] P10.01 Audit existing Flutter/mobile/web/desktop shells before choosing framework boundaries.
- [ ] P10.02 Shared domain/API contracts; platform UI may diverge where native conventions improve UX.
- [ ] P10.03 Android: notifications, share targets, background sync, deep links, secure storage.
- [ ] P10.04 iOS/iPadOS: notifications, share sheet, background tasks, universal links, secure storage.
- [ ] P10.05 Windows/macOS/Linux: Tauri/native-shell evaluation, tray, notifications, deep links, file integration, secure credential store.
- [ ] P10.06 Web/PWA: service worker, cache policy, push where supported, installability and offline shell.
- [ ] P10.07 Cross-platform parity matrix; intentional exceptions documented.

## Phase 11 — Reliability, Security & Observability
- [ ] P11.01 Extend existing OpenTelemetry; preserve trace context across HTTP, queues, workers and Quanty tasks.
- [ ] P11.02 Define SLOs and error budgets for auth, mailbox read, send, sync, search and realtime.
- [ ] P11.03 Add circuit breakers/bulkheads where remote dependencies can cascade.
- [ ] P11.04 Structured logs with secret/PII redaction.
- [ ] P11.05 Backup/restore and disaster-recovery drills with measured RPO/RTO.
- [ ] P11.06 Dependency/SBOM/vulnerability/license scanning in CI.
- [ ] P11.07 Threat model and external-style penetration checklist before production gate.
- [ ] P11.08 Load, soak, chaos and failover tests with stored evidence.

## Phase 12 — ArtCraft / Creative Engine Evaluation
For each PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft, DesignCraft, FigCraft, WordCraft, SoundCraft, DeckCraft, CADCraft, GridCraft:
- [ ] Inspect actual source, maturity, tests, dependencies, license/assets/codecs/fonts.
- [ ] Map overlap with existing Quant engines.
- [ ] Benchmark representative files/workloads.
- [ ] Decide Keep Quant / Borrow algorithms or formats / Integrate library / Replace only if objectively superior.
- [ ] Expose reusable operations through a Shared Creative SDK; do not bundle 13 monoliths into every app.
- [ ] QuantCooks gets full studio surface; other apps receive only relevant mini-editor capabilities.
- [ ] Security sandbox, autosave/recovery, undo/redo, import/export fidelity and cross-device project sync tests.

## Phase 13 — Roll Pattern Across Entire Ecosystem
Repeat the same evidence → design → implementation → test → observability → UX → rollout gate for:
- [ ] QuantChat / QuantMeet
- [ ] QuantAI
- [ ] QuantGram
- [ ] QuantWave
- [ ] QuanTube
- [ ] QuantMax
- [ ] QuantCooks
- [ ] QuantAds
- [ ] QuantDrive / QuantCalendar / QuantGit / other shared surfaces as they are promoted into the architecture

## Release Gate
A phase may be marked COMPLETE only when:
1. Acceptance criteria are machine/test verifiable where possible.
2. CI is green and critical E2E passes on target platforms.
3. Security/privacy review has no unresolved release blocker.
4. Observability proves the new path is operating.
5. Migration/rollback has been exercised.
6. UX/accessibility/visual regression is signed off with evidence.
7. Production-critical mocks/stubs/TODOs are zero for that scope.
8. Documentation/runbook and architecture decision are current.

## Working Rule
Never install an engine because it is popular. Measure the gap in Quant first. Prefer existing proven Quant code; extend it when sound; borrow narrowly from OSS; replace only with evidence. Every future discovery must be added to this file as an atomic task before implementation.


## Screen Audit 001 — QuantMail Sign-in / SSO Entry
### Evidence verdict
- **KEEP:** server-rendered auth shell + Suspense skeleton + isolated interactive LoginForm island. Existing regression notes show the previous client-only shell caused ~2.5s slower mobile paint and a ~659.8KB JS/spinner-wall path.
- **KEEP/HARDEN:** memory-scoped access token + HttpOnly refresh-cookie browser boundary; Argon2 login; rate limits; 2FA/recovery-code flow; opaque external SSO handoff ticket instead of bearer-in-URL.
- **REDESIGN:** visual identity, hierarchy, component tokens and responsive composition must move to the final Quant Design System; do not copy competitor trade dress.
- **VERIFY:** existing CI definitions are not proof of current deployed success. Capture fresh CI + browser/device evidence before closure.
- **ENGINE:** no identity-engine replacement approved. Compare current Quant Identity against Keycloak/authentik/ZITADEL only after a capability/security/ops/license gap matrix.

### Atomic implementation tasks
- [ ] QM-AUTH-001 Capture current /login renders at phone 360/390, tablet, 1366, 1440 and large desktop; light/dark where supported.
- [ ] QM-AUTH-002 Measure SSR first paint, LCP, INP, CLS, transferred JS and hydrated JS; preserve or improve the server-island architecture.
- [ ] QM-AUTH-003 Inventory AuthShell/AuthBrandPanel/LoginForm hardcoded zinc/white/red/emerald values and migrate them to semantic design tokens.
- [ ] QM-AUTH-004 Define final Quant identity lockup/logo treatment before visual sign-off; temporary wordmark must not become accidental brand lock.
- [ ] QM-AUTH-005 Redesign credentials state: hierarchy, spacing, fields, password reveal, forgot-password, primary action, account creation and legal/help affordances.
- [ ] QM-AUTH-006 Redesign 2FA state with TOTP/recovery switching, expiry state, retry, focus restoration and accessible live announcements.
- [ ] QM-AUTH-007 Design account chooser/add-account/switch-account states as first-class screens, not query-param-only visual patches.
- [ ] QM-AUTH-008 Design session-expired, revoked-device, offline, server-unavailable, rate-limited and maintenance states.
- [ ] QM-AUTH-009 Add passkey/WebAuthn sign-in UX only after backend capability is verified; progressive enhancement, password recovery remains viable.
- [ ] QM-AUTH-010 Ensure 44px+ touch targets, visible focus, 200% zoom, screen-reader labels/errors, autofill/password-manager compatibility and reduced motion.
- [ ] QM-AUTH-011 Verify no access/refresh/SSO bearer appears in URL, localStorage, sessionStorage, analytics, logs or referrer.
- [ ] QM-AUTH-012 Test credential stuffing/rate limit, enumeration resistance, open redirect, SSO replay, expired ticket, CSRF/origin, 2FA bypass and recovery-code reuse.
- [ ] QM-AUTH-013 Playwright journeys: success, bad password, 2FA success/failure/expiry, forgot-password, registration return, external SSO handoff, logout→login, refresh restore.
- [ ] QM-AUTH-014 Browser matrix: Chromium, Firefox, WebKit; mobile emulation is not sufficient for final gate—run real Android/iOS acceptance.
- [ ] QM-AUTH-015 Visual regression snapshots for every auth state and breakpoint; intentional diffs require review.
- [ ] QM-AUTH-016 Performance gate: prevent return of client-only spinner wall or static-shell dependency on offline mail stores.
- [ ] QM-AUTH-017 Native auth contract: Android Custom Tabs / iOS system auth session + PKCE + verified deep/universal link; never embedded credential-stealing WebView.
- [ ] QM-AUTH-018 Desktop auth contract: system-browser PKCE callback, secure credential store and single logout/revocation behavior.
- [ ] QM-AUTH-019 OSS identity matrix: current Quant vs Keycloak vs authentik vs ZITADEL—protocols, WebAuthn/passkeys, MFA, device/session admin, enterprise federation, SCIM, HA, upgrade path, license, resource cost and migration blast radius.
- [ ] QM-AUTH-020 Close only with fresh CI artifacts + screenshots + accessibility report + security negatives + performance measurements + real-device evidence.
