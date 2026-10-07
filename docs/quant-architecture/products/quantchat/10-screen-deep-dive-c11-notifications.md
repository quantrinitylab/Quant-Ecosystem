# QuantChat C11 — Notifications Deep Screen Architecture

**Status:** Target-state architecture / implementation contract  
**Scope:** C11 Notifications inside QuantChat  
**Product law:** QuantChat owns notification delivery, grouping, priority, presentation and user delivery policy; originating products remain authoritative for business events.

## 0. Notification thesis

The Quant ecosystem should feel like one notification system without creating one giant cross-product source of truth.

Producers emit typed notification intents.
The notification system evaluates policy, priority, deduplication, grouping, channel routing and delivery.
The user sees one coherent notification experience across Chat, Meet and the wider ecosystem.

Pipeline:

source event -> notification intent -> policy evaluation -> dedupe/group -> priority -> channel routing -> delivery -> receipt -> action/deep link -> outcome.

Business truth stays with the originating product.

---

# 1. C11 screen inventory

| Screen | Purpose |
|---|---|
| C11.1 Notification Center | unified inbox |
| C11.2 Notification Detail | context, provenance and actions |
| C11.3 Priority / Focus View | urgent and high-value notifications |
| C11.4 Mentions View | @mentions, replies, direct interactions |
| C11.5 Meeting View | upcoming/joined/ended meeting alerts |
| C11.6 Ecosystem View | Mail/Calendar/Git/etc. notifications |
| C11.7 Notification Preferences | per-product/per-event controls |
| C11.8 Quiet Hours / Focus | schedule and interruption policy |
| C11.9 Channel Routing | push/in-app/email/device routing |
| C11.10 Grouped Notification | collapsed multi-event presentation |
| C11.11 Action Sheet | approve/reply/join/open/snooze/mute |
| C11.12 Delivery Diagnostics | delivery state for user/device |
| C11.13 Notification Privacy | lock-screen and sensitive-content policy |
| C11.14 Quanty Notification Assistant | governed AI notification triage |

---

# 2. C11.1 Notification Center

## Mobile
- Dedicated full-screen inbox.
- Sections:
  - Urgent
  - Direct
  - Mentions
  - Meetings
  - Ecosystem
  - Low priority
- Unread count is projection state, not source business truth.
- Swipe actions: read, snooze, mute, archive where supported.
- Pull-to-refresh reconciles server state.

## Web
- Notification panel from global QuantChat shell.
- Expandable grouped cards.
- Keyboard navigation.
- Optional persistent notification side rail.

## Tauri
- native desktop notification integration plus in-app center.
- OS notification click routes to source resource.

## Capacitor
- native push token lifecycle and permission state.
- app badge is derived delivery state.

---

# 3. C11.2 Notification Detail

Every notification contains:
- notification ID
- source app
- event type
- title/body projection
- created time
- priority
- privacy classification
- resource reference
- available actions
- provenance
- expiration if applicable.

The user can inspect:
"Why am I seeing this?"
with source, trigger and policy explanation.

Never expose internal security metadata or secrets.

---

# 4. C11.3 Priority / Focus View

Priority is policy-driven.

Inputs:
- source importance
- direct mention
- meeting urgency
- user preference
- relationship/context
- deadline
- severity
- quiet-hours policy
- device state

Priority classes:
P0 emergency/critical platform event
P1 time-sensitive direct action
P2 important
P3 normal
P4 low/background

Priority must not be used to bypass user privacy settings.

Users can override category behavior through preferences.

---

# 5. C11.4 Mentions View

Includes:
- @mentions
- direct replies
- reactions where configured
- group/channel replies
- thread activity
- direct calls/messages

Each item links to the exact source context.

Read state is separate from source-message read/delivery state.

---

# 6. C11.5 Meeting View

Meeting notifications:
- scheduled soon
- invitation
- starting now
- waiting-room/admission
- participant request
- recording available
- recap available
- action item reminder

Actions:
- view
- join
- decline/respond through Calendar where appropriate
- open recap
- open recording
- snooze

Join action deep-links into QuantChat C08. Calendar remains the scheduling authority.

---

# 7. C11.6 Ecosystem View

Originating products:
- QuantMail
- QuantCalendar
- QuantDrive
- QuantGit
- QuantGram
- QuantWave
- QuantMax
- QuantCooks
- QuanTube
- QuantAds
- QuantChat

Each producer emits a notification intent.

Example:
QuantGit says "review requested" through a typed event.
C11 renders it and links to QuantGit.
C11 does not decide whether the PR actually needs review.

---

# 8. C11.7 Notification Preferences

Preference hierarchy:

global
-> product
-> event type
-> conversation/community
-> device
-> delivery channel.

Controls:
- enabled/disabled
- priority threshold
- sound
- vibration
- badge
- lock-screen visibility
- email fallback
- desktop push
- mobile push
- in-app
- digest
- quiet hours
- mention overrides.

Most specific applicable policy wins, subject to security/system-required notifications.

---

