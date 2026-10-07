# QuantChat C12 — Settings, Privacy & Devices Deep Screen Architecture

**Status:** Target-state architecture / implementation contract  
**Scope:** C12 Settings / Privacy / Devices inside QuantChat  
**Product law:** Settings control policy and user intent; canonical identity, security and data ownership remain governed by the platform and owning domains.

## 0. C12 thesis

C12 is not a miscellaneous settings dump. It is the user's control plane for:
- identity/session visibility
- devices
- privacy
- security
- notifications
- camera/location/calls
- communities/discovery
- Quanty permissions
- memory/AI context
- storage/data lifecycle
- accessibility/appearance
- credits and product preferences

QuantMail remains the identity root/provider. Authorization is a platform concern.

Every sensitive operation evaluates:
subject + tenant + resource + action + scope + policy + device/session + risk.

---

# 1. C12 screen inventory

| Screen | Purpose |
|---|---|
| C12.1 Settings Home | navigation and account overview |
| C12.2 Account & Identity | identity projection and account actions |
| C12.3 Profile | public/social profile controls |
| C12.4 Devices | linked device inventory |
| C12.5 Device Detail | device session/key/security state |
| C12.6 Sessions | active sessions and revocation |
| C12.7 Security Center | security posture and sensitive controls |
| C12.8 Privacy Center | global privacy dashboard |
| C12.9 Presence & Discovery | last seen, read receipts, discoverability |
| C12.10 Calls & Meet Privacy | calling/meeting controls |
| C12.11 Camera / Location | sensor/location permissions |
| C12.12 Communities & Groups | who can add/invite/discover |
| C12.13 Notifications | notification preferences |
| C12.14 Quanty Permissions | AI/context/tool permissions |
| C12.15 Memory & Personalization | memory and personalization policy |
| C12.16 Data & Storage | storage, export, deletion, retention |
| C12.17 Connected Apps & Tools | integrations and capability grants |
| C12.18 Blocked / Restricted | people and interaction restrictions |
| C12.19 Appearance & Accessibility | UI, motion, language, accessibility |
| C12.20 Advanced / Danger Zone | irreversible and high-risk controls |

---

# 2. C12.1 Settings Home

## Mobile
- Sectioned list with account header.
- Security/privacy status cards at top.
- Search settings.
- High-risk actions never sit beside casual toggles without visual separation.

## Web/Tauri
- Persistent left navigation + detail pane.
- Searchable settings command surface.
- Security status can be pinned.

## Muse placement
Muse may explain a setting, but never changes it silently.
Example:
"Why does this permission matter?" -> explanation.
"Turn this on" -> confirmation + normal policy check.

---

# 3. C12.2 Account & Identity

QuantChat consumes identity from QuantMail/platform identity.

Displays:
- display name
- handle
- verified identity state
- account status
- organization memberships where authorized
- account recovery status

Account changes deep-link to the canonical identity provider when QuantChat is not the owner.

Never duplicate identity truth locally.

---

# 4. C12.3 Profile

Controls:
- avatar
- display name projection
- bio
- profile visibility
- story visibility
- discoverability
- social/contact presentation

Profile source ownership must be explicit.

A profile edit should route to the owning profile/identity service where appropriate.

---

# 5. C12.4 Devices

Device list:
- device name
- platform
- app version
- last active
- session state
- verification state
- key state
- approximate network/region metadata only where policy permits

Actions:
- inspect
- rename
- verify
- revoke
- sign out.

A revoked device loses future authenticated access according to session/key policy.

---

# 6. C12.5 Device Detail

Security detail:
- device identity
- session IDs represented safely
- cryptographic/key status
- last authentication
- capabilities
- trusted/untrusted state
- linked session status

Never expose private keys or secrets.

For multi-device E2EE:
- device identity is distinct from account identity
- key verification state is explicit
- new device enrollment requires secure authorization
- revoked devices cannot continue receiving protected message keys.

---

# 7. C12.6 Sessions

