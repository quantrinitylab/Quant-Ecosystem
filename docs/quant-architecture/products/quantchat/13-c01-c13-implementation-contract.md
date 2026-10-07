# QuantChat — C01–C13 Implementation Contract

Purpose: turn the completed screen architecture into a buildable contract for Muse/Codex and engineers.

Core rule: UI is a projection of domain state. Commands request transitions. Events announce completed transitions. Quanty operates only through governed capabilities.

## 1. Domain modules

conversation: 1:1/group lifecycle and membership projections.
message: messages, revisions, reactions, receipts and threads.
community: communities, spaces, channels, roles and permissions.
presence: online, typing, receipts and device presence.
media: uploads, edit graphs, stories, spotlight and lenses.
call: 1:1/group calls and live call state.
meeting: QuantMeet rooms, participants, breakouts and recordings.
search: authorized lexical and semantic projections.
notification: intents, preferences and routing.
settings: privacy and user policy preferences.
device: enrollment, sessions and trust.
moderation: reports, cases, enforcement and appeals.
admin: operational workflows, configuration and audit projections.
bot: bot identities, mini-apps and capability grants.
resource: ecosystem references and handoffs.

Platform dependencies: Identity/Auth, Authorization/Policy, Event/Outbox, Realtime, Search, Object Storage, Quanty Runtime, Memory, Trust/Safety, Credits/Ledger, Audit, Observability, Feature Flags, Media Transcoding and WebRTC/SFU.

## 2. Command/query/event law

Commands request state transitions:
CreateConversation, SendMessage, EditMessage, DeleteMessage, CreateCommunity, CreateChannel, StartCall, StartMeeting, PublishStory, PublishSpotlight, SubmitReport, UpdatePrivacyPolicy, EnrollDevice, RevokeDevice, GrantQuantyCapability, RevokeQuantyCapability, RequestDataExport, RequestDeletion, AdminModerationDecision and AdminConfigChange.

Queries read state:
GetInbox, GetConversation, ListMessages, GetCommunity, GetChannel, GetCall, GetMeeting, SearchChat, GetNotificationCenter, GetSettings, ListDevices and GetAdminOverview.

Events announce completed transitions:
chat.conversation.created.v1
chat.message.created.v1
chat.message.updated.v1
chat.message.deleted.v1
chat.community.updated.v1
chat.channel.updated.v1
chat.call.state_changed.v1
chat.meeting.state_changed.v1
chat.media.published.v1
chat.notification.intent_created.v1
chat.privacy.changed.v1
chat.device.revoked.v1
chat.moderation.case_changed.v1
chat.admin.action_completed.v1

Commands never masquerade as events.

## 3. Shared command envelope

Every command carries command_id, actor, tenant_id, capability, resource_ref, idempotency_key, expected_version when applicable, risk_tier, request_context, trace_id and created_at.

Authorization happens immediately before the state transition. Idempotency is enforced at the appropriate resource and actor scope.

## 4. Shared event envelope

Every event carries event_id, event_type, event_version, occurred_at, producer, tenant_id, aggregate_type, aggregate_id, aggregate_version, actor, resource_refs, correlation_id, causation_id, payload and provenance.

Never place passwords, private keys, authentication tokens or unnecessary E2EE plaintext in events.

## 5. C01 Inbox

Read model: ConversationSummaryProjection.

Includes conversation reference, participant summary, last-message projection, unread count, mute/pin/archive state, story summary, call/meeting summary, ranking signals and projection version.

Commands: ArchiveConversation, MuteConversation, PinConversation, MarkConversationRead.

Realtime subscription: tenant:user:inbox.

Reconnect uses cursor plus projection version.

## 6. C02/C03 Messaging

Entities:
Conversation, ConversationMember, Message, MessageRevision, MessageReaction, MessageReceipt, MessageAttachment, Thread and DisappearingPolicy.

Message state:
draft → queued → accepted → delivered → read.

Failure:
queued → failed → retry.

Terminal states include deleted, expired and moderation-restricted.

Server authorization is re-evaluated for send/edit/delete. Event arrival order is not trusted. Deletion uses tombstones.

## 7. C04/C05 Community and Channel

Canonical hierarchy:
Community → Space → Channel → Thread → Message.

Supporting entities:
Membership, Role, PermissionBinding, Invitation, Subscription and MeetingSpace.

Permission evaluation uses subject, membership, role, channel policy, platform safety and requested action. Client checks are never authoritative.

## 8. C06 Camera/Stories/Spotlight

Pipeline:
capture → local media session → EditGraph → moderation preflight → encrypted resumable upload → processing → publication command → event → audience projection.

Durable entities:
MediaAsset, EditGraph, Story, StoryItem, SpotlightPost, Lens and AvatarRig.

Ephemeral content has explicit expiry and deletion propagation.

## 9. C07/C08 Calls and QuantMeet

Call state:
preparing → ringing → connecting → active → reconnecting → ended.

Meeting state:
draft → scheduled → lobby → active → breakout → closing → ended → processing → ready.

Media state is separate from durable meeting state.

QuantChat owns meeting session state. QuantCalendar owns calendar events. QuantDrive owns durable recordings and artifacts. QuantMail owns invitation delivery.

## 10. C09 Search

Retrieval:
local cache → authorized QuantChat lexical index → ecosystem projections → semantic retrieval → Quanty reasoning.

Authorization applies at query time and result time.

Deleted/revoked resources leave projections according to the deletion SLA.

E2EE message search remains inside the explicitly authorized plaintext boundary.

## 11. C10 Quanty

