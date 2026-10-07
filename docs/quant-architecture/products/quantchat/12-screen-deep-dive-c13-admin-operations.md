# QuantChat C13 — Admin & Operations Deep Screen Architecture

**Status:** Target-state architecture / implementation contract  
**Scope:** Product-owned QuantChat operational control plane.  
**Boundary:** C13 operates QuantChat domains; it does not become a company-wide super-admin or duplicate another product's source of truth.

## 0. Operating thesis

QuantChat Admin is the operational cockpit for:
- organizations, communities, channels and roles
- users and device/session safety signals
- reports, moderation and appeals
- calls/QuantMeet health
- media, AR and storage operations
- bots/mini-apps
- retention/privacy requests
- credits/entitlements relevant to QuantChat
- product configuration and feature flags
- audit and operational evidence
- incidents, reliability and service health

Product-owned admin is authoritative for QuantChat policy. The enterprise hub aggregates status and links; it does not reimplement QuantChat policy.

Every sensitive admin action evaluates:
actor + tenant + target + capability + scope + risk + device/session + approval + audit.

---

# 1. Admin navigation

### Web / Tauri primary shell
1. Overview
2. Organizations
3. Users & Devices
4. Communities
5. Channels
6. Moderation
7. Reports & Appeals
8. Calls & QuantMeet
9. Media & AR
10. Bots & Mini Apps
11. Privacy & Data Requests
12. Credits & Entitlements
13. Configuration
14. Feature Flags
15. Audit
16. Incidents
17. System Health

### Mobile
Admin is not a shrunken desktop dashboard.
- incident alerts
- moderation queue
- urgent reports
- user/device safety actions
- call/Meet incidents
- approvals
- audit confirmation
Use full desktop/admin surfaces for complex configuration.

---

# 2. C13.1 Admin Overview

Dashboard cards:
- active users/conversations
- realtime gateway health
- message/event lag
- active calls/Meet rooms
- moderation queue
- unresolved reports
- storage/transcoding backlog
- notification delivery health
- critical incidents
- policy/config changes

Every metric carries:
- timestamp
- freshness
- scope/tenant
- source
- aggregation level.

Never show stale operational data as live.

Quanty can explain anomalies and summarize incidents, but cannot silently alter operations.

---

# 3. C13.2 Organizations

Capabilities:
- organization lookup
- organization status
- domain/SSO projection
- roles
- community/channel inventory
- retention/privacy configuration where QuantChat owns it
- suspension/restriction workflow

Cross-product identity remains owned by QuantMail/platform identity.

Tenant isolation is mandatory at query and mutation time.

---

# 4. C13.3 Users & Devices

User detail:
- canonical identity reference
- QuantChat memberships
- safety status
- reports
- restrictions
- device/session projections
- recent security events
- active calls/Meet participation where authorized

Device detail:
- device identity
- session state
- verification state
- last active
- client version
- trust state.

Never expose private keys, authentication secrets or unnecessary personal data.

Admin actions:
- restrict
- suspend
- revoke session/device
- require re-verification
- restore.

High-risk actions require step-up and explicit reason.

---

# 5. C13.4 Communities

Operations:
- community health
- membership
- roles
- channel tree
- moderation settings
- discovery settings
- events/Meet spaces
- bots
- reports

Bulk actions require preview + authorization + bounded batch size + audit.

---

# 6. C13.5 Channels

Inspect:
- channel type
- membership
- permission bindings
- message throughput
- moderation state
- retention state
- unread/index freshness
- live/stage status

Actions:
- restrict posting
- lock
- archive
- restore
- transfer delegated administration
- update moderation configuration.

Channel policy must never bypass platform safety constraints.

---

# 7. C13.6 Moderation Center

Unified queue for:
- spam
- harassment
- impersonation
- scams
- child-safety signals
- coordinated abuse
- copyright reports
- malicious links
- unsafe media
- bot abuse.