Session model:
active -> idle -> expired -> revoked.

Actions:
- sign out current device
- sign out other device
- revoke all other sessions
- invalidate suspicious session

Risky revocation may require re-authentication/step-up.

Session lists are projections of platform auth state.

---

# 8. C12.7 Security Center

Security posture:
- account recovery
- recent sign-ins
- active sessions
- device verification
- suspicious activity
- authentication methods
- security notifications
- emergency sign-out

High-risk changes require:
- current authenticated session
- risk evaluation
- step-up authentication where needed
- audit event.

No UI badge may claim "secure" based on client-only checks.

---

# 9. C12.8 Privacy Center

Central privacy dashboard:
- profile visibility
- presence
- read receipts
- calls
- groups
- stories
- location
- camera/mic
- discovery
- personalization
- Quanty context
- memory
- connected apps.

Every setting has:
- current state
- scope
- explanation
- effect
- source of truth
- reset/default option where supported.

---

# 10. C12.9 Presence & Discovery

Controls:
- last seen
- online visibility
- read receipts
- typing indicators
- profile discoverability
- handle discovery
- contact discovery
- blocked-user visibility behavior

Privacy rules must be evaluated server-side.

Some combinations may be constrained by product policy; the UI must explain the resulting behavior instead of pretending every combination is independently possible.

---

# 11. C12.10 Calls & Meet Privacy

Controls:
- who can call
- who can invite to Meet
- unknown callers
- waiting room defaults
- screen sharing permissions
- recording consent preferences
- captions defaults
- meeting link behavior
- device auto-join preferences

These are policy defaults, not bypasses for C08 authorization.

---

# 12. C12.11 Camera / Location

Camera:
- app camera permission status
- lens/effect permissions
- camera defaults
- media upload behavior

Location:
- precise/coarse policy
- sharing defaults
- map visibility
- ghost/hidden mode
- background location restrictions

QuantChat must respect OS permissions. App-level preference cannot grant an OS-denied capability.

---

# 13. C12.12 Communities & Groups

Controls:
- who can add user to groups
- who can invite to communities
- discovery settings
- join request behavior
- unknown community requests
- role/mention notifications

Community administrators can impose community policy, but cannot override platform-level privacy/security constraints.

---

# 14. C12.13 Notifications

C11 owns delivery behavior; C12 provides the user-facing settings entry point.

Controls:
- notification categories
- sounds
- badges
- preview privacy
- quiet hours
- product-specific thresholds
- device overrides.

C12 stores/updates policy through the notification capability rather than duplicating notification state.

---

# 15. C12.14 Quanty Permissions

This is a critical trust screen.

Scopes:
- conversation context
- meeting context
- community moderation
- camera/media
- notification triage
- ecosystem search
- Drive
- Calendar
- Mail
- Git
- automation
- memory

Each grant shows:
- capability
- source
- scope
- risk tier
- expiry
- last used
- revoke.

Quanty never receives a permanent master token.

Tool grants are short-lived, scoped and auditable.

---

# 16. C12.15 Memory & Personalization

Separate:
- temporary context
- durable memory
- embeddings
- personalization preferences
- source-of-truth records

Controls:
- memory access
- memory write permissions
- review derived memories
- delete/forget workflows
- personalization controls
- AI context retention
- embedding/retrieval participation where supported

A setting must not imply that deleting a memory deletes the source record.

Derived sensitive inferences must not silently become durable personal facts.

---

# 17. C12.16 Data & Storage

Controls:
- storage usage
- cached media
- downloaded content
- Drive handoff
- data export
- account deletion
- retention
- ephemeral content policy
- deletion status

Export is generated from authoritative sources.

Deletion is an orchestrated lifecycle:
request -> identity verification -> dependency analysis -> source deletion -> projection/cache cleanup -> derived artifact cleanup -> completion evidence.

Do not claim deletion complete before verification.

---

# 18. C12.17 Connected Apps & Tools

