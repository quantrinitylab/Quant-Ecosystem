# QuantChat — Notification, Presence & Social Graph Architecture

Status: Target-state architecture
Scope: C11 Notifications + realtime presence + relationship graph + cross-app notification orchestration.

## 1. System thesis
QuantChat is the realtime human-connection layer for the ecosystem.
It unifies WhatsApp-style direct messaging/presence, Telegram-style channels, Discord-style communities, Snapchat-style stories/ephemeral signals, QuantMeet calls and meetings, and ecosystem-wide notifications.

The system is one graph, but not one ownership database.
Relationship truth stays with its owning domain. Notification delivery is a projection. Presence is ephemeral. Social affinity is derived and policy-bound.

## 2. Three separate planes
### Social graph
Durable relationships: contact, friend, follow, follower, block, mute, restrict, community membership, channel membership, role and relationship preferences.
### Presence plane
Ephemeral: online, offline, last-seen policy, typing, recording/call state, active device and active meeting.
### Notification plane
Derived: notification intent, priority, grouping, delivery, receipt and action.
Never collapse these three into one table.

## 3. Ownership
QuantMail/platform identity owns canonical identity.
QuantContacts owns contact/person truth.
QuantChat owns conversations, messaging relationships, communities, channels, call/meeting presence and Chat notification projection.
QuantGram/QuantWave/QuantMax/etc. own their product relationships and events.
QuantTrinity owns economy.
A shared social graph package provides canonical contracts and projections, not unrestricted cross-product database access.

## 4. Relationship types
Core edge types: CONTACT, FRIEND, FOLLOW, FOLLOWER, BLOCK, MUTE, RESTRICT, COMMUNITY_MEMBER, CHANNEL_MEMBER, ROLE_MEMBER, CLOSE_FRIEND, FAVORITE, COLLABORATOR.
Each edge has source subject, target subject/resource, owner product, state, visibility, created_at, updated_at, version, provenance and optional expiry.
A product may create an edge only through its authorized domain command.

## 5. Relationship state machine
none → requested → accepted → active
Alternative states: blocked, muted, restricted, removed.
Block has precedence over discovery, messaging, calling and recommendation unless an explicit safety/legal policy says otherwise.
Mute affects presentation, not relationship existence. Restrict reduces interaction visibility without pretending the relationship does not exist.

## 6. Contact vs social graph
A phone/email contact is not automatically a friend/follow.
Contact matching may create a candidate edge, but requires product policy and user controls before social visibility.
Do not expose contact-book data to recommendation models by default.

## 7. Presence architecture
Presence is an ephemeral distributed state.
Client heartbeat → ws-gateway → presence projector → Redis TTL → authorized subscribers.
Presence states: online, idle, offline, in_call, in_meeting, recording, do_not_disturb.
Only expose states permitted by the user's privacy policy.

## 8. Presence privacy
User controls: everyone, contacts, friends, selected people, nobody.
Separate controls: online status, last seen, typing, read receipts, active call/meeting indicator.
A user can disable last-seen while remaining online.
The system must not infer hidden presence from notification timing or search suggestions.

## 9. Presence TTL
Presence records expire automatically.
heartbeat → TTL refresh → missed heartbeat → grace period → offline.
A crashed app must not leave a user permanently online.
Presence is never reconstructed as durable historical truth from Redis alone.

## 10. Multi-device presence
Account presence is an aggregation of authorized devices.
Device states: active, idle, disconnected, background.
Aggregation rules are policy-defined. Do not expose device-level identifiers to ordinary users.

## 11. Typing indicators
Typing is ephemeral, scoped to conversation/channel, TTL-limited, rate-limited, not persisted and not replayed after reconnect.
Typing events never enter the durable Kafka event catalog as ordinary business facts.

## 12. Read receipts
Read state is durable user preference/state.
conversation/message sequence → device observation → server monotonic cursor → receipt projection.
Multiple devices converge to the highest valid read cursor.
Privacy policy controls whether other participants receive read receipts.

## 13. Last-seen semantics
Last-seen timestamp is a privacy-controlled projection.
Do not expose exact device, IP, location or internal heartbeat timestamps.
If privacy blocks exact time, UI may show no last-seen value rather than a misleading approximation.

## 14. Social graph storage
PostgreSQL: authoritative relationship commands/state, membership, block/mute/restrict, policy, version and provenance.
Redis: hot relationship checks, ephemeral graph cache and rate limits.
Graph/vector infrastructure: derived affinity candidates, recommendation traversal and discovery projections.
The graph projection must be rebuildable from authoritative relationship events.

## 15. Social graph events
Examples: social.relationship.requested.v1, social.relationship.accepted.v1, social.relationship.removed.v1, social.follow.created.v1, social.follow.removed.v1, social.block.created.v1, social.block.removed.v1, social.mute.changed.v1, social.restrict.changed.v1, social.membership.changed.v1.
Consumers: notification projector, discovery indexer, recommendation projector, search projection and safety systems.