Queue state:
new → triaged → investigating → actioned → appealed → resolved.

Evidence is access-controlled and minimized.

Automated decisions must expose:
- policy reason
- confidence
- model/policy version
- available appeal path.

---

# 8. C13.7 Reports & Appeals

Report detail:
- reporter
- target
- category
- evidence references
- related events
- prior enforcement
- policy version
- reviewer assignment.

Appeal:
submitted → queued → human/authorized review → decision → notification → closed.

Appeal decisions are auditable and must not be overwritten invisibly.

---

# 9. C13.8 Calls & QuantMeet Operations

Live operations:
- active sessions
- room health
- SFU node
- packet loss/jitter/RTT
- participant count
- track health
- recording state
- transcription state
- region
- incident state.

Operator actions:
- inspect
- isolate a failing media path
- terminate an abusive session where policy permits
- drain unhealthy infrastructure
- move/recover session through supported mechanisms.

No operator action may expose E2EE plaintext or bypass participant privacy.

---

# 10. C13.9 Media & AR Operations

Monitor:
- upload backlog
- encryption/upload failures
- transcoding queue
- moderation pipeline
- R2 object references
- thumbnail generation
- lens/asset publication
- client compatibility.

Actions:
- quarantine asset
- retry processing
- disable broken lens/version
- restore approved asset
- inspect provenance.

Original source files and user-private media remain subject to access policy.

---

# 11. C13.10 Bots & Mini Apps

Manage:
- bot identity
- owner
- permissions/capabilities
- webhook health
- rate limits
- scopes
- last activity
- abuse reports
- disable/revoke.

Bot capability grants are explicit and scoped.

A bot cannot inherit an administrator's privileges.

---

# 12. C13.11 Privacy & Data Requests

Admin workflows:
- export request
- deletion request
- retention exception
- legal hold where applicable
- privacy incident
- derived-data cleanup verification.

Lifecycle:
requested → authenticated → scoped → processing → source cleanup → projection/index cleanup → derived artifact cleanup → verified → completed.

No "completed" state before evidence checks succeed.

Access to requests is heavily restricted and audited.

---

# 13. C13.12 Credits & Entitlements

QuantChat admin can inspect:
- QuantChat entitlement
- premium Meet features
- lens/effect purchases
- gifts/tips where applicable
- usage/credit events.

QuantTrinity remains economy source of truth.

Admin may inspect/reconcile through capability contracts; it must not maintain a second balance ledger.

---

# 14. C13.13 Configuration

Configuration domains:
- message limits
- attachment limits
- community limits
- call/Meet limits
- moderation thresholds
- retention defaults
- notification defaults
- feature availability
- media limits.

Every configuration:
- has owner
- schema/version
- environment
- effective time
- change reason
- actor
- rollback strategy.

Secrets are never configuration values in the admin UI.

---

# 15. C13.14 Feature Flags

Flag dimensions:
- product
- platform
- region
- organization
- cohort
- percentage rollout
- experiment.

Lifecycle:
draft → approved → staged → canary → rollout → stable → retired.

Flags must have:
- owner
- expiry/review date
- safety constraints
- fallback
- audit trail.

Security-sensitive behavior must never rely solely on client-side flags.

---

# 16. C13.15 Audit Explorer

Searchable immutable audit stream:
- actor
- action
- target
- scope
- risk tier
- approval
- timestamp
- correlation/trace id
- result
- reason
- source service.

Audit data is append-only.

Sensitive payloads are minimized; references are preferred over copied content.

Export requires authorization.

---

# 17. C13.16 Incident Center

Lifecycle:
detect → triage → contain → communicate → recover → verify → postmortem → prevention.

Incident view:
- severity
- impacted services
- impacted tenants
- timeline
- alerts
- metrics
- traces
- deploy/config changes
- responders
- mitigations
- recovery evidence.

Quanty can summarize telemetry and propose investigation steps. It cannot declare recovery without verification.

---

# 18. C13.17 System Health

Service map:
- ws-gateway
- cdc-relay
- signal-projector
- moderation-worker
- video-transcoder
- notification path
- search/indexing
- WebRTC/SFU
- storage
- database
- Redis
- Kafka.

Health signals:
latency, error rate, saturation, queue depth, consumer lag, projection lag, index freshness, availability.

Every critical service has SLO/error-budget context.

---

# 19. Admin RBAC + capability model

Roles are composed from capabilities, not hard-coded UI roles.

Example capabilities:
quantchat.users.read
quantchat.users.restrict
quantchat.devices.revoke
quantchat.communities.manage
quantchat.channels.manage
quantchat.moderation.review
quantchat.appeals.review
quantchat.meet.ops
quantchat.media.quarantine
quantchat.bots.manage
quantchat.privacy.process
quantchat.config.write
quantchat.flags.write
quantchat.audit.read
quantchat.incidents.manage

Risk tiers:
0 read-only
1 draft
2 reversible operational action
3 external/user-impacting action
4 destructive/security/economic action.

Tier 3 requires confirmation by default. Tier 4 requires step-up authentication and stronger approval policy where configured.

---

# 20. Break-glass

Emergency access is:
- time-limited
- reason-bound
- scope-bound
- independently audited
- explicitly approved where policy requires
- automatically revoked at expiry.

Break-glass never means "master token."

---

# 21. Quanty in Admin

Quanty is an operations copilot, not an unrestricted admin agent.

Modes:
- Observe: read telemetry/evidence
- Investigate: correlate authorized evidence
- Draft: prepare actions
- Execute: only with scoped capability and approval
- Verify: confirm outcome

Examples:
"Why are Meet rooms failing in region X?"
→ gather authorized telemetry → evidence → hypothesis.

"Restrict this abusive account."
→ plan → show target/reason → require authorized approval → execute → verify.

"Disable all communities."
→ Tier 4/high blast radius → blocked unless explicit high-level authorization policy permits.

Prompt-injected user content is untrusted data and cannot become admin instructions.

---

# 22. Admin realtime architecture

Admin receives:
- moderation queue updates
- incident alerts
- service health changes
- live Meet health
- device/security events
- config/flag changes.

Architecture:
producer → transactional outbox → event spine → admin projections → WebSocket/SSE → UI.

Admin UI never subscribes directly to arbitrary product databases.

---

# 23. Admin API surface

GET /admin/overview
GET /admin/organizations
GET /admin/users
GET /admin/users/:id
POST /admin/users/:id/restrict
POST /admin/devices/:id/revoke
GET /admin/communities
GET /admin/channels
GET /admin/moderation/queue
POST /admin/moderation/:id/decision
GET /admin/reports
POST /admin/appeals/:id/decision
GET /admin/meet/live
GET /admin/media/queue
POST /admin/media/:id/quarantine
GET /admin/bots
POST /admin/bots/:id/revoke
GET /admin/privacy/requests
POST /admin/privacy/requests/:id/action
GET /admin/config
PATCH /admin/config/:key
GET /admin/flags
PATCH /admin/flags/:id
GET /admin/audit
GET /admin/incidents
POST /admin/incidents
GET /admin/health

All mutations require authorization, idempotency where applicable, risk evaluation and audit.

---

# 24. Event contracts

Representative events:
admin.action.requested
admin.action.approved
admin.action.completed
moderation.case.created
moderation.case.resolved
appeal.submitted
appeal.resolved
device.admin_revoked
meet.health.degraded
media.asset.quarantined
bot.capability.revoked
privacy.request.updated
config.changed
feature_flag.changed
incident.created
incident.resolved

Events carry references and minimum necessary metadata.

---

# 25. Data ownership

QuantChat owns:
- communities/channels
- moderation cases
- call/Meet operational state
- QuantChat configuration
- QuantChat admin policy
- bot registrations
- QuantChat audit projections.