Pipeline:
intent → context assembly → policy → capability resolution → plan → approval → execute → observe → verify → result → memory/audit.

Quanty receives capability projections, never database credentials.

Every tool declares input/output schema, risk, scope, capability, approval mode, timeout, cost, audit event, verification method and rollback behavior.

## 12. C11 Notifications

Pipeline:
producer → transactional outbox → notification intent → policy → dedupe/group → routing → delivery → receipt → diagnostics.

Delivery channels include WebSocket, APNs, FCM, Web Push, desktop OS and email digest/fallback.

C12 controls user preferences; C11 owns delivery behavior.

## 13. C12 Settings/Devices

Settings entities:
PrivacyPolicy, NotificationPreference, QuantyGrant, MemoryPolicy and ConnectedAppGrant.

Device entities:
Device, DeviceSession, DeviceVerification and DeviceTrustState.

Enrollment:
requested → authenticated → approved → provisioned → verified → active.

Revocation:
active → revoking → revoked.

Security mutations require fresh authorization and appropriate step-up.

## 14. C13 Admin

Admin entities:
AdminRole, AdminCapabilityGrant, ModerationCase, Appeal, FeatureFlag, ProductConfig, Incident and AuditEntry.

Admin action:
requested → authorized → approved → executing → completed/failed → verified.

Unknown outcomes reconcile before retry. Admin read models expose freshness.

## 15. Database boundary

Initial deployment may use PostgreSQL with strict domain schemas:
chat_conversation
chat_message
chat_community
chat_media
chat_call
chat_meeting
chat_search
chat_notification
chat_settings
chat_device
chat_moderation
chat_admin
chat_bot

Minimize cross-domain foreign keys. Prefer stable IDs and domain APIs/events. Do not create microservices merely for aesthetics.

## 16. Realtime

Client connects through the WebSocket gateway.

Flow:
domain command handler → transaction → outbox → event spine → projection → realtime publication.

Channels:
user inbox, conversation, community, channel, call, meeting, notification, settings/security and admin operations.

Every subscription is authorized and every event has dedupe identity.

## 17. Offline

Encrypted local store contains minimum useful cached state.

Operation queue stores operation id, command type, encrypted payload where required, dependency ids, retry count, state and last error.

Safe mutations may queue. Security-sensitive actions require connectivity and fresh authorization.

Conflict strategy: server truth plus version checks and deterministic reconciliation.

## 18. Cross-app handoff

Use QuantResourceRef plus QuantContextEnvelope and a short-lived handoff capability when action authorization is required.

Examples:
Chat to Calendar: conversation reference, meeting intent and participant references.
Chat to Drive: meeting reference and recording artifact reference.
Chat to Mail: meeting/invitation context and recipient references.
Chat to Git: conversation reference and approved project/resource reference.
Chat to Quanty: minimum useful context and explicit capability grant.

Never copy foreign database records into QuantChat merely for convenience.

## 19. API layers

Public API: typed REST command/query surface.
Realtime: WebSocket.
Internal calls: typed domain/module interfaces.
Events: Kafka/event spine.
Media: signed scoped object-storage operations.
Search: authorization-aware Meilisearch/Qdrant adapters.
AI: Quanty/model gateway through capability runtime.

## 20. Error contract

Every error has stable code, safe user message, retryability, field errors where relevant and correlation id.

Core codes:
AUTH_REQUIRED
STEP_UP_REQUIRED
CAPABILITY_DENIED
TENANT_MISMATCH
RESOURCE_REVOKED
VERSION_CONFLICT
IDEMPOTENCY_REPLAY
RATE_LIMITED
POLICY_RESTRICTED
DEPENDENCY_UNAVAILABLE
UNKNOWN_OUTCOME

Never expose stack traces or policy internals.

## 21. Observability

Every request carries trace id, correlation id, tenant id, actor class, service/module and version.

Track message acceptance latency, inbox projection lag, WebSocket health, call setup latency, meeting join success, SFU quality, search freshness, notification delivery, moderation queue age, Quanty verification success, privacy deletion lag and admin action latency.

Critical actions correlate audit records with traces.

## 22. Muse execution protocol

For every milestone Muse must:
1. inspect repository
2. identify owner/domain
3. inspect existing contracts
4. define schema/state machine
5. implement backend command/query
6. implement event/outbox
7. implement projection
8. implement realtime
9. implement client state
10. implement Mobile/Web/Tauri/Capacitor UI
11. implement Quanty placement where applicable
12. implement security/privacy
13. implement failure states
14. add unit/integration/E2E tests
15. run affected validation
16. record evidence
17. commit.

Never create fake APIs or placeholder success paths.

## 23. Build waves

Wave 1: identity, authorization, database modules, event/outbox, realtime and resource references.
Wave 2: messaging and offline/E2EE boundary.
Wave 3: communities, channels, camera and social.
Wave 4: calls, QuantMeet, WebRTC/SFU.
Wave 5: search and Quanty.
Wave 6: notifications and settings/devices.
Wave 7: moderation and admin operations.
Wave 8: cross-app hardening with QuantMail, QuantCalendar, QuantDrive, QuantContacts, QuantGit and QuantTrinity.

## 24. Implementation-ready definition

Every C01–C13 screen must have an owning domain, canonical entities, commands, queries, events, state machines, authorization policy, risk classification, realtime channel, offline behavior, failure states, accessibility contract, Mobile/Web/Tauri/Capacitor UX, Quanty placement, cross-app handoffs, tests, observability and rollout strategy.

## Architectural invariant

Build the domain transition first and project it into every platform second. Never build a screen whose backend ownership, authorization, state transition and event contract are undefined.