# 9. C11.8 Quiet Hours / Focus

Focus profile contains:
- name
- schedule
- allowed people
- allowed products
- allowed event types
- allowed priority levels
- device scope
- exception rules.

Examples:
- Sleep
- Study
- Meeting
- Deep Work
- Travel

Meeting-critical events can be configured as exceptions but must remain user-controlled.

Do not silently infer a permanent focus profile from behavioral data.

---

# 10. C11.9 Channel Routing

Possible channels:
- in-app
- mobile push
- web push
- desktop OS notification
- email fallback where explicitly enabled
- digest
- badge
- wearable/OS integration where supported

Routing engine considers:
device availability
permission state
quiet hours
priority
channel preference
dedupe
delivery cost
source policy.

A notification can have multiple delivery attempts but one canonical notification identity.

---

# 11. C11.10 Grouped Notification

Grouping examples:
"7 new messages in QuantChat"
"3 Git reviews requested"
"2 meetings need attention"

Grouping key:
source + resource + event family + user + time window + privacy scope.

Do not group unrelated private contexts merely to reduce notification count.

Expanding a group performs a fresh authorization check.

---

# 12. C11.11 Action Sheet

Supported actions depend on capability:

- open
- reply
- react
- join
- approve
- decline
- mark read
- snooze
- mute
- archive
- call
- Meet
- open artifact

High-impact actions route through the originating product's capability contract or Quanty approval flow.

A notification is never an authorization token.

---

# 13. C11.12 Delivery Diagnostics

User-facing diagnostics:
- queued
- sent
- delivered
- displayed where measurable
- opened
- actioned
- expired
- failed

Do not claim OS-level display when the platform cannot verify it.

Device view:
- device name
- push registration state
- last successful delivery
- permission status
- notification channel state.

Sensitive provider internals remain admin-only.

---

# 14. C11.13 Notification Privacy

Controls:
- show full text on lock screen
- show sender only
- hide sensitive content
- hide previews
- require device unlock
- notification history retention

Privacy classification is carried by the intent.

Examples:
- normal
- private
- sensitive
- highly sensitive.

The renderer applies device/user policy before displaying content.

---

# 15. C11.14 Quanty Notification Assistant

Quanty can triage notifications, but notification truth remains deterministic.

Modes:
1. summarize
2. prioritize
3. explain
4. group
5. draft responses
6. recommend actions

Example:
"You have 11 notifications. 3 require action today: two Git reviews and one meeting decision."

Quanty must cite the underlying notifications/resources.

It cannot silently:
- mark important items as read
- delete notifications
- mute sources
- send responses
- approve actions.

Consequential actions require the normal capability/approval model.

---

# 16. Notification intent contract

Every producer emits an intent with:

- notificationId
- eventId
- sourceApp
- sourceResourceRef
- eventType
- schemaVersion
- actor
- recipient
- tenant
- title projection
- body projection
- privacy class
- priority hint
- action capabilities
- createdAt
- expiresAt
- dedupeKey
- groupingKey
- correlationId
- provenance.

Priority hints are advisory. C11 policy decides final priority.

---

# 17. Event and delivery architecture

Producer transaction:
domain state + outbox event.

Flow:
outbox -> event spine -> notification-intent projector -> preference/policy engine -> dedupe/group -> routing -> channel adapter.

Channel adapters:
- WebSocket/in-app
- Web Push
- FCM/APNs
- desktop OS
- email fallback
- digest worker.

Delivery events:
notification.created
notification.grouped
notification.queued
notification.sent
notification.delivered
notification.opened
notification.actioned
notification.failed
notification.expired
notification.snoozed
notification.muted.

All consumers are idempotent.

---

# 18. Data model

QuantChat/notification-owned:
- Notification
- NotificationIntent
- NotificationGroup
- NotificationPreference
- NotificationFocusProfile
- NotificationDelivery
- NotificationDevice
- NotificationReceipt
- NotificationAction
- NotificationSnooze
- NotificationMute
- NotificationAuditRef

Source products retain:
- original message
- calendar event
- PR/issue
- mail
- file
- meeting
- campaign
- social event.

Notification records contain typed refs, not duplicated business entities.

---

# 19. API contract

GET /api/notifications
GET /api/notifications/unread-count
GET /api/notifications/:id
POST /api/notifications/:id/read
POST /api/notifications/:id/snooze
POST /api/notifications/:id/mute
POST /api/notifications/:id/action
POST /api/notifications/read-all
GET /api/notification-preferences
PATCH /api/notification-preferences
GET /api/notification-focus
POST /api/notification-focus
PATCH /api/notification-focus/:id
DELETE /api/notification-focus/:id
GET /api/notification-devices
POST /api/notification-devices/register
DELETE /api/notification-devices/:id
POST /api/notifications/quanty/triage

Mutations require authentication, authorization, idempotency where retryable and telemetry.

---

# 20. Realtime behavior

C11 consumes realtime notification events through the shared realtime spine.

Rules:
- duplicate delivery must not create duplicate UI entries
- out-of-order events reconcile by version/timestamp policy
- reconnect triggers cursor-based reconciliation
- stale notification state is refreshed from server
- source deletion/permission changes invalidate notification projections.

If a notification becomes unauthorized, remove it or replace it with an appropriate unavailable state.

---

# 21. Offline behavior

Offline:
- previously cached notifications can be viewed with stale-state labeling
- read/snooze/mute mutations queue only when idempotent
- action commands requiring fresh authorization wait for connectivity
- no fake "delivered" state
- push token changes are reconciled when online.

---

# 22. Platform UX

### Mobile / Capacitor
- OS push + in-app center
- notification categories/actions
- deep links
- badge synchronization
- permission education
- lock-screen privacy

### Web
- browser push
- panel/side rail
- keyboard navigation
- permission fallback

### Tauri
- native desktop notifications
- tray/badge where supported
- global shortcut
- source-app deep links

All platforms use the same notification identity, policy and action contract.

---

# 23. Accessibility

- screen-reader announcement of new high-priority items
- accessible priority labels
- keyboard navigation
- focus management when opening from notification
- no color-only status
- reduced motion
- touch-safe action controls
- readable grouping/expansion
- accessible snooze/mute controls.

---

# 24. Security and privacy invariants

1. Notification payload is never an authorization credential.
2. Server re-checks permissions on actions.
3. Sensitive previews respect device policy.
4. Tokens are never embedded in deep links.
5. Push payloads minimize sensitive content.
6. Cross-tenant notifications are impossible.
7. Deleted/revoked source resources invalidate dependent notifications.
8. Admin access to notification content is audited.
9. Telemetry minimizes message/content capture.
10. User revocation propagates to active delivery registrations.

---

# 25. Failure matrix

| Failure | Behavior |
|---|---|
| Push provider unavailable | retry with backoff / alternate enabled channel |
| WebSocket disconnected | cached center + reconnect reconciliation |
| Device permission denied | explain and keep in-app delivery |
| Source resource deleted | notification invalidated |
| Action authorization expired | re-check and ask user to reopen |
| Duplicate event | idempotent dedupe |
| Out-of-order event | version-aware reconciliation |
| Email fallback unavailable | preserve in-app notification |
| Quiet hours conflict | policy engine applies configured exception |
| Quanty unavailable | normal notification system continues |
| Preference service unavailable | fail closed for sensitive routing, safe defaults otherwise |

---

# 26. Performance and reliability

Measure:
- event-to-queued latency
- queued-to-sent latency
- delivery success rate
- duplicate rate
- notification fanout
- provider failure rate
- reconnect reconciliation time
- unread count correctness
- action latency.

Requirements:
- idempotent consumers
- bounded fanout
- partitioned event processing
- retry with backoff
- DLQ for poison events
- replay support
- projection rebuild support.

No production SLA claim without measured evidence.

---

# 27. Test matrix

Unit:
- priority
- grouping
- preferences
- focus rules
- privacy classification
- dedupe
- expiration

Integration:
- Chat message -> notification
- Meet invite/start -> notification
- Calendar event -> notification
- Mail -> notification
- Git review -> notification
- Drive share -> notification
- social/community event -> notification

Security:
- unauthorized action
- cross-tenant notification
- stale permission
- sensitive lock-screen leakage
- token leakage
- malicious deep link

Reliability:
- duplicate event
- out-of-order event
- provider outage
- retry/DLQ
- reconnect
- replay

Accessibility:
- keyboard
- screen reader
- mobile actions
- reduced motion
- high contrast

E2E:
- notification -> C02 message
- notification -> C08 Meet
- notification -> Calendar
- notification -> Git
- notification -> Drive
- Quanty triage -> evidence -> optional approved action.

---

# 28. Muse implementation sequence

C11-A: notification intent schema and domain model.
C11-B: event-spine consumer and durable notification projection.
C11-C: Notification Center + unread state.
C11-D: grouping/priority/preferences.
C11-E: push/WebSocket/desktop channel adapters.
C11-F: action/deep-link capability routing.
C11-G: privacy/focus/quiet hours.
C11-H: Quanty triage.
C11-I: delivery diagnostics and reliability.
C11-J: accessibility/security/performance hardening.

Muse must inspect existing notification/realtime code before each slice, reuse the event spine and capability registry, add tests, run affected validation, inspect runtime behavior and record remaining gaps.

---

# 29. C11 definition of done

C11 is complete only when:
- all notification surfaces have responsive platform contracts
- source products remain authoritative
- every intent is typed and traceable
- delivery is idempotent
- grouping/priority respect privacy
- actions require fresh authorization
- push payloads minimize sensitive content
- deletion/revocation propagates
- offline/reconnect behavior is correct
- Quanty cannot bypass notification permissions
- delivery diagnostics are honest
- accessibility/security/reliability are tested
- performance is measured
- no fake notification data is used.

## C11 architectural invariant

**QuantChat is the notification delivery operating layer, not the owner of the business events it delivers.**