## 16. Notification architecture
Canonical pipeline:
source domain event → notification intent → policy evaluation → privacy classification → dedupe → grouping → priority → channel routing → delivery → receipt → user action → source-domain command.
C11 does not become the source of truth for the action.

## 17. Notification identity
Every notification has stable notification_id, source_event_id, source_resource_ref, recipient, event type/version, privacy class, dedupe key, grouping key, expiry and provenance.
A single notification may be delivered through several channels without creating separate notification identities.

## 18. Notification deduplication
One message delivered through push, desktop and in-app remains one notification.
Dedupe keys incorporate recipient, source resource, event family and source event identity.
Retries reuse delivery identity.

## 19. Notification grouping
Grouping dimensions: source product, resource, event family, recipient, privacy scope and time window.
Examples: 8 messages in a conversation; 4 mentions in a channel; 3 Git reviews; 2 meeting reminders.
Do not group across incompatible privacy scopes.

## 20. Priority engine
Priority is determined by policy, not just producer hints.
Signals: direct mention, direct message, meeting start, deadline, user-defined favorite, severity, source importance, quiet hours, current focus mode and relationship context.
Classes: P0 critical, P1 time-sensitive, P2 important, P3 normal, P4 background.
A producer cannot force P0 merely by setting a field.

## 21. Notification routing
Channel adapters: WebSocket/in-app, APNs, FCM, Web Push, Tauri/OS notifications, email fallback and digest.
Routing checks device registration, permission, focus mode, privacy, channel preference, source policy and delivery health.
Email is fallback only when explicitly enabled.

## 22. Lock-screen privacy
Notification content is classified as normal, private, sensitive or highly_sensitive.
Device/user policy determines full text, sender only, generic alert or hidden.
Push payloads carry the minimum necessary content.
For E2EE messages, prefer wake-up metadata and local decryption rather than server plaintext.

## 23. Notification action security
A notification is not a credential.
Click/action → authenticate → resolve resource → reauthorize → execute originating domain command.
If authorization expired, reopen the source and require fresh authorization.
Deep links contain opaque resource references, never bearer tokens.

## 24. Cross-app notification surface
QuantChat may present events from QuantMail, QuantCalendar, QuantDrive, QuantGit, QuantGram, QuantWave, QuantMax, QuantCooks, QuanTube and QuantAds.
Each notification points to the owning product.
Examples: Git review → QuantGit; calendar start → QuantCalendar/QuantChat Meet; mail received → QuantMail; Drive share → QuantDrive; Gram interaction → QuantGram.
Opening a notification never transfers source ownership.

## 25. Notification delivery state
created → queued → sending → sent → delivered where measurable → opened → actioned.
Failure: retrying → failed or expired.
Do not claim OS display if the provider cannot confirm it.

## 26. Quiet hours and focus
Focus profile: name, schedule, timezone, allowed people, allowed products, allowed event types, minimum priority, device scope and exceptions.
Examples: Sleep, Study, Deep Work, Meeting, Travel.
The system must not silently create permanent focus profiles from behavioral inference.

## 27. Social affinity
Affinity is derived, not canonical identity.
Signals may include mutual interactions, conversation frequency, explicit follows, shared communities, recent collaboration and user-declared favorites.
Signals must have source, timestamp, decay and privacy eligibility.
Sensitive traits must not be inferred or used as hidden relationship labels.

## 28. Affinity decay
Affinity decays over time. New interaction signals update a bounded score; time decay prevents stale relationships from becoming permanent.
The score is for ordering, discovery, recommendation and notification prioritization. It is not a permanent statement about how much a user cares about another person.

## 29. Recommendation boundary
Social graph signals can generate candidates. They cannot bypass block, mute/restrict, privacy, age/safety policy or tenant boundaries.
Candidate generation must happen inside a permitted graph view. Final result authorization happens again.

## 30. Stories and ephemeral social
Story events: published → eligible audience → viewed → reacted/replied → expired.
Expiry is a server policy transition.
Viewer events may update creator-facing analytics and ranking projections but must not expose hidden viewers beyond policy.
Ephemeral media metadata and durable media bytes have separate retention rules.

## 31. Community notification model
Community events include mention, reply, role assignment, announcement, moderation action, event start, stage invitation and channel activity.
Channel-level defaults can override global defaults only within allowed policy.
Moderation notifications must not leak reporter identity or private evidence.

## 32. Calls and Meet notifications
Examples: incoming call, missed call, meeting invite, waiting room, participant admission request, meeting starting, recording ready, recap ready and action-item reminder.
Call/Meet actions reauthorize against current session state.
A stale Join notification must resolve current room state before admitting the user.

