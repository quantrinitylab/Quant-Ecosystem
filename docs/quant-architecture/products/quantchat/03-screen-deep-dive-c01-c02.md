# QuantChat — Screen Deep Dive: C01 Inbox + C02 1:1 Conversation

> Target-state implementation architecture. QuantChat unifies WhatsApp + Telegram + Snapchat + Discord + QuantMeet.

## C01 — Inbox / Chat Home

### Responsibility
C01 is the communication control center. It presents conversation projections and local orchestration; it does not become authoritative storage for messages or conversations.

Primary jobs:
- find and resume conversations
- surface unread/mentions/follow-ups
- resume drafts
- start chat/group/community/meeting
- access calls, search and Quanty

### Desktop
Global header: search, Quanty, notifications, account.
Three-pane workspace: navigation rail → conversation list → active conversation/empty state.
Must support split panes, keyboard navigation, multi-select, drag/drop, pop-out calls, command palette and context side panels.

### Mobile
Header: avatar, filter/title, search, camera/new action.
Story/status strip.
Filters: All, Unread, Groups, Communities, Calls.
Virtualized conversation list.
Bottom navigation: Chats, Camera, Communities, Calls, Profile.

### Read model
ConversationListItem:
- conversationId
- conversation type
- display projection
- last activity projection
- unread/mention/reply counters
- pinned/muted/archived/draft state
- presence summary
- active meeting summary
- ranking score + explanation/model version
- sync cursor

Use a purpose-built projection. Do not join the complete Message domain on every inbox request.

### Ordering
Priority: explicit pins → active/high-priority communication → unread → recent activity → folders/preferences.
Ranking must not use sensitive inferred attributes as durable signals.

### State machine
IDLE → LOADING_FIRST_PAGE → READY.
READY may enter PAGINATING, REFRESHING, RECONNECTING or SYNCING.
READY ↔ OFFLINE through SYNCING.
Recoverable error → RETRYING → READY.
Expired auth → REAUTHENTICATING → READY.

### Commands
Queries: list_conversations, get_unread_summary, get_presence_summary, get_active_calls, get_notification_summary.
Commands: mark_read, mark_unread, pin, unpin, mute, unmute, archive, restore, create_conversation.
Every mutation carries principal, device ID, idempotency key, expected version when required and correlation ID.

### Realtime
Consume conversation.created/updated, message.accepted/deleted/read, reaction, presence, call and meeting events.
Typing is ephemeral and is never treated as durable domain truth.
Event pipeline: validate schema → dedupe event ID → check relevance → update projection → recompute unread/order → render.
Unknown conversation event triggers bounded reconciliation rather than fabrication of an incomplete row.

### Pagination
Cursor pagination only. Live inboxes must not use page-number pagination.
Example: GET /v1/chat/conversations?limit=50&cursor=...

### Offline
Encrypted local cache remains readable.
Supported mutations enter an operation queue.
UI explicitly distinguishes local-only, queued and server-confirmed.
Offline must never falsely claim remote delivery, meeting creation, invitation or deletion.

### Empty/error states
New user: start chat/import contacts/create community/join invite.
No unread: neutral empty state, no fake content.
No search results: broader search/global search/contacts.
Stable machine errors: AUTH_REQUIRED, FORBIDDEN, RATE_LIMITED, NETWORK_UNAVAILABLE, SYNC_CURSOR_INVALID, PROJECTION_STALE, SERVICE_UNAVAILABLE, CLIENT_SCHEMA_UNSUPPORTED.

### Accessibility
Keyboard navigation, focus restoration, screen-reader unread announcements, reduced-motion mode, minimum 44px touch targets and non-color-only status indicators.

---

## C02 — 1:1 Conversation

### Responsibility
C02 is the canonical private communication surface combining messaging, rich media, direct calls, QuantMeet escalation, Quanty and ecosystem resource cards.

### Route
/chat/c/{conversationId}
Optional presentation state: reply, thread, search, media and meet. Query parameters never grant authorization.

### Header
Avatar, display name, verification/presence policy, search, voice call, video call, QuantMeet, more.
More: profile, shared media, search, mute, disappearing messages, encryption verification, block, report, clear local history, notification settings.

### Timeline
Use virtualization and cursor-based history.
MessageViewModel contains message ID, server sequence, sender projection, timestamp, message kind, renderable body, attachment projections, reply/thread refs, reactions, delivery state, edit/expiry/moderation state and QuantResourceRefs.
Renderer must never assume plaintext exists.

### Composer
Core: attachment/camera action, text/mention/draft field, voice record, send.
Expanded actions: camera, gallery, file, contact, location, poll, event/resource, sticker/GIF, voice and Quanty.
Supports drafts, mentions, reply/edit, paste image, desktop drag/drop, upload progress, retry, scheduled send and disappearing/view-once options where policy allows.

