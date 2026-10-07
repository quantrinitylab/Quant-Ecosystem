# QuantChat — Deep Product Architecture

**Status:** Target-state architecture / execution contract  
**Product ID:** `quantchat`  
**Role:** Real-time communication domain of the Quant Ecosystem  
**Architecture law:** QuantChat owns communication state. It may consume other product projections through typed ecosystem contracts, but it never becomes the source of truth for another product.

---

## 0. Why this document exists

This document is an implementation-grade architecture contract for Muse and human engineers.

QuantChat is not a chat screen attached to the ecosystem shell. It is a complete communication platform intended to compete with WhatsApp, Telegram, Discord, Snapchat messaging, Slack-style communities and integrated meeting products.

Muse MUST read this document together with:

- `docs/quant-architecture/03-product-boundaries-and-domains.md`
- `docs/quant-architecture/05-data-and-event-architecture.md`
- `docs/quant-architecture/06-ai-quanty-platform.md`
- `docs/quant-architecture/07-algorithm-platform.md`
- `docs/quant-architecture/08-identity-security-trust.md`
- `docs/quant-architecture/09-economy-billing.md`
- `docs/quant-architecture/20-ecosystem-cross-app-connection-contract.md`
- `docs/quant-architecture/21-ecosystem-app-capability-registry.md`
- `docs/quant-architecture/22-ecosystem-cross-app-resource-and-context-contract.md`
- `docs/quant-architecture/23-event-spine-and-integration-runtime.md`

Do not implement isolated features from this document without first checking those shared contracts.

---

# 1. Product thesis

QuantChat is the ecosystem's **real-time communication operating layer**.

It combines:

- private 1:1 messaging
- group messaging
- communities
- channels
- threads
- disappearing/ephemeral communication
- voice calls
- video calls
- meeting rooms
- screen sharing
- file/media sharing
- reactions and rich messages
- presence
- notification delivery
- bots and integrations
- Quanty-assisted communication
- ecosystem notifications
- creator/community monetization
- moderation and trust systems

The differentiator is not "more chat features."

The differentiator is:

> **Every conversation can become a governed action surface for the rest of the Quant Ecosystem without allowing QuantChat to own data it does not own.**

Examples:

- A Calendar event can be shared into a conversation as a live resource card.
- A QuantMail thread can be attached to a chat without copying the mailbox source of truth.
- A Drive file can be shared with permission-aware preview and revocation.
- QuantGit PR state can appear as a projection in a developer conversation.
- Quanty can summarize a conversation using only authorized context.
- Quanty can prepare a reply, but sending remains a typed capability subject to policy.
- A QuantChat notification can be generated from any ecosystem event.
- A meeting can transition from chat → call → calendar event → Drive meeting space.

---

# 2. Non-negotiable ownership

## 2.1 QuantChat owns

QuantChat is authoritative for:

- conversations
- conversation membership
- direct-message relationships as communication state
- messages
- message revisions where supported
- reactions
- replies/threads
- pins
- saved-message references
- channel configuration
- community configuration
- roles inside QuantChat communities/channels
- chat-specific presence state
- delivery state
- read state
- typing state
- call/session state
- call participants
- call quality telemetry
- chat attachments as message attachments
- ephemeral-message policy/state
- chat moderation actions
- chat reports
- bot/integration installation state
- chat-specific notification preferences
- chat-specific encryption/session metadata

## 2.2 QuantChat does NOT own

It must not become authoritative for:

- user identity → Identity platform
- canonical contacts/person identity → Contacts domain
- calendar events → Calendar domain
- email messages → QuantMail domain
- Drive files → QuantDrive
- Git repositories/PRs/issues → QuantGit
- creator posts → QuantGram/QuanTube/etc.
- advertising campaigns → QuantAds
- wallet/credit ledger → QuantTrinity/economy
- durable cross-ecosystem memory → governed QuantDrive Memory layer

A chat message may reference these resources, but the resource remains authoritative in its owning domain.

---

# 3. Product surfaces

QuantChat consists of these major surfaces:

1. Inbox / conversations
2. Conversation detail
3. Message composer
4. Thread view
5. Contact/person context
6. Search
7. Media/files shared view
8. Communities
9. Channels
10. Channel discovery
11. Voice/video call surface
12. Meeting room
13. Call history
14. Notification center
15. Saved messages
16. Mentions
17. Requests / unknown senders
18. Safety center
19. Quanty assistant
20. Chat settings
21. Privacy/security
22. Device/session management
23. Community admin
24. Channel admin
25. Bot/integration management
26. Creator/community economy
27. Ecosystem resource previews
28. Mobile-specific conversation controls
29. Desktop multi-pane workspace
30. Admin operations console