List:
- connected Quant apps
- third-party integrations
- bots
- mini-apps
- API clients
- tool grants.

For each:
- permissions
- last used
- data scope
- expiry
- revoke.

Revocation invalidates future access and propagates to active sessions where required.

---

# 19. C12.18 Blocked / Restricted

Views:
- blocked people
- restricted conversations
- muted communities
- hidden channels
- reported entities

Actions are explicit and reversible where policy permits.

Blocking should affect:
- discovery
- messaging
- calls
- notifications
- social surfaces
- search suggestions
according to the platform's canonical block policy.

---

# 20. C12.19 Appearance & Accessibility

Appearance:
- light/dark/system
- density
- font sizing
- motion
- animation intensity
- wallpaper/theme where supported

Accessibility:
- screen reader
- high contrast
- reduced motion
- captions
- larger controls
- keyboard navigation
- haptics/sound preferences.

Mobile/Capacitor uses native accessibility primitives; Web/Tauri use semantic HTML/native desktop accessibility.

---

# 21. C12.20 Advanced / Danger Zone

Separate high-risk actions:
- revoke all sessions
- revoke all device trust
- reset security configuration
- disconnect integrations
- delete account
- clear local protected data

Each action:
- explains consequence
- requires appropriate authentication
- uses explicit confirmation
- is idempotent where possible
- produces audit/evidence.

Destructive actions must not be hidden behind ambiguous labels.

---

# 22. Security architecture

Identity hierarchy:
Human -> Organization -> Device -> Service -> Agent -> API client -> Developer.

Sensitive action authorization evaluates:
subject + tenant + resource + action + scope + policy + device/session + risk.

Controls:
- tenant isolation
- encryption in transit/at rest
- key rotation
- audit
- rate limiting
- abuse controls
- WAF/DDoS
- secure file handling
- prompt-injection defenses
- SSRF controls
- supply-chain verification.

---

# 23. Multi-device architecture

Each device is independently represented.

Enrollment:
request -> authenticate -> approve -> provision keys/session -> verify -> active.

Revocation:
request -> authenticate/step-up -> revoke session -> revoke device trust -> key policy update -> propagate -> verify.

Device handoff between C07/C08 uses a short-lived scoped handoff capability, never a reusable account credential.

---

# 24. Privacy policy engine

Settings are inputs to policy evaluation, not merely frontend booleans.

Policy inputs:
- actor
- target
- relationship
- tenant
- device
- context
- feature
- privacy setting
- safety policy
- legal/retention state.

Decision:
allow / deny / allow-with-restriction / require-step-up / require-consent.

Every sensitive denial should produce an actionable reason without leaking protected policy internals.

---

# 25. API contract

GET /api/settings
GET /api/settings/profile
PATCH /api/settings/profile
GET /api/settings/privacy
PATCH /api/settings/privacy
GET /api/settings/security
POST /api/settings/security/step-up
GET /api/devices
GET /api/devices/:id
POST /api/devices/:id/verify
POST /api/devices/:id/revoke
POST /api/sessions/:id/revoke
POST /api/sessions/revoke-all
GET /api/quanty/grants
POST /api/quanty/grants/:id/revoke
GET /api/connected-apps
POST /api/connected-apps/:id/revoke
GET /api/memory/settings
PATCH /api/memory/settings
POST /api/data/export
POST /api/data/deletion
GET /api/data/deletion/:id
GET /api/storage/usage

Mutations require authenticated identity, authorization, idempotency where retryable and appropriate step-up authentication.

---

# 26. Events

Representative events:
settings.preference.updated
privacy.policy.changed
device.enrolled
device.verified
device.revoked
session.revoked
security.step_up.completed
quanty.grant.created
quanty.grant.revoked
integration.revoked
memory.policy.changed
data.export.requested
data.export.completed
data.deletion.requested
data.deletion.completed

Sensitive events are audited and emitted through the event spine with minimum necessary payload.

---

# 27. Realtime / offline

Settings are durable server state.

Offline:
- read cached settings with stale labeling
- queue safe preference updates with version checks
- security/device revocation requires connectivity and fresh authorization
- destructive actions never execute from stale offline state.

Realtime:
- device/session changes
- security alerts
- grant revocation
- privacy policy changes
must reconcile immediately.

---

# 28. Platform UX

### Mobile / Capacitor
- sectioned native-feeling list
- bottom sheets for simple policies
- full-screen confirmation for high-risk actions
- biometric/OS authentication where supported
- device cards optimized for touch

### Web
- left settings navigation
- searchable settings
- split detail panels
- keyboard shortcuts
- security events timeline

### Tauri
- native desktop settings shell
- system integration for notifications/devices
- larger device/security detail surfaces

All platforms share the same policy schema and authorization behavior.

---

# 29. Accessibility

- keyboard access
- screen-reader labels and headings
- focus management after setting changes
- clear success/failure announcements
- no color-only security states
- reduced motion
- large touch targets
- readable risk warnings
- accessible destructive confirmation.

---

# 30. Failure matrix

| Failure | Required behavior |
|---|---|
| Auth provider unavailable | do not fabricate identity/security state |
| Device revoke fails | show unresolved state and retry path |
| Settings version conflict | re-fetch and reconcile |
| OS permission denied | explain OS-level limitation |
| Export fails | retain request state and retry |
| Deletion partially fails | show lifecycle state; do not claim complete |
| Grant revoke fails | preserve warning and retry |
| Security step-up fails | no sensitive action |
| Offline security action | blocked until online |
| Policy service unavailable | fail closed for sensitive actions |

---

# 31. Test matrix

Unit:
- settings policy
- privacy evaluation
- device/session state
- risk classification
- grant lifecycle
- deletion/export state machine

Integration:
- device enrollment/revocation
- session revoke
- Quanty grant revoke
- notification preference updates
- C07/C08 device handoff
- memory policy
- connected app revoke

Security:
- session fixation
- forged device enrollment
- privilege escalation
- stale grant
- cross-tenant access
- step-up bypass
- sensitive setting disclosure
- token/secret exposure

Privacy:
- block propagation
- hidden presence
- notification preview policy
- location policy
- AI context restrictions
- deletion propagation

Accessibility:
- keyboard
- screen reader
- touch
- high contrast
- reduced motion

E2E:
- new device -> verify -> Chat
- revoke device -> session terminated
- grant Quanty -> use -> revoke -> denied
- privacy change -> C02/C06/C07/C08 behavior changes
- deletion request -> lifecycle verification.

---

# 32. Muse implementation sequence

C12-A: settings domain/policy schema.
C12-B: Settings Home + navigation.
C12-C: account/profile projections.
C12-D: devices + sessions + verification.
C12-E: privacy policy engine UI.
C12-F: calls/camera/location/community controls.
C12-G: Quanty grants + memory controls.
C12-H: connected apps/tool revocation.
C12-I: export/deletion/storage lifecycle.
C12-J: security center + danger zone.
C12-K: platform polish/accessibility/security hardening.

Muse must inspect existing settings/auth/security code before every slice, preserve canonical identity ownership, reuse platform policy contracts, add tests, run affected validation and document evidence.

---

# 33. C12 definition of done

C12 is complete only when:
- every sensitive setting has server-side policy enforcement
- identity is not duplicated
- device/session state is authoritative
- multi-device security is explicit
- Quanty grants are scoped/revocable
- privacy controls affect actual product behavior
- data export/deletion have lifecycle verification
- OS permissions are respected
- dangerous actions require appropriate step-up
- offline cannot bypass security
- mobile/Web/Tauri/Capacitor share one policy model
- accessibility/security/privacy are tested
- no fake security posture is displayed.

## C12 architectural invariant

**C12 gives the user control over policy without becoming the owner of identity or security truth: settings express intent, the platform enforces it, and every sensitive transition is authenticated, authorized, auditable and verifiable.**