It references:
- identity → QuantMail/platform identity
- economy → QuantTrinity
- files/media → QuantDrive/R2 ownership contract
- memory → governed memory platform
- AI → QuantAI/Quanty platform
- organization identity → platform organization domain.

No cross-product database joins.

---

# 26. Platform UI contract

### Web
Primary admin platform:
- dense data tables
- split detail panes
- command palette
- saved filters
- keyboard navigation
- audit timeline
- live incident panels.

### Tauri
Same operational model with native desktop notifications, multi-window incident views and persistent operator workspaces.

### Mobile / Capacitor
Only high-value operational workflows:
- moderation
- reports
- urgent approvals
- incidents
- user/device safety
- Meet health.

### Accessibility
- semantic tables
- keyboard-first workflows
- screen-reader status announcements
- non-color severity indicators
- reduced motion
- accessible evidence viewer
- confirmation dialogs with clear consequences.

---

# 27. Failure and safety matrix

| Failure | Behavior |
|---|---|
| policy service unavailable | fail closed for sensitive mutations |
| stale admin projection | show freshness warning |
| event lag | do not claim live state |
| action timeout | unknown outcome; reconcile before retry |
| duplicate action | idempotency prevents double execution |
| audit write failure | sensitive mutation fails or enters explicitly supported durable recovery |
| telemetry missing | show evidence gap |
| step-up failure | action blocked |
| cross-tenant target | hard deny |
| Quanty tool unavailable | no fabricated success |
| incident recovery uncertain | remain unresolved |

---

# 28. Testing

Unit:
- capability evaluation
- risk classification
- tenant isolation
- moderation state machine
- feature flag constraints
- audit serialization.

Integration:
- report → moderation → enforcement → appeal
- device revoke
- Meet incident
- media quarantine
- bot revoke
- privacy request lifecycle
- config rollout/rollback.

Security:
- IDOR
- cross-tenant access
- privilege escalation
- stale capability
- break-glass expiry
- step-up bypass
- audit tampering
- prompt injection against admin Quanty.

Reliability:
- event duplication
- out-of-order events
- projection lag
- action timeout/reconciliation
- service degradation
- incident failover.

E2E:
- operator login → scoped dashboard
- investigate → approve → execute → verify
- moderation decision → user state change
- feature flag canary → rollback
- privacy request → verified completion.

---

# 29. Muse implementation sequence

C13-A: admin domain/capability schema.
C13-B: shell + overview.
C13-C: organizations/users/devices.
C13-D: communities/channels.
C13-E: moderation/reports/appeals.
C13-F: Calls/QuantMeet operations.
C13-G: media/AR + bots.
C13-H: privacy/data lifecycle.
C13-I: configuration/feature flags.
C13-J: audit/incidents/system health.
C13-K: Quanty operator copilot.
C13-L: security hardening, accessibility, performance and operational drills.

Muse must inspect existing product admin primitives before implementation, reuse capability contracts, never invent cross-product ownership, add tests for every mutation and record validation evidence.

---

# 30. C13 definition of done

C13 is complete only when:
- every admin capability is explicit and scoped
- tenant isolation is enforced server-side
- sensitive actions are risk classified
- Tier 3/4 actions have confirmation/step-up behavior
- break-glass is bounded and audited
- moderation and appeals are evidence-backed
- Meet/media/bot operations use product-owned contracts
- privacy requests have verifiable lifecycle state
- feature flags have rollout/rollback safety
- audit is append-only
- incident state is evidence-driven
- Quanty cannot silently become an administrator
- Web/Tauri/mobile surfaces share one authorization model
- no admin UI claims live/healthy/completed without freshness or verification evidence.

## C13 architectural invariant

**QuantChat Admin is a scoped operational control plane, not a master key: every action is capability-bound, tenant-isolated, risk-classified, auditable and verified.**