## 33. Cross-app action orchestration
Calendar remains schedule truth for meeting reminders.
For a reminder, Calendar event → notification intent → C11 policy → Chat push/in-app → join action → C08 authorization.
For an instruction to tell everyone a meeting is starting, Quanty proposes resolving participants, drafting a message, requesting approval and sending through QuantChat.
No notification service directly sends a Chat message.

## 34. Quanty notification assistant
Quanty can summarize, prioritize, explain why, group, draft responses and suggest actions.
Quanty cannot silently mark important notifications read, mute sources, delete notifications or approve/send actions.
Every generated recommendation references underlying notifications/resources.

## 35. Realtime fanout architecture
Source event → Kafka partition → notification projector → policy engine → durable intent → fanout workers → channel adapters.
Presence: client → regional ws-gateway → Redis TTL → authorized subscriber fanout.
Do not send all graph changes to all connected users.
Fanout is scoped by recipient, resource, membership, subscription and privacy.

## 36. Hot-path optimization
For high-volume events: partition by recipient/resource, coalesce compatible events, batch low-priority notifications, avoid N×M fanout, cache authorization decisions briefly with invalidation, use bounded queues and backpressure providers.
P0/P1 delivery must not be starved by bulk digest work.

## 37. Data model additions
Notification domain: notification, notification_intent, notification_group, notification_delivery, notification_receipt, notification_preference, focus_profile, notification_device, notification_action, notification_snooze, notification_mute.
Social domain: relationship_edge, relationship_policy, social_membership_ref, affinity_signal, affinity_projection.
Presence: presence_session, presence_subscription, typing_session.
Durable source data remains in owning schemas.

## 38. API
Social: POST /api/v1/chat/social/relationships; PATCH /api/v1/chat/social/relationships/{ref}; DELETE /api/v1/chat/social/relationships/{ref}; GET /api/v1/chat/social/people/{ref}; GET /api/v1/chat/social/graph.
Presence: GET /api/v1/chat/presence/{subjectRef}; PATCH /api/v1/chat/presence/privacy.
Notifications: GET /api/v1/chat/notifications; GET /api/v1/chat/notifications/{ref}; POST /api/v1/chat/notifications/{ref}/read; POST /api/v1/chat/notifications/{ref}/snooze; POST /api/v1/chat/notifications/{ref}/action; PATCH /api/v1/chat/notification-preferences.
These are commands/queries over authorized domains, not direct database access.

## 39. WebSocket channels
Authorized channels: user.presence, user.notifications, conversation.{ref}, community.{ref}, channel.{ref}, meeting.{ref}.
Presence and typing use TTL semantics. Notification cursor uses durable event reconciliation.

## 40. Platform behavior
Mobile/Capacitor: native push categories, haptics, call integration, badge synchronization, lock-screen privacy and battery-aware presence.
Web: browser push, in-app notification center, permission fallback, presence indicator and keyboard navigation.
Tauri: native OS notifications, tray presence, global shortcuts and background connection recovery.
All platforms use identical policy/capability semantics.

## 41. Accessibility
Presence is not conveyed by color alone. Screen-reader labels expose online/busy states. Notification priority is textual. Keyboard notification navigation, deep-link focus management, reduced motion, high contrast and touch-safe actions are required.

## 42. Reliability
Every critical path has timeout, bounded retry, jittered backoff, idempotency, dead-letter handling, replay and observability.
Metrics: event-to-intent latency, intent-to-delivery latency, delivery success, duplicate rate, fanout backlog, provider failures, presence freshness, notification cursor lag and preference evaluation latency.
Trace: source event → intent → policy → fanout → provider → receipt.

## 43. Security
Threats: notification spoofing, malicious deep links, stale authorization, cross-tenant fanout, presence enumeration, contact-book leakage, block bypass, lock-screen leakage, replayed notification action and forged relationship edge.
Controls: validated source events, fresh authorization, opaque refs, TTL presence, privacy filters, idempotency, tenant isolation and privileged-operation audit.

## 44. Implementation sequence
SOCIAL-01 relationship edge contract.
SOCIAL-02 block/mute/restrict enforcement.
SOCIAL-03 social graph projection.
SOCIAL-04 presence gateway + TTL.
SOCIAL-05 multi-device presence.
SOCIAL-06 notification intent contract.
SOCIAL-07 durable notification projection.
SOCIAL-08 policy/priority/grouping.
SOCIAL-09 push/Web/In-app/Tauri adapters.
SOCIAL-10 focus/quiet-hours/privacy.
SOCIAL-11 cross-app notification federation.
SOCIAL-12 affinity signals/decay.
SOCIAL-13 recommendation integration.
SOCIAL-14 Quanty notification triage.
SOCIAL-15 chaos/security/accessibility validation.

## 45. Architectural invariant
The graph determines permitted relationships, presence describes ephemeral availability, and notifications communicate derived events. None of the three may silently become the source of truth for another.