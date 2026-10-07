# QuantChat — API, Event & WebSocket Contract

**Status:** Target-state implementation contract  
**Scope:** Endpoint-level command/query, event, realtime, pagination, authorization, idempotency, E2EE and Quanty interfaces for C01–C13.

## 1. API laws

- REST/HTTP is the public command/query interface.
- Commands mutate state; queries read projections.
- Events announce completed transitions and are never used as client commands.
- Every mutation has an idempotency strategy.
- Every resource response includes a stable resource reference and version where applicable.
- Authorization is evaluated server-side on every protected request.
- Tenant/resource scope is never inferred from a client-provided display field.
- E2EE endpoints never require server access to plaintext.
- Realtime is an acceleration path; durable state remains recoverable through queries/cursors.

## 2. Authentication headers

Required for authenticated APIs:
Authorization: Bearer <short-lived access token>
X-Request-Id: client-generated request identifier
X-Client-Version: application version

Mutation requests additionally use:
Idempotency-Key: unique retry key

Server response metadata:
X-Correlation-Id
X-Trace-Id

Never accept authentication tokens in URLs.

## 3. Common response envelope

Success:
status
request_id
data
resource_version where applicable
next_cursor where applicable

Errors:
code
message
retryable
request_id
field_errors where applicable
policy_category where safe

Canonical errors:
AUTH_REQUIRED
AUTH_EXPIRED
STEP_UP_REQUIRED
CAPABILITY_DENIED
TENANT_MISMATCH
RESOURCE_NOT_FOUND
RESOURCE_REVOKED
VERSION_CONFLICT
IDEMPOTENCY_REPLAY
RATE_LIMITED
POLICY_RESTRICTED
VALIDATION_FAILED
DEPENDENCY_UNAVAILABLE
UNKNOWN_OUTCOME

Do not expose stack traces, internal SQL errors or policy internals.

## 4. Pagination contract

Cursor pagination is mandatory for high-volume resources.

Request:
limit
cursor
sort
filter

Rules:
- server owns cursor meaning
- cursor is opaque
- maximum page size is server-defined
- stable ordering uses a deterministic tie-breaker
- deleted/revoked records are filtered according to authorization
- clients must not manufacture cursors.

For timelines, ordering uses aggregate sequence plus stable ID rather than client clock.

## 5. C01 Inbox APIs

GET /api/v1/chat/inbox
GET /api/v1/chat/conversations/{conversationRef}
POST /api/v1/chat/conversations
PATCH /api/v1/chat/conversations/{conversationRef}
POST /api/v1/chat/conversations/{conversationRef}/archive
POST /api/v1/chat/conversations/{conversationRef}/mute
POST /api/v1/chat/conversations/{conversationRef}/pin
POST /api/v1/chat/conversations/{conversationRef}/read

Inbox query returns:
conversation ref, type, participant summary, last message projection, unread state, pin/mute/archive state, story summary and call/meeting summary.

## 6. C02/C03 message APIs

GET /api/v1/chat/conversations/{conversationRef}/messages
POST /api/v1/chat/conversations/{conversationRef}/messages
GET /api/v1/chat/messages/{messageRef}
PATCH /api/v1/chat/messages/{messageRef}
DELETE /api/v1/chat/messages/{messageRef}
POST /api/v1/chat/messages/{messageRef}/reactions
DELETE /api/v1/chat/messages/{messageRef}/reactions/{reaction}
POST /api/v1/chat/messages/{messageRef}/threads
GET /api/v1/chat/messages/{messageRef}/thread
POST /api/v1/chat/threads/{threadRef}/messages

Send response includes:
message_ref
accepted_at
server_sequence
state
version

The client_message_id enables safe retry without duplicate messages.

For E2EE, message body is an encrypted envelope. Server does not request plaintext.

## 7. Message upload APIs

POST /api/v1/chat/uploads
POST /api/v1/chat/uploads/{uploadRef}/complete
GET /api/v1/chat/uploads/{uploadRef}

Upload response provides a scoped upload reference and expiration. Object storage URLs are short-lived and never treated as permanent resource identity.

## 8. C04/C05 community/channel APIs

GET /api/v1/chat/communities
POST /api/v1/chat/communities
GET /api/v1/chat/communities/{communityRef}
PATCH /api/v1/chat/communities/{communityRef}
POST /api/v1/chat/communities/{communityRef}/members
DELETE /api/v1/chat/communities/{communityRef}/members/{subjectRef}

GET /api/v1/chat/communities/{communityRef}/channels
POST /api/v1/chat/communities/{communityRef}/channels
GET /api/v1/chat/channels/{channelRef}
PATCH /api/v1/chat/channels/{channelRef}

Permissions are evaluated against current membership and channel policy.

## 9. C06 camera/media APIs

POST /api/v1/chat/media/sessions
POST /api/v1/chat/media/{mediaRef}/publish
POST /api/v1/chat/stories
GET /api/v1/chat/stories/{storyRef}
DELETE /api/v1/chat/stories/{storyRef}
GET /api/v1/chat/spotlight
POST /api/v1/chat/spotlight
GET /api/v1/chat/lenses
POST /api/v1/chat/lenses/{lensRef}/use

Media publication is separate from upload. Moderation and audience policy are evaluated before publication.

## 10. C07 calls APIs

POST /api/v1/chat/calls/prepare
POST /api/v1/chat/calls
POST /api/v1/chat/calls/{callRef}/join
POST /api/v1/chat/calls/{callRef}/leave
POST /api/v1/chat/calls/{callRef}/end
POST /api/v1/chat/calls/{callRef}/screen-share
POST /api/v1/chat/calls/{callRef}/recording

Media signaling details are delivered through authorized realtime/WebRTC signaling channels, not ordinary REST polling.

## 11. C08 QuantMeet APIs

POST /api/v1/chat/meetings
GET /api/v1/chat/meetings/{meetingRef}
PATCH /api/v1/chat/meetings/{meetingRef}
POST /api/v1/chat/meetings/{meetingRef}/join
POST /api/v1/chat/meetings/{meetingRef}/leave
POST /api/v1/chat/meetings/{meetingRef}/participants
POST /api/v1/chat/meetings/{meetingRef}/breakouts
POST /api/v1/chat/meetings/{meetingRef}/recording
POST /api/v1/chat/meetings/{meetingRef}/artifacts

Calendar integration uses QuantResourceRef rather than duplicating Calendar rows.

## 12. C09 Search APIs

GET /api/v1/chat/search
POST /api/v1/chat/search/semantic
GET /api/v1/chat/search/suggestions

Search request contains query, filters, cursor and optional semantic mode.

Every result is re-authorized before return.

Search results expose resource references and snippets only within the caller's permitted boundary.

## 13. C10 Quanty APIs

POST /api/v1/chat/quanty/context
POST /api/v1/chat/quanty/plan
POST /api/v1/chat/quanty/approvals
POST /api/v1/chat/quanty/runs
GET /api/v1/chat/quanty/runs/{runRef}
POST /api/v1/chat/quanty/runs/{runRef}/cancel
GET /api/v1/chat/quanty/grants

A Quanty run references a governed capability rather than an arbitrary HTTP endpoint.

Tool execution lifecycle:
planned → approval_required → approved → executing → observed → verified → completed
or failed/cancelled.

Tier 3 requires confirmation by default. Tier 4 requires step-up and applicable approval policy.

## 14. C11 notification APIs

GET /api/v1/chat/notifications
POST /api/v1/chat/notifications/{notificationRef}/read
POST /api/v1/chat/notifications/read-all
GET /api/v1/chat/notification-preferences
PATCH /api/v1/chat/notification-preferences

Delivery providers remain behind the notification platform.

## 15. C12 settings/device APIs

GET /api/v1/chat/settings
GET /api/v1/chat/privacy
PATCH /api/v1/chat/privacy
GET /api/v1/chat/devices
GET /api/v1/chat/devices/{deviceRef}
POST /api/v1/chat/devices/{deviceRef}/verify
POST /api/v1/chat/devices/{deviceRef}/revoke
GET /api/v1/chat/sessions
POST /api/v1/chat/sessions/{sessionRef}/revoke
POST /api/v1/chat/sessions/revoke-all
GET /api/v1/chat/quanty/grants
POST /api/v1/chat/quanty/grants/{grantRef}/revoke
POST /api/v1/chat/data/export
POST /api/v1/chat/data/deletion
GET /api/v1/chat/data/deletion/{requestRef}

Security mutations require current authorization and step-up where policy demands it.

## 16. C13 admin APIs

GET /api/v1/chat/admin/overview
GET /api/v1/chat/admin/users
GET /api/v1/chat/admin/users/{userRef}
POST /api/v1/chat/admin/users/{userRef}/restrict
POST /api/v1/chat/admin/devices/{deviceRef}/revoke
GET /api/v1/chat/admin/communities
GET /api/v1/chat/admin/channels
GET /api/v1/chat/admin/moderation
POST /api/v1/chat/admin/moderation/{caseRef}/decision
GET /api/v1/chat/admin/appeals
POST /api/v1/chat/admin/appeals/{appealRef}/decision
GET /api/v1/chat/admin/meet/live
GET /api/v1/chat/admin/media/queue
POST /api/v1/chat/admin/media/{mediaRef}/quarantine
GET /api/v1/chat/admin/bots
POST /api/v1/chat/admin/bots/{botRef}/revoke
GET /api/v1/chat/admin/privacy/requests
POST /api/v1/chat/admin/privacy/requests/{requestRef}/action
GET /api/v1/chat/admin/config
PATCH /api/v1/chat/admin/config/{configKey}
GET /api/v1/chat/admin/flags
PATCH /api/v1/chat/admin/flags/{flagRef}
GET /api/v1/chat/admin/audit
GET /api/v1/chat/admin/incidents
POST /api/v1/chat/admin/incidents
GET /api/v1/chat/admin/health

Admin endpoints use separate capabilities and never inherit ordinary user privileges.

## 17. WebSocket connection

Endpoint:
wss://chat.example/connect

The hostname is deployment-specific; it is illustrative and must not be hard-coded into clients.

Connection flow:
1. authenticate
2. negotiate protocol version
3. establish connection id
4. subscribe to authorized channels
5. receive snapshot/cursor
6. receive events
7. acknowledge cursor
8. reconnect/resume after interruption.

Subscription request:
channel_type
resource_ref
cursor
client_subscription_id.

Server validates authorization before subscription.

## 18. WebSocket event envelope

Each event:
event_id
event_type
event_version
occurred_at
resource_ref
aggregate_version
sequence
payload
cursor
trace_id.

Client dedupes by event_id and detects gaps through sequence/cursor.

If a gap is detected:
pause local application of subsequent events
request cursor repair
apply missing events
resume.

## 19. Realtime channels

user.inbox
user.notifications
user.settings
conversation.{ref}
community.{ref}
channel.{ref}
call.{ref}
meeting.{ref}
admin.operations

Clients can only subscribe to resources authorized for the current subject.

Typing/presence channels use ephemeral TTL semantics and are never treated as durable facts.

## 20. Reconnect contract

On reconnect client sends:
last_event_cursor
client_instance_id
known_protocol_version.

Server returns:
resume accepted
or
resume rejected + authoritative snapshot/cursor.

A reconnect must not duplicate messages or actions.

## 21. E2EE boundary

For E2EE conversations:
- message body is ciphertext
- attachment encryption happens before object upload
- key exchange/session management remains client-side according to the selected protocol
- server may hold encrypted envelopes, routing metadata and delivery state
- server-side Quanty can only act on content when an explicitly authorized plaintext boundary exists
- notifications use privacy-preserving payloads unless the device can decrypt locally.

Search and moderation behavior must respect the conversation's cryptographic/privacy mode.

## 22. Authorization contract

Authorization inputs:
subject
tenant
resource
action
capability
membership
device/session
privacy policy
safety state
risk tier.

Possible decisions:
ALLOW
DENY
ALLOW_RESTRICTED
REQUIRE_STEP_UP
REQUIRE_APPROVAL.

Authorization is evaluated again when a delayed command reaches execution.

## 23. Idempotency contract

Required for:
send message
create conversation
create community/channel
start/end call where retried
meeting creation
media publication
Quanty side-effect tools
admin mutations
export/deletion requests.

If the same key is replayed with the same request hash, return the original result.

Different payload with same key returns IDEMPOTENCY_REPLAY conflict.

## 24. Versioning

URL major version:
v1.

Event version is independent:
event_type.v1.

Breaking API changes require v2 or an explicitly compatible migration.

Responses may add optional fields without breaking clients.

Deprecated fields have telemetry and a published removal date.

## 25. Rate limits

Rate limits are capability/resource aware.

Separate budgets for:
authentication
message sends
media upload
search
calls/meeting signaling
Quanty tools
admin operations.

A 429 response provides retry metadata without exposing internal capacity.

## 26. Quanty tool schema contract

Every tool has:
name
version
description
input_schema
output_schema
required_capability
risk_tier
resource_scope
approval_mode
timeout_ms
credit_policy
audit_event
verification
rollback.

Examples:
summarizeConversation — risk 1
prepareReply — risk 1
createMeeting — risk 3
sendMessage — risk 3
moderateCommunity — risk 4.

Quanty cannot dynamically invent a capability that is absent from the registry.

## 27. Cross-app handoff API

POST /api/v1/chat/handoffs

Input:
target_product
resource_refs
context_envelope
requested_action
expiry.

Server:
validates source authorization
filters context to minimum useful context
creates short-lived handoff capability when needed
records provenance
returns destination deep link.

Destination re-authorizes the resource/action.

## 28. Event catalog baseline

chat.conversation.created.v1
chat.conversation.updated.v1
chat.message.created.v1
chat.message.updated.v1
chat.message.deleted.v1
chat.message.receipt_updated.v1
chat.community.created.v1
chat.community.updated.v1
chat.channel.created.v1
chat.channel.updated.v1
chat.media.published.v1
chat.story.expired.v1
chat.call.state_changed.v1
chat.meeting.state_changed.v1
chat.meeting.recording_ready.v1
chat.search.projection_updated.v1
chat.notification.intent_created.v1
chat.privacy.changed.v1
chat.device.enrolled.v1
chat.device.revoked.v1
chat.quanty.run_changed.v1
chat.moderation.case_changed.v1
chat.appeal.changed.v1
chat.admin.action_completed.v1
chat.incident.changed.v1.

## 29. Testing contract

Contract tests:
request/response schema compatibility
authorization
idempotency
pagination
event schema
WebSocket protocol
reconnect/gap repair
E2EE boundary
Quanty capability enforcement
cross-app handoff authorization.

Load tests:
message burst
large community fanout
WebSocket reconnect storms
Meet signaling
search concurrency
notification spikes
admin moderation queues.

Security tests:
token leakage
CSRF where browser auth applies
IDOR
cross-tenant access
replay
stale capability
step-up bypass
WebSocket subscription escalation
prompt injection into Quanty
unsafe handoff context.

## 30. Muse implementation order

API-01 shared envelopes/errors/pagination.
API-02 conversation/inbox.
API-03 messaging/E2EE boundary.
API-04 communities/channels.
API-05 media/stories/Spotlight.
API-06 calls/QuantMeet.
API-07 search.
API-08 notifications/settings/devices.
API-09 Quanty tools/runs.
API-10 moderation/admin.
API-11 WebSocket/reconnect/gap repair.
API-12 cross-app handoffs.
API-13 contract/load/security validation.

## Architectural invariant

**HTTP commands change durable state, events announce facts, WebSocket accelerates projections, and every path re-checks authorization at the boundary where the action actually occurs.**
