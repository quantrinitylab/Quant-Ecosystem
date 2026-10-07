# QuantChat — Offline-First Sync & Multi-Device Architecture

**Status:** Target-state synchronization contract  
**Scope:** C01 Inbox, C02/C03 Messaging, C04/C05 Communities/Channels, C06 Media metadata, C07 Calls, C08 QuantMeet control state, C11 Notifications, C12 Devices/Settings.

## 1. Sync thesis

QuantChat must remain useful when the network is slow, intermittent, switching between Wi-Fi/mobile, or temporarily absent.

The client is not a second source of truth. It is a durable local projection plus a command queue.

Canonical model:

**PostgreSQL/domain → outbox/event spine → sync gateway → encrypted/local client store → UI projection**

For mutations:

**UI intent → local command validation → optimistic projection where safe → durable command queue → server idempotency → authoritative event → reconciliation**

Realtime accelerates convergence. Queries/cursors repair it.

## 2. Local storage layers

Each client has explicit storage classes:

1. **Identity/security store**
   - device identity
   - tokens
   - key material references
   - trust state
   - OS secure storage where available.

2. **Durable encrypted application database**
   - conversation summaries
   - messages/ciphertext
   - membership projections
   - drafts
   - receipts
   - notification state
   - sync cursors
   - pending commands.

3. **Media cache**
   - encrypted media blobs
   - thumbnails
   - resumable upload/download state
   - eviction metadata.

4. **Ephemeral runtime**
   - typing
   - presence
   - WebRTC state
   - transient UI state.

Never persist secrets in the ordinary application database when the platform secure store is available.

## 3. Offline capability matrix

### Safe offline
- read already-synced messages
- search local E2EE history
- compose drafts
- prepare reactions
- prepare message sends
- view cached media
- edit local profile draft
- inspect previously synced meeting details.

### Conditionally offline
- send messages: queued
- reactions: queued
- read state: queued/coalesced
- edits: queued with conflict policy
- deletes: queued and server-authorized
- media upload: resumable queue
- community actions: queued only when authorization can be safely revalidated.

### Online-required
- fresh membership authorization
- device enrollment/revocation
- security-sensitive settings
- admin actions
- new meeting admission
- recording start
- payment/credit side effects
- server-side Quanty actions
- actions requiring fresh policy.

The UI must explain queued versus completed state.

## 4. Local command journal

Every retryable mutation receives a local command record:

- command_id
- client_instance_id
- actor/device reference
- command_type
- target_resource_ref
- payload/ciphertext
- local_created_at
- dependency_command_ids
- idempotency_key
- expected_server_version
- local_state
- retry_count
- next_retry_at
- last_error
- server_result_ref.

States:

created → ready → sending → accepted → applied

or:

blocked → retrying → failed → user_action_required

A command is never silently discarded because the network disappeared.

## 5. Idempotency

The client generates a stable idempotency key before first network transmission.

Retries reuse the same key.

Server behavior:
- same key + same request hash → return original outcome
- same key + different request hash → reject
- unknown outcome → client queries command/result status rather than blindly creating another mutation.

This is especially mandatory for:
- send message
- create conversation
- upload completion
- meeting creation
- reactions
- edits/deletes
- media publication
- Quanty side effects.

## 6. Message send lifecycle

UI:

draft
→ local pending bubble
→ queued
→ sending
→ server accepted
→ server sequence assigned
→ authoritative message event
→ synced.

The local bubble has a stable client_message_id.

The server sequence is authoritative for conversation ordering.

A retry cannot create a second message.

If delivery is permanently rejected:
pending → failed
with retry/edit/remove options.

## 7. Optimistic UI rules

Optimistic projection is allowed for low-risk user-owned mutations:
- sending a message
- reaction
- draft state
- read cursor
- local mute/archive/pin intent where policy permits.

Do not optimistically claim completion for:
- security changes
- membership changes
- moderation
- recording
- device revocation
- credits
- deletion completion
- cross-app side effects.

The UI must distinguish:
**pending / confirmed / rejected**.

## 8. Event synchronization

The sync gateway exposes an ordered cursor per authorized scope.

Each event includes:
- event_id
- event_type/version
- resource_ref
- aggregate_version
- sequence
- cursor
- occurred_at
- correlation/trace information.

Client maintains:
- last_applied_cursor
- per-resource versions
- per-channel sequence
- event dedupe set/window.

If event N+2 arrives while N+1 is missing:
**pause affected projection → repair cursor → apply missing events → resume.**

Do not invent state by sorting solely on client timestamps.

## 9. Snapshot + delta protocol

Initial sync:

authenticate
→ negotiate sync protocol
→ receive snapshot manifest
→ download bounded snapshots
→ receive cursor
→ subscribe realtime
→ apply deltas.

Resume:

send last cursor
→ server validates cursor retention
→ return delta stream if valid
→ otherwise return authoritative snapshot + new cursor.

Snapshots are bounded by domain/resource scope.

A full account snapshot is not required for every reconnect.

## 10. Multi-device convergence

Each device has:
- device_ref
- sync cursor
- local database
- cryptographic identity
- device capabilities
- app version.

Server state is shared; local state is independently materialized.

A message sent from Device A eventually appears on Device B through authoritative events.

A message sent offline on Device B uses its client_message_id and is merged by the server without relying on wall-clock ordering.

## 11. Ordering model

Use three concepts:

1. **client creation time** — UX hint only
2. **server aggregate sequence** — canonical conversation ordering
3. **event cursor** — transport synchronization position.

Do not use client timestamps for security-sensitive ordering.

Offline messages may appear locally before server ordering is known. Once authoritative ordering arrives, the UI reconciles without duplicating the message.

## 12. Conflict model

### Last-write-wins is NOT universal.

Policy by operation:

- message send: dedupe by client_message_id
- reaction: set/remove using unique actor+reaction key
- edit: optimistic concurrency; latest authorized revision wins only after version check
- delete: server-authoritative tombstone
- membership: server policy + version check
- role/permission: strict optimistic concurrency
- settings: field/domain versioning
- drafts: device-local unless explicitly synced
- read cursor: monotonic merge
- archive/mute/pin: user-scoped preference merge.

Security and membership conflicts never resolve silently.

## 13. Read receipts

Read state is monotonic.

A client can queue:
conversation_ref
→ last_seen_sequence.

Server accepts only forward movement for the same subject unless an explicit recovery operation exists.

Multiple devices merge toward the highest valid sequence.

Read receipts do not require every message to produce an individual durable mutation.

## 14. Typing and presence

Typing:
- ephemeral
- TTL
- never replayed after long disconnect.

Presence:
- heartbeat/TTL
- server expires stale state
- reconnect establishes fresh state.

Offline clients do not claim that a user is currently online.

## 15. Draft synchronization

Drafts are primarily device-local.

Optional cross-device drafts use:
- explicit user setting
- encrypted payload
- per-conversation draft version
- conflict policy.

A draft is never treated as a sent message.

## 16. Media sync

Uploads use resumable chunks.

State:

created
→ uploading
→ paused
→ resumed
→ uploaded
→ server verification
→ published.

Each chunk has integrity metadata.

On network failure:
- retain completed chunks
- resume from server-confirmed offset/chunk set
- do not restart the entire upload unnecessarily.

Downloads similarly support:
- range/chunk resume
- encrypted-at-rest cache
- checksum verification
- cache eviction.

Object-storage URLs are temporary delivery credentials, never canonical identity.

## 17. E2EE sync

For E2EE conversations:
- local client stores decryptable content according to device security policy
- server stores ciphertext envelopes/routing state
- sync transports ciphertext
- keys remain in authorized client security domains
- attachment encryption occurs before upload.

A newly linked device does not automatically receive old plaintext merely because account login succeeded.

Historical E2EE sync requires the explicit device trust/recovery protocol.

## 18. E2EE search

Preferred:
local decrypted index.

Optional server-assisted search:
only encrypted-search designs that meet the product's threat model and have been independently reviewed.

Do not upload plaintext message indexes merely to make search convenient.

## 19. Notifications + sync

Push notification is a wake-up hint, not the source of truth.

Flow:
push hint
→ wake app
→ authenticate
→ cursor sync
→ reconcile unread state
→ render current notification.

A lost push must not lose a message.

Notification payloads must avoid unnecessary E2EE plaintext.

## 20. Reconnect strategy

Network states:

online
→ degraded
→ offline
→ recovering
→ online.

Backoff:
- exponential
- jittered
- bounded
- reset after successful stable connection.

During degraded state:
- reduce nonessential sync frequency
- prioritize commands and visible conversation data
- pause background media prefetch
- preserve user edits.

## 21. Sync prioritization

Priority tiers:

P0:
security/session recovery, command outcomes, visible message mutations.

P1:
active conversation messages, meeting/call control, notification reconciliation.

P2:
inbox projections, unread counts, recently opened media.

P3:
background search indexes, thumbnails, older history, recommendations.

A congested client must never starve user-visible commands behind background work.

## 22. Background sync

Mobile background execution is OS-controlled.

The architecture must tolerate:
- process termination
- suspended app
- revoked background execution
- battery saver
- network transition.

Never depend on indefinite background sockets.

Use push/background fetch as hints and resume through cursor synchronization.

## 23. Cross-platform local engine

Shared domain protocol:
- sync envelopes
- command states
- cursor semantics
- conflict rules
- resource refs
- idempotency.

Platform adapters:
- Web: IndexedDB + service worker where supported
- Android/iOS: encrypted local DB + native secure storage
- Tauri: local encrypted DB + OS credential/key store
- Capacitor: native storage adapters.

Pixel/UI implementations remain platform-specific.

## 24. QuantMeet synchronization

Meeting control state uses the same cursor/event model but media remains WebRTC.

Synchronize:
- participant admission
- role changes
- stage state
- breakout assignment
- chat
- reactions
- hand raises
- recording state
- caption policy.

Do not attempt to sync audio/video through the offline queue.

On reconnect:
**authoritative meeting snapshot → current media renegotiation → local UI reconciliation.**

## 25. Calls synchronization

Durable call state:
- invitation
- acceptance
- participant state
- call end
- recording consent
- escalation.

Ephemeral:
- RTP
- active speaker
- transient quality
- ICE candidates.

If signaling disconnects while media remains alive, media may continue briefly but control state becomes stale until signaling resumes.

## 26. Cache policy

Every cached resource declares:
- owner
- sensitivity
- encryption class
- TTL
- max size
- eviction priority
- offline availability.

Never cache:
- private keys in ordinary cache
- permanent access tokens
- unrestricted admin responses
- expired authorization grants.

Sensitive content may require explicit user-controlled local lock.

## 27. Storage pressure

When local storage is low:

1. remove derived thumbnails
2. remove old media cache
3. remove low-priority projections
4. compact acknowledged command/event journals
5. preserve unsent user content
6. preserve security/session state.

Never evict unsent messages or drafts as ordinary cache cleanup.

## 28. Sync garbage collection

Safe to compact only after:
- command outcome is durable
- event cursor is acknowledged
- no local dependency references the record
- retry window has expired.

Failed commands remain inspectable until user action or policy-based cleanup.

## 29. Security model

Threats:
- stolen device
- replayed command
- duplicated event
- malicious local modification
- stale authorization
- revoked device
- cross-tenant cursor
- forged resource reference
- malicious push payload
- prompt injection in synced content.

Server reauthorizes sensitive commands.

A client cursor cannot grant access to resources outside its current authorization scope.

## 30. Quanty boundary

Quanty consumes synchronized data through governed resource/context contracts.

Offline Quanty:
- can operate on locally authorized content
- must label results as local/offline where relevant
- cannot perform server side effects until connectivity and authorization are restored.

Queued Quanty side effects are not silently executed later unless the specific tool policy allows deferred execution.

## 31. Cross-app sync

QuantChat remains owner of its own messages/calls/meetings.

Cross-app projections use:
- QuantResourceRef
- QuantContextEnvelope
- provenance
- authorization epoch
- expiration.

Example:
Meeting recap saved to Drive:
Chat stores Drive resource reference.
Drive stores the artifact.
Chat does not copy the entire artifact into its own database.

## 32. Sync APIs

GET /api/v1/chat/sync/bootstrap
GET /api/v1/chat/sync/snapshot
GET /api/v1/chat/sync/delta?cursor=...
POST /api/v1/chat/sync/commands
GET /api/v1/chat/sync/commands/{commandRef}
POST /api/v1/chat/sync/cursor/ack

The sync API is not a bypass around ordinary domain authorization.

## 33. Sync WebSocket

Connection:
authenticate
→ protocol negotiation
→ authorized scopes
→ cursor resume
→ snapshot/delta if needed
→ realtime events
→ cursor acknowledgement.

Client must be able to switch from WebSocket to HTTP delta sync without losing correctness.

## 34. Offline UX states

Every user-visible mutation has a clear status:

**Sending**
local command accepted; server outcome unknown.

**Sent**
server accepted and authoritative event observed.

**Queued**
waiting for network.

**Retrying**
temporary failure with bounded retry.

**Failed**
server rejected or retry budget exhausted.

**Needs attention**
user action/security confirmation required.

Never show a failed message as successfully sent.

## 35. Testing matrix

Unit:
- command state machine
- cursor advancement
- event dedupe
- conflict policies
- idempotency
- retry/backoff
- cache eviction.

Integration:
- offline send → reconnect
- duplicate send retry
- event gap repair
- stale cursor
- revoked device
- multi-device message convergence
- media upload resume
- push missed → sync recovery
- meeting reconnect
- cross-app resource revocation.

Chaos:
- packet loss
- delayed events
- reordered events
- duplicate events
- server restart
- WebSocket drop storms
- app kill during upload
- device clock skew.

Security:
- forged cursor
- cross-tenant cursor
- command replay
- stale grant
- malicious local payload
- unauthorized historical E2EE sync.

## 36. Performance targets

Measure, do not assume:
- time to render cached inbox
- time to show cached conversation
- offline command enqueue latency
- reconnect-to-consistency latency
- delta sync throughput
- event application latency
- media resume efficiency
- local database write latency
- memory usage under large conversations.

Large conversations must use virtualized rendering and incremental history hydration.

## 37. Implementation sequence

SYNC-01 local storage/security abstraction.
SYNC-02 sync cursor and bootstrap protocol.
SYNC-03 command journal + idempotency.
SYNC-04 offline message send/reconcile.
SYNC-05 event dedupe/gap repair.
SYNC-06 multi-device convergence.
SYNC-07 media resumable upload/download.
SYNC-08 notification wake/sync.
SYNC-09 settings/read/draft synchronization.
SYNC-10 C04/C05 membership and community reconciliation.
SYNC-11 C07/C08 call/meeting control reconciliation.
SYNC-12 cross-app resource invalidation.
SYNC-13 chaos testing and storage-pressure handling.
SYNC-14 security hardening and runtime evidence.

## 38. Muse implementation law

For every sync slice Muse must:
1. inspect existing client/server code first
2. reuse canonical contracts
3. implement one vertical slice
4. add deterministic tests
5. test offline/reconnect behavior
6. verify duplicate/out-of-order event handling
7. inspect actual UI state transitions
8. document runtime evidence
9. never fake server confirmation
10. never use local optimistic state as authoritative security state.

## 39. Architectural invariant

**Offline mode is a projection-and-command capability, not a second backend. The server remains authoritative, every mutation is safely retryable, every event is replayable, and every reconnect can deterministically converge the client to canonical state.**