No surface is considered complete merely because its route renders.

Every surface requires loading, empty, error, permission-denied, offline/degraded and success states.

---

# 4. Information architecture

## 4.1 Desktop

Primary layout:

```
┌────────────────────────────────────────────────────────────┐
│ Quant global header / search / Quanty / account            │
├───────────────┬──────────────────────┬─────────────────────┤
│ Chat nav      │ Conversation list    │ Conversation         │
│               │                      │                     │
│ Inbox         │ pinned               │ messages            │
│ Favorites     │ recent               │ replies             │
│ Requests      │ unread               │ composer            │
│ Communities   │ muted                │ attachments         │
│ Channels      │                      │                     │
│ Calls         │                      │                     │
│ Saved         │                      │                     │
│               │                      │                     │
├───────────────┴──────────────────────┴─────────────────────┤
│ contextual status / connection / call state                 │
└────────────────────────────────────────────────────────────┘
```

Desktop must support:

- keyboard-first navigation
- split panes
- conversation pop-out
- multi-window calls
- drag/drop attachments
- command palette
- global search
- conversation-specific search
- thread side panel
- profile/context side panel
- live call controls

## 4.2 Mobile

Mobile is not a shrunken desktop.

Primary navigation:

- Chats
- Communities
- Calls
- Notifications
- Quanty/profile

Conversation navigation:

- back
- title/presence
- search
- call buttons
- more/actions

Composer must be optimized for thumb interaction and variable keyboard heights.

---

# 5. Core domain model

## 5.1 Identity references

`User` is resolved from shared identity.

QuantChat stores:

- `user_id`
- display snapshot where required for low-latency rendering
- snapshot version
- avatar reference
- policy-scoped profile metadata

The snapshot is a projection, not the canonical identity record.

## 5.2 Conversation

Core fields:

- id
- tenant_id
- type
- title
- avatar/media reference
- created_by
- created_at
- updated_at
- current_version
- encryption_mode
- retention_policy
- disappearing_policy
- discoverability
- moderation_policy
- archived_at
- deleted_at

Types:

- direct
- group
- channel
- community
- announcement
- support
- bot
- meeting
- system

## 5.3 Membership

Fields:

- conversation_id
- principal_id
- role
- status
- joined_at
- left_at
- mute state
- notification mode
- permissions version
- last_read_cursor
- last_delivered_cursor
- moderation state

Roles must be capability based, not a hard-coded "admin=true" shortcut.

## 5.4 Message

A message is an immutable communication fact with controlled mutable metadata.

Core:

- message_id
- conversation_id
- sender_principal
- client_message_id
- sequence/cursor
- created_at
- edited_at
- deleted_at
- message_type
- body representation
- reply_to
- thread_root
- mentions
- attachments
- resource_refs
- reaction summary
- moderation state
- encryption metadata
- visibility state
- expiration policy
- version

Message types include:

- text
- rich_text
- image
- video
- audio
- file
- voice_note
- location
- contact_card
- poll
- event_card
- file_card
- repository_card
- link_preview
- system
- call_event
- payment/economy event
- bot result
- Quanty proposal

## 5.5 Message lifecycle

```
CLIENT_CREATED
  ↓
ACCEPTED
  ↓
PERSISTED
  ↓
EVENT_PUBLISHED
  ↓
DELIVERING
  ↓
DELIVERED
  ↓
READ
```

Failure paths:

```
ACCEPTED → RETRYING → DELIVERED
ACCEPTED → REJECTED
PERSISTED → MODERATION_HOLD
PERSISTED → DELETED
```

A client must never infer server truth solely from a local optimistic state.

---

# 6. Message ordering and consistency

QuantChat must not require globally ordered messages.

Ordering guarantee:

- total ordering per conversation partition where feasible
- stable server sequence/cursor
- client message IDs for idempotency
- server timestamp for authoritative ordering
- causality metadata for edits/replies when required

A message send request must be safe to retry.

Duplicate `client_message_id` + same sender + conversation must return the original accepted result rather than creating a second message.

Edits and deletes must use version checks.

---

# 7. Conversation state machine

Conversation lifecycle:

```
CREATING
  ↓
ACTIVE
  ↓
ARCHIVED
  ↓
DELETED / RETENTION_PURGED
```

Membership:

```
INVITED → PENDING → ACTIVE
                   ↓
              LEFT / REMOVED
```

Moderation:

```
NORMAL
 ↓
FLAGGED
 ↓
LIMITED / QUARANTINED
 ↓
RESOLVED / REMOVED
```

No state transition may bypass authorization and audit.

---

# 8. Realtime architecture

QuantChat requires a dedicated realtime architecture.

```
Client
  ↓
Edge / auth
  ↓
WebSocket gateway
  ↓
session registry
  ↓
conversation fanout service
  ↓
durable message service
  ↓
event spine
  ├── notifications
  ├── search
  ├── moderation
  ├── analytics
  ├── memory projection
  └── ecosystem integrations
```

Realtime channels:

- conversation events
- presence
- typing
- delivery/read receipts
- reactions
- call signaling
- moderation state
- live channel events

Ephemeral events such as typing must not be treated as durable domain events.

Durable message events must be replayable.

---

# 9. WebSocket gateway design

Gateway responsibilities:

- authentication
- connection lifecycle
- device/session registration
- subscription authorization
- heartbeat
- backpressure
- fanout
- reconnect cursors
- rate limits
- connection metrics

Gateway must NOT own business truth.

It should route events to/from domain services.

Client reconnect:

```
connect
 ↓
authenticate
 ↓
negotiate protocol version
 ↓
restore subscriptions
 ↓
send last-known cursors
 ↓
server calculates gap
 ↓
replay missing durable events
 ↓
resume realtime stream
```

If the gap is too large, client receives a sync-required response and performs bounded resource synchronization.

---

# 10. Offline and multi-device sync

QuantChat must work during intermittent connectivity.

Client maintains:

- local conversation cache
- outbound mutation queue
- message optimistic state
- server cursor
- attachment upload state
- retry metadata

Every mutation has:

- operation ID
- client timestamp
- client device ID
- idempotency key
- target resource/version
- operation type

Conflict strategy:

- messages: append-only
- reactions: set-like/idempotent
- read cursor: monotonic max
- edits: version checked
- conversation settings: optimistic concurrency
- membership/admin actions: server authoritative

Never resolve security-sensitive conflicts with "last write wins."

---

# 11. Calls and meeting architecture

Voice/video is a separate media plane.

```
QuantChat
  │
  ├── signaling
  │
  └── Call session
        ↓
      WebRTC
        ↓
   STUN/TURN
        ↓
  SFU for multiparty
```

Call domain owns:

- call ID
- room/session ID
- participants
- device tracks
- mute/camera state
- join/leave state
- recording consent state
- quality metrics
- moderation controls

Media bytes must not travel through the ordinary message service.

For multiparty calls, prefer SFU architecture.

Recording requires explicit policy and consent state and produces an owned resource reference rather than silently embedding a large binary into a call row.

---

# 12. Communities and channels

Community hierarchy:

```
Community
 ├── roles
 ├── members
 ├── channels
 │    ├── text
 │    ├── announcement
 │    ├── forum
 │    └── voice
 ├── moderation policy
 ├── discovery policy
 └── integrations
```

Channel permissions are capability sets:

- view
- post
- reply
- react
- attach
- mention
- invite
- moderate
- pin
- manage_channel
- manage_members
- manage_integrations

A channel permission cannot automatically grant organization-wide permissions.

---

# 13. Threads

Threads are first-class message projections.

A thread has:

- root message
- reply count
- participants
- latest reply cursor
- unread state
- resolved/open state
- optional summary
- moderation state

Thread replies remain messages owned by QuantChat.

Thread summary generated by Quanty is derived and must be clearly distinguishable from canonical messages.

---

# 14. Search architecture

QuantChat search supports:

### Exact

- sender
- conversation
- date
- message type
- attachment
- mention
- channel
- unread
- reaction
- thread

### Lexical

- message text
- names
- channel names
- attachment metadata

### Semantic

- meaning-based message retrieval
- conversation summaries
- related discussions

### Graph

- person ↔ conversation
- person ↔ community
- project ↔ conversation
- resource ↔ message

Pipeline:

```
query
 ↓
intent/parser
 ↓
authorization scope
 ↓
lexical + semantic + graph retrieval
 ↓
ACL filter
 ↓
ranking
 ↓
dedupe
 ↓
result/resource refs
```

Authorization must happen before model-visible retrieval.

Search indexes are projections and rebuildable.

---

# 15. Ranking and discovery

QuantChat ranking applies to:

- conversation ordering
- unread prioritization
- channel discovery
- community discovery
- search ranking
- suggested contacts
- suggested conversations
- notification prioritization

Ranking signals may include:

- recency
- interaction frequency
- explicit pin/favorite
- unread age
- reply likelihood
- relationship strength
- channel relevance
- user-selected preferences
- current task context
- temporary session context

Do not store sensitive inferred states such as "user is depressed" as durable ranking facts.

Temporary context may influence ranking only under policy and retention limits.

Ranking must support:

- explanation
- feature version
- experiment ID
- model version
- opt-out where required
- abuse resistance

---

# 16. Quanty integration

Quanty is a capability consumer, not a privileged database reader.

QuantChat exposes typed capabilities such as:

- search_messages
- get_conversation
- summarize_conversation
- prepare_reply
- create_draft_message
- send_message
- create_group
- invite_member
- schedule_call
- start_call
- find_shared_resource
- attach_drive_file
- attach_calendar_event
- search_channel
- moderate_message
- report_message

Risk tiers follow the ecosystem capability registry.

Read-only:

- search
- summarize
- retrieve conversation context

Draft:

- prepare reply
- prepare announcement

Side effect:

- send
- invite
- create channel
- delete message

High-risk:

- destructive moderation
- financial actions
- organization-wide configuration

Quanty must receive the minimum useful context.

Example:

"Reply to Rahul that I can meet tomorrow at 5."

Quanty should resolve:

1. Rahul via Contacts/identity
2. current conversation
3. user calendar availability if necessary
4. communication policy

It should not receive the entire mailbox, entire calendar and entire Drive.

---

# 17. Quanty communication workflow

```
User intent
 ↓
Quanty intent router
 ↓
Capability discovery
 ↓
Context planning
 ↓
Policy evaluation
 ↓
Draft plan
 ↓
approval if required
 ↓
QuantChat capability
 ↓
message persistence
 ↓
event verification
 ↓
audit
 ↓
user result
```

For "send" operations, success is not "API returned 200."

Success requires durable message acceptance and verified event state.

---

# 18. Memory architecture

QuantChat contributes signals to the governed memory system.

Potential derived memories:

- communication preferences
- explicit relationship facts
- project context mentioned repeatedly
- user-approved conversational preferences
- recurring communication patterns

Never automatically promote every message into durable memory.

Memory extraction pipeline:

```
message/event
 ↓
eligibility policy
 ↓
candidate extraction
 ↓
entity resolution
 ↓
confidence
 ↓
sensitivity classification
 ↓
user/product policy
 ↓
candidate memory
 ↓
consolidation
 ↓
governed memory
```

Source message remains authoritative.

Deleting/forgetting a message must trigger the applicable memory invalidation/re-evaluation path.

---

# 19. Ecosystem resource cards

QuantChat uses `QuantResourceRef`.

Examples:

- Mail thread
- Calendar event
- Drive file
- Git PR
- QuantGram post
- QuanTube video
- QuantMax match/profile
- QuantCooks project
- QuantAds campaign

A resource card stores reference metadata, not duplicated authoritative state.

Rendering:

```
resource_ref
 ↓
authorization
 ↓
resource resolver
 ↓
current projection
 ↓
card renderer
```

If the owner product is unavailable, display a truthful degraded state.

Never show stale data as current without a timestamp/version.

---

# 20. Notification architecture

QuantChat is the ecosystem's primary human notification delivery surface.

Other products emit notification intents through the shared event/notification contracts.

QuantChat decides:

- delivery channel
- grouping
- priority
- mute policy
- notification timing
- conversation destination

It does not reinterpret domain truth.

Example:

QuantGit emits:

`quantgit.pull_request.review_requested`

Notification projection:

`QuantChat → notification → "PR #42 needs your review"`

The PR remains authoritative in QuantGit.

---

# 21. Moderation and safety

Moderation is multi-layered:

### Layer 1 — client safety

- block
- mute
- report
- privacy controls

### Layer 2 — ingestion

- spam detection
- malware scanning
- rate limits
- abuse heuristics

### Layer 3 — content safety

- text classification
- image/video moderation
- phishing detection
- malicious-link detection

### Layer 4 — behavioral safety

- mass messaging
- account automation
- coordinated abuse
- community raids
- suspicious invitation patterns

### Layer 5 — human/admin review

- evidence
- action history
- appeal
- escalation
- audit

Models/rules must be versioned.

Moderation decisions need reason codes and evidence references.

---

# 22. Encryption and privacy

QuantChat should support multiple security modes rather than pretending every feature can operate identically under end-to-end encryption.

Modes:

1. Standard server-side protected messaging
2. E2EE private conversations
3. E2EE groups where supported
4. Community/channel mode with server-side moderation capabilities
5. Enterprise retention/compliance mode subject to explicit policy

Architecture must explicitly document which features are unavailable or degraded under E2EE.

Do not silently weaken encryption to provide AI features.

For E2EE conversations, Quanty context must use an explicit client-side/authorized processing model where applicable.

---

# 23. Attachments and media

Message attachments use:

```
upload intent
 ↓
authorization
 ↓
signed upload
 ↓
object storage
 ↓
hash verification
 ↓
malware scan
 ↓
metadata commit
 ↓
message reference
```

Media derivatives:

- thumbnails
- previews
- transcoded video
- waveform
- image metadata
- safe preview

Large media must not be stored directly in relational message rows.

Retention and deletion must propagate to object storage.

---

# 24. Links and previews

URL preview pipeline:

```
message URL
 ↓
safe URL parser
 ↓
domain policy
 ↓
fetch sandbox
 ↓
SSRF protection
 ↓
metadata extraction
 ↓
cache
 ↓
preview projection
```

Never allow arbitrary user-supplied URLs to directly reach internal network resources.

Preview content must be sanitized.

---

# 25. Bots and integrations

Bots have explicit identities and scopes.

Bot capability examples:

- read selected channel
- send message
- react
- create thread
- receive commands
- invoke approved ecosystem capability

Bots cannot inherit the installing user's full permissions.

Integration tokens must be:

- scoped
- revocable
- auditable
- tenant-bound
- expiration-aware

---

# 26. Credits and economy

QuantChat consumes Quant Credits only for genuinely metered operations.

Potential metered operations:

- premium AI generation
- transcription
- translation
- media generation
- large-scale moderation processing
- premium call/recording infrastructure where applicable
- bot/agent execution

Flow:

```
quote
 ↓
reserve
 ↓
execute
 ↓
verify
 ↓
commit OR release
```

A failed operation must not permanently consume reserved credits.

QuantChat never edits the wallet ledger directly.

---

# 27. Admin architecture

QuantChat owns its own admin.

Admin modules:

1. user safety
2. reports
3. moderation queue
4. communities
5. channels
6. abuse/rate limits
7. bots/integrations
8. retention
9. encryption policy
10. notification policy
11. analytics
12. economy controls
13. audit
14. incident tools

Enterprise/org hub may aggregate views but must not duplicate QuantChat moderation policy.

---

# 28. Analytics

Track product events such as:

- conversation_created
- message_sent
- message_delivered
- message_read
- message_edited
- message_deleted
- reaction_added
- thread_created
- call_started
- call_joined
- call_ended
- community_joined
- channel_created
- search_performed
- attachment_shared
- resource_opened
- quanty_action_proposed
- quanty_action_executed
- moderation_action

Analytics events are not source truth.

Avoid collecting message bodies into analytics events.

---

# 29. Reliability and SLO targets

Initial target classes:

### Messaging

- high availability
- low p95 send acknowledgement
- durable acceptance before success
- no duplicate message creation

### Realtime

- fast connection establishment
- bounded fanout latency
- reconnect recovery
- cursor-based replay

### Calls

- signaling reliability
- connection success rate
- media quality telemetry
- graceful TURN fallback

### Search

- permission-correct results
- observable index freshness
- bounded query latency

Exact numerical SLOs must be chosen from measured workload rather than invented during implementation.

---

# 30. Failure behavior

QuantChat must degrade intentionally.

### Search unavailable

Messaging still works.

### Presence unavailable

Messages still work; presence becomes unknown.

### Notification service unavailable

Durable message delivery still works.

### Quanty unavailable

Manual communication still works.

### QuantDrive unavailable

Drive resource card becomes unavailable; message itself remains.

### Calendar unavailable

Calendar attachment shows unavailable/stale state.

### Event bus delayed

Core transaction succeeds; downstream projections catch up.

### Realtime gateway unavailable

Clients fall back to reconnect/poll/sync behavior where supported.

---

# 31. Security invariants

1. Every message read is authorized.
2. Every conversation membership change is authorized.
3. Resource previews re-check owner-domain authorization.
4. Search never bypasses ACLs.
5. Quanty never receives unrestricted database access.
6. Bots never inherit user-wide permissions.
7. E2EE is never silently downgraded.
8. Admin actions are audited.
9. Destructive actions are idempotent and policy controlled.
10. Tenant boundaries are enforced at every domain/service boundary.
11. Attachment access uses scoped authorization.
12. Deleted/expired content cannot remain accidentally accessible through caches/indexes.
13. Cross-app references never become cross-app write authority.

---

# 32. API architecture

Separate:

### Queries

- GET conversation
- list conversations
- list messages
- search messages
- get thread
- get members
- get shared media
- get call history

### Commands

- create conversation
- send message
- edit message
- delete message
- react
- create thread
- mark read
- invite member
- remove member
- create channel
- update channel
- start call
- end call
- report content

Commands require:

- authenticated principal
- tenant
- capability
- resource scope
- schema validation
- idempotency where applicable
- authorization
- audit classification
- event emission

---

# 33. Event model

Canonical event examples:

`quantchat.conversation.created.v1`

`quantchat.conversation.member_added.v1`

`quantchat.conversation.member_removed.v1`

`quantchat.message.accepted.v1`

`quantchat.message.edited.v1`

`quantchat.message.deleted.v1`

`quantchat.message.read.v1`

`quantchat.message.reaction_added.v1`

`quantchat.thread.created.v1`

`quantchat.call.started.v1`

`quantchat.call.ended.v1`

`quantchat.channel.created.v1`

`quantchat.moderation.actioned.v1`

Events are facts.

Consumers must be idempotent.

---

# 34. Cross-app journeys

## Journey A — Calendar → Chat

User opens Calendar event.

Action: "Message attendees."

Flow:

1. Calendar resolves attendees.
2. Contacts resolves people.
3. QuantChat resolves existing conversations.
4. User chooses recipients.
5. Chat composer opens with event resource reference.
6. User sends.
7. Message owns communication.
8. Calendar remains authoritative.

## Journey B — Chat → Calendar

User says:

"Kal 5 baje Rahul ke saath meeting rakh do."

Quanty:

1. resolves Rahul
2. checks calendar availability
3. proposes time
4. creates event only after policy/approval
5. optionally posts confirmation in chat

## Journey C — Drive → Chat

User shares a Drive file.

Flow:

1. Drive authorization
2. resource ref
3. optional preview
4. message persisted
5. recipient access checked at open time

## Journey D — QuantGit → Chat

PR review request produces notification.

QuantChat renders PR card.

Open action resolves current QuantGit state.

Chat never copies PR status as authoritative.

## Journey E — Chat → Quanty

"Summarize what we decided about the launch."

Quanty:

1. searches authorized conversation history
2. retrieves relevant thread messages
3. produces summary with message references
4. does not invent decisions
5. optionally stores approved derived memory

---

# 35. Implementation topology

Target package/service ownership:

```
apps/quantchat/
  web/
  mobile/
  desktop/
  backend/
  admin/

packages/quantchat-domain/
packages/quantchat-contracts/
packages/quantchat-realtime/
packages/quantchat-search/
packages/quantchat-media/
packages/quantchat-calls/
packages/quantchat-moderation/

services/
  quantchat-message/
  quantchat-realtime/
  quantchat-presence/
  quantchat-search/
  quantchat-media/
  quantchat-calls/
  quantchat-moderation/
```

Do not create all packages immediately.

Create a package/service only when an actual boundary, deployment property or ownership requirement justifies it.

---

# 36. Database boundary

Initial authoritative relational aggregates:

- Conversation
- ConversationMember
- Message
- MessageRevision
- MessageAttachment
- Reaction
- Thread
- Channel
- Community
- CommunityMember
- CallSession
- CallParticipant
- NotificationPreference
- ModerationCase
- ModerationAction
- BotInstallation
- ResourceReference

High-volume ephemeral state belongs outside the primary relational source where appropriate:

- presence
- typing
- connection state
- short-lived call signaling

Indexes/projections:

- message search index
- conversation list projection
- unread projection
- notification projection
- recommendation/discovery projection
- graph edges
- semantic embeddings

---

# 37. Testing architecture

Required test layers:

### Unit

- message state machines
- authorization
- permission calculation
- idempotency
- ranking
- moderation policies
- resource resolution

### Integration

- message persistence + outbox
- realtime fanout
- reconnect/replay
- search ACL
- attachment lifecycle
- calls/signaling
- cross-app resource resolution

### Property tests

- duplicate sends never duplicate messages
- read cursors never regress
- unauthorized users never retrieve messages
- replay produces equivalent projections
- deleted resources become inaccessible

### Contract tests

All ecosystem capabilities and events must be tested against shared contracts.

### Browser

Desktop and mobile journeys:

- send message
- reply
- search
- attach resource
- create group
- call
- permissions
- offline/reconnect
- moderation flow

---

# 38. Performance strategy

Avoid:

- loading entire conversation histories
- N+1 participant lookups
- synchronous downstream calls during message acceptance
- sending huge payloads over WebSocket
- recomputing unread counts per message synchronously

Use:

- cursor pagination
- batched hydration
- projections
- cache layers
- event-driven counters
- incremental sync
- compressed realtime payloads
- lazy media loading

Message acceptance should depend only on the minimum durable path.

---

# 39. Execution phases

## QC-01 — Domain contract

Create:

- product charter
- domain types
- state machines
- capability list
- event catalog
- error catalog

Exit:

- contracts compile
- ownership reviewed
- cross-app boundaries explicit

## QC-02 — Conversation core

Implement:

- conversation CRUD
- membership
- message persistence
- idempotent send
- pagination
- reactions
- threads

Exit:

- durable message flow proven

## QC-03 — Realtime

Implement:

- WebSocket gateway
- subscriptions
- delivery events
- read receipts
- reconnect/replay
- presence

Exit:

- multi-device sync proven

## QC-04 — Search

Implement:

- lexical search
- filters
- ACL filtering
- conversation search
- indexing/replay

## QC-05 — Media

Implement:

- upload sessions
- scanning
- previews
- attachment references
- lifecycle deletion

## QC-06 — Calls

Implement:

- signaling
- WebRTC
- TURN
- SFU path
- call lifecycle
- quality telemetry

## QC-07 — Communities

Implement:

- community
- channels
- roles
- permissions
- discovery
- moderation

## QC-08 — Safety

Implement:

- reports
- moderation
- abuse controls
- appeals
- admin tooling

## QC-09 — Quanty

Implement:

- capability projection
- context contracts
- draft actions
- approvals
- verified execution
- audit

## QC-10 — Ecosystem

Implement:

- Mail
- Calendar
- Drive
- QuantGit
- QuantGram
- QuanTube
- QuantMax
- QuantCooks
- QuantAds

resource references and notification integrations.

## QC-11 — Native parity

Desktop/mobile/offline/accessibility/performance.

## QC-12 — Production hardening

Load tests, chaos/failure tests, security review, observability, rollout and rollback.

---

# 40. Muse execution protocol

Before each QC phase Muse MUST:

1. inspect current repository state
2. locate existing QuantChat code
3. compare implementation with this architecture
4. identify contradictions
5. preserve working code
6. make one coherent slice
7. add tests
8. run affected validation
9. inspect browser behavior
10. document evidence
11. record remaining gaps
12. only then continue

Muse MUST NOT:

- create fake data to make UI appear complete
- create duplicate domain models already owned elsewhere
- make QuantAI call localhost fallbacks when canonical capability routing exists
- make QuantChat query another product's database directly
- call an API successful merely because it returned HTTP 200
- claim production readiness without evidence
- treat mock/demo pathways as production implementation

---

# 41. Definition of Done

QuantChat is not "done" until each relevant capability has:

- domain implementation
- source-of-truth model
- API/command contract
- event contract
- authorization
- audit behavior
- failure/degraded state
- unit/integration tests
- browser evidence
- mobile evidence where applicable
- observability
- performance evidence
- security evidence
- migration/rollback strategy
- documentation

Final law:

> **QuantChat owns communication. The ecosystem owns connections. Quanty orchestrates through capabilities. Events connect domains. References cross boundaries; databases do not.**