### Message acceptance pipeline
composer → local validation → attachment preparation → E2EE encryption when enabled → client_message_id → optimistic local insertion → send command → authorization → idempotency check → durable persistence → transactional outbox → event publication → authoritative ACK → delivery/read state.
HTTP 200 alone is not message success. Server-confirmed means authoritative acceptance has been received.

### Message states
DRAFT → QUEUED → SENDING → ACCEPTED → DELIVERED → READ.
Failure: SENDING → FAILED → RETRYING → ACCEPTED.
Other terminal/derived states: DELETED, EXPIRED, MODERATION_HOLD.
client_message_id prevents duplicate creation during retries.

### E2EE
Private E2EE uses device-oriented identity keys, prekeys, session establishment, ratcheting, encrypted envelopes, verification and linked-device lifecycle.
Server stores ciphertext plus routing metadata required by the protocol.
Server-side AI must not silently receive E2EE plaintext.
AI in E2EE uses authorized client-side processing or an explicit user-controlled plaintext handoff where supported.

### Replies and threads
Reply references a parent message and opens context on tap.
Thread is a separate presentation state with its own cursor, participant projection and unread cursor.
Quanty thread summaries are derived content and must never appear as human-authored messages.

### Attachments
select/capture → validate → encrypt → upload intent → resumable upload → hash verification → malware/media processing → attachment accepted → message reference.
States: LOCAL → UPLOADING → PROCESSING → READY → EXPIRED/DELETED.
Large binaries never enter relational message rows.

### Media
Images support preview/zoom/save/share subject to permissions.
Video uses adaptive streaming and captions where available.
Voice uses waveform, speed, seek and authorized transcription.
View-once content has explicit UI, server-authoritative expiry and applicable screenshot signals.

### Calls and QuantMeet
Escalation: voice call → video call → QuantMeet.
Instant Meet carries the current conversation context into pre-join.
Scheduled Meet invokes the Calendar capability and returns a confirmed resource card to Chat.
Never access the Calendar database directly.

### Quanty
Read-only: summarize, translate, explain, find prior discussion.
Draft: reply, rewrite tone, follow-up, agenda.
Side effect: send, schedule meeting, create Drive document, share resource.
Lifecycle: intent → capability resolution → minimum useful context → policy → approval if required → execute → verify → audit.

### Ecosystem resource cards
Supported references include Mail threads, Calendar events, Drive files, Git PRs, QuantGram posts, QuanTube videos, QuantMax profiles/matches, QuantCooks projects and QuantAds campaigns.
Lifecycle: REFERENCE → RESOLVE → AUTHORIZE → RENDER → OPEN.
Revoked/deleted resources become truthful unavailable/access-revoked/deleted states. Never fabricate stale content.

### Disappearing messages
Policy may be disabled, 24h, 7d or another supported duration.
Expiry propagation: message expiry → tombstone → realtime event → cache invalidation → search removal → notification cleanup → memory re-evaluation → media retention cleanup.

### Presence and typing
Presence states: online, recently active, unavailable, unknown.
Typing is ephemeral, rate-limited, non-durable and automatically expires.

### Performance
Virtualized timeline, incremental history, lazy media, thumbnail-first rendering, compressed realtime payloads, optimistic local UI, background uploads, bounded attachment concurrency.
Message acceptance must not synchronously depend on search indexing, recommendations or unrelated downstream systems.

### Security release checklist
Server authorization on every message query.
Membership checked server-side.
Attachment and foreign resource ACLs rechecked at access time.
E2EE cannot silently downgrade.
Delete operations cannot be forged client-side.
Idempotency cannot be bypassed.
Rate limits, abuse reporting and privileged-operation audit events are mandatory.

### Test matrix
Unit: message state machine, composer validation, retry/idempotency, expiry, permission rendering, resource-card states.
Integration: persistence + outbox + realtime, duplicate sends, reconnect replay, attachment lifecycle, E2EE envelope handling, call escalation, Calendar/Drive authorization.
Browser/mobile: long history, keyboard/composer, offline send, reconnect, media upload, reply/thread, calls, QuantMeet launch and accessibility.

## Shared C01/C02 boundary
C01 is the conversation projection/navigation surface. C02 is the communication interaction surface.
Neither may own Contacts, Calendar, Drive, Git or wallet truth; bypass capability authorization; duplicate foreign source tables; or use fake data as production truth.

## Next deep slice
C03 Group + C04 Community + C05 Channel: one shared community graph representing WhatsApp groups/communities, Telegram groups/supergroups/channels, Discord servers/channels/roles and QuantMeet stages/meeting spaces without four disconnected domain models.