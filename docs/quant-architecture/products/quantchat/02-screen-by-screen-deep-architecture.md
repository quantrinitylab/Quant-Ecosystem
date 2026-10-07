# QuantChat — Screen-by-Screen Deep Architecture

> Status: target-state architecture
> Scope: QuantChat = WhatsApp + Telegram + Snapchat + Discord + QuantMeet in one coherent product.
> Rule: every screen is a product state machine, not a visual mock. UI, local state, server state, permissions, realtime, offline behavior, AI, safety, analytics, accessibility, deep links and cross-app actions are specified together.

## 0. Global screen architecture

### Navigation
Mobile primary surfaces:
- Chats
- Camera
- Communities
- Calls/Meet
- Stories/Spotlight
- Profile/Settings via avatar

Desktop/web:
- left rail: Chats, Calls, Communities, Camera/Spotlight, Search
- middle pane: resource list
- main pane: active resource
- optional right context rail: members, media, files, meeting controls, Quanty
- command palette for global navigation and actions

### Global UI states
Every screen must implement:
1. cold loading
2. warm loading
3. empty
4. partial data
5. offline
6. reconnecting
7. permission denied
8. authentication expired
9. rate limited
10. moderation restricted
11. server error
12. optimistic success
13. optimistic rollback
14. destructive-action confirmation
15. accessibility/reduced-motion mode

### Shared interaction contract
- Every mutation gets a client operation id.
- Optimistic UI is allowed only where rollback is deterministic.
- Server truth wins after reconciliation.
- Realtime events are idempotent.
- Deep links resolve to a canonical `QuantResourceRef`.
- Quanty actions show explicit state: observing → drafting → awaiting approval → executing → verified.
- Cross-app cards never expose foreign database internals.

---

# C01 — Inbox / Chat Home

## Purpose
The user's communication command center. It must unify private chats, group chats, communities, meeting follow-ups, calls, stories and important system notifications without becoming an unread-count dump.

## Layout
### Mobile
- top: profile/avatar, global search, camera shortcut
- segmented/filtered row: All, Unread, Groups, Communities, Calls, Archived
- conversation list
- floating compose/new-chat action
- optional story/status strip above conversations
- bottom navigation

### Desktop
- left navigation rail
- conversation list with filters
- active conversation pane
- optional right context rail

## Data
Primary:
- ConversationSummary
- LastMessage
- UnreadCounter
- PresenceSnapshot
- MuteState
- PinState
- DraftState
- StorySummary
- MeetingSummary

Derived:
- relevance score
- urgency score
- notification grouping
- AI suggested priority

## Interactions
- swipe/archive/mute/pin/mark unread
- drag folders
- multi-select
- start new chat/group/community/meeting
- resume draft
- jump to unread
- search globally
- call directly
- start QuantMeet with selected conversations
- create calendar event from conversation

## Realtime
Consumes:
conversation.updated
message.created
message.updated
message.deleted
receipt.updated
presence.updated
typing.updated
call.updated
meeting.updated
notification.created

## Offline
Inbox remains readable from encrypted local cache. New mutations enter an operation queue and reconcile after connectivity.

## Quanty
Can summarize unread threads, prioritize conversations, suggest replies, identify follow-ups and prepare a meeting—but acting on behalf of the user requires explicit capability approval.

## Failure modes
- stale unread count → label as syncing and reconcile
- missing conversation event → periodic cursor repair
- duplicate event → dedupe by event id
- deleted conversation → tombstone rather than client crash

## Accessibility
Keyboard navigation, screen-reader announcement for unread changes, reduced-motion list transitions, 44px minimum touch targets.

---

# C02 — 1:1 Conversation

## Purpose
The canonical private communication surface: text + media + voice + calls + camera + QuantMeet escalation.

## Layout
Header:
- avatar/name
- presence/last-seen policy
- search
- call
- video
- QuantMeet
- more

Body:
- date separators
- encrypted message timeline
- replies/threads
- reactions
- attachment cards
- disappearing/view-once indicators
- system events

Composer:
- camera
- gallery/file
- voice record
- emoji/sticker/GIF
- text field
- send
- Quanty

## Message state machine
draft → locally queued → sent-to-server → delivered → read
with alternate states:
failed → retry
expired → tombstoned
deleted-for-me / deleted-for-all
edited
moderation-restricted

## E2EE boundary
Message plaintext is unavailable to ordinary server application code in E2EE conversations. Search, previews, notification content and AI assistance operate only within the explicitly authorized device/user boundary.

## Media
Attachment upload:
prepare → encrypt → resumable upload → server acknowledges blob → message references blob → recipient downloads/decrypts.

## Calls
One-tap escalation:
message → voice call → video call → QuantMeet.

## QuantMeet handoff
Preserve participants and relevant context through a `QuantContextEnvelope`; do not copy foreign source records.

## Quanty
Actions:
- summarize visible conversation
- translate selected message
- rewrite draft
- extract action item
- schedule follow-up
- start meeting
- create Drive artifact
- send approved message

## Security
Safety numbers/device verification, linked-device management, blocked/restricted state, disappearing-message policy, screenshot-sensitive UI where platform permits.

---

# C03 — Group Conversation

## Purpose
High-scale private group communication with roles, topics, polls, files, calls and meeting escalation.

## Header
Group identity, member count, search, call, Meet, group info.

## Body
Messages plus:
- reply/thread affordance
- mentions
- reactions
- polls
- shared media
- pinned messages
- system events
- join/leave events

## Group state
Active → restricted → archived → deleted.
Membership:
invited → pending → active → muted → restricted → banned → left.

## Roles
Owner, admin, moderator, member, guest/bot.
Permissions are capabilities rather than UI labels.

## Scale
Large groups use cursor pagination, virtualized rendering, server-side fanout strategies and partition-aware realtime subscriptions.

## Meeting
Start instant Meet, schedule Meet, create agenda, assign co-hosts, open breakout rooms.

## Quanty
Can summarize a selected period, extract decisions, create polls, draft announcements, prepare agendas and perform approved moderation.

---

# C04 — Community / Server Home

## Purpose
Unifies WhatsApp Communities, Telegram supergroups/channels and Discord servers.

## Layout
- community identity/banner
- announcement area
- channel/category tree
- online/presence summary
- events/meetings
- member discovery
- moderation tools

## Hierarchy
Community → category → channel → thread → message.
Voice:
Community → voice channel/stage → participants.

## Permission engine
Capabilities include:
read_channel, post_message, create_thread, attach_media, mention_everyone, manage_messages, manage_members, manage_roles, start_stage, start_meeting, manage_bots.

Policy evaluation happens server-side and is auditable.

## Onboarding
Invite link → preview → rules → verification/verification challenge → role assignment → welcome flow.

## Moderation
AutoMod signals, report queue, slow mode, quarantine, content restrictions, audit log.

## Quanty
Moderator mode is isolated from personal mode. Quanty never silently changes bans, roles or deletions.

---

# C05 — Channel / Forum / Topic Surface

## Purpose
Broadcast and asynchronous community communication.

## Modes
- announcement channel
- discussion channel
- forum
- topic/thread
- stage event

## Feed model
Pinned content → chronological/relevance hybrid → unread boundary → thread summaries.

## Creator tools
Schedule post, attach media, poll, link preview, analytics, subscriber-only content, reactions, comments, moderation.

## Telegram-class features
Public username, public/private links, scheduled messages, saved content, bots, mini apps, webhooks.

## Discord-class features
Forum tags, slow mode, role gates, stage events, channel permissions.

## Quanty
Summarize channel, translate, create digest, identify unanswered questions, draft announcement.

---

# C06 — Camera / Media / Stories / Spotlight

## Purpose
Snapchat-class camera is a first-class creation surface, not an attachment picker.

## Entry
Camera button opens immediately into capture mode.

## Pipeline
camera → frame acquisition → GPU effects → face/body/hand tracking → lens runtime → composition → safety/privacy checks → preview → publish/share.

## Modes
Photo, video, boomerang, voice, text, AR lens, avatar, world effect, screen/media remix.

## Publishing targets
Chat, Story, Close Friends, Community, Channel, Spotlight, private archive.

## Story state
draft → processing → published → active → expired → archived/deleted.

## Privacy
Audience selector is visible before publish and remembers per-surface preference only when explicitly enabled.

## Lens architecture
Versioned sandboxed lens package:
manifest → permissions → assets → shaders → ML requirements → compatibility → moderation metadata.

## Performance ladder
WebGPU → WebGL2 → 2D fallback.
Low-end devices disable expensive effects while preserving capture functionality.
Reduced-motion disables nonessential animation.

## Safety
Media scanning, abuse reports, copyright signals, age/safety policy enforcement and upload rate limits.

---

# C07 — Calls

## Purpose
Unified 1:1 and small-group calling before escalation to a full QuantMeet room.

## States
idle → ringing → connecting → connected → reconnecting → ended/failed.

## Media
WebRTC peer/media negotiation with SFU when multiparty or feature requirements demand it.

## Controls
mute, camera, speaker, device switch, effects, captions, screen share, add participant, record where authorized, escalate to Meet.

## Network adaptation
Adaptive bitrate, codec negotiation, packet-loss recovery, jitter buffering, ICE restart and device handoff.

## Call history
Call records are durable metadata, not raw media. Recordings are Drive resources.

## Privacy
Explicit recording consent/indicator. No hidden capture.

---

# C08 — QuantMeet

## Purpose
Full conferencing system embedded inside QuantChat. The user must feel this is a continuation of the conversation.

## Entry states
Instant Meet:
conversation → Meet room.

Scheduled Meet:
conversation → Calendar event → room.

External invite:
link → pre-join → waiting room → meeting.

## Pre-join screen
- identity preview
- camera preview
- microphone/device selection
- background/effects
- caption preference
- accessibility
- security notice
- join / ask to join

## In-meeting layout
Main stage:
speaker/video/content.

Side rails:
participants, chat, shared resources, Quanty.

Bottom control bar:
mic, camera, share, captions, reactions, participants, chat, Quanty, more, leave.

## Host controls
waiting room, mute policy, remove, admit, co-host, lock meeting, recording, breakout rooms, stage mode, moderation, permissions.

## Collaboration
Screen share, presentation mode, whiteboard, collaborative notes, polls, Q&A, reactions.

## AI meeting plane
Quanty can:
- transcribe
- identify speakers
- summarize
- extract decisions
- extract action items
- draft follow-up
- create Drive meeting notes
- prepare Mail/Chat recap
- propose Calendar follow-up

Each action has provenance and approval state.

## Recording
Meeting media pipeline → encrypted recording artifact → QuantDrive resource.
Recording never lives as an opaque database blob.

## Breakout rooms
Main room creates signed breakout assignments. Participants can move between rooms according to host policy. Each room has isolated media state but belongs to the parent meeting.

## Post-meeting screen
- recording
- transcript
- AI summary
- decisions
- action items
- attendance
- shared files
- follow-up draft
- Calendar event
- Drive folder

---

# C09 — Search

## Purpose
One search surface across messages, people, communities, channels, media, files and meetings subject to authorization.

## Search modes
All, Messages, People, Communities, Media, Files, Meetings.

## Query pipeline
input → parser → authorization filter → lexical search → semantic search where permitted → ranking → result hydration.

## Indexes
Meilisearch for lexical/filter search.
Qdrant for semantic retrieval.
Private E2EE content is indexed only inside an authorized client/device boundary unless the user explicitly uses a server-searchable mode.

## Ranking
Signals:
exactness, recency, relationship relevance, source authority, user permissions, unread state, conversation activity.

No ranking signal may bypass authorization.

## Result actions
Open, reply, forward, quote, add to Drive, create meeting, create task/action item, report.

---

# C10 — Quanty Surface

## Purpose
The in-product AI control surface for QuantChat.

## Modes
1. personal
2. conversation
3. meeting
4. community moderator
5. automation

## Context model
Quanty receives a minimum-useful-context envelope:
identity + authorized resources + task + policy + provenance + expiry.

## UI
- command/input
- context chips
- live action stream
- citations/resource refs
- approval cards
- execution log
- undo/rollback where supported

## Action lifecycle
observe → reason → draft → approval required? → execute → verify → report.

## Hard boundary
Quanty cannot use a broad account token as a shortcut. Every capability is individually authorized and audited.

---

# C11 — Notifications

## Purpose
The human-facing notification inbox for the ecosystem.

## Inputs
QuantMail, Calendar, QuantGit, QuantGram, QuantWave, QuantMax, QuantCooks, QuanTube, QuantAds and QuantChat emit notification intents.

## QuantChat owns
delivery, grouping, priority, mute, channel selection, batching and presentation.

Originating products remain authoritative for business truth.

## UI
Priority sections:
- urgent
- direct
- mentions
- meetings
- ecosystem
- low priority

## Actions
Open source resource, reply, approve, join meeting, snooze, mute, mark read.

## Reliability
Notification idempotency key, dedupe window, delivery receipt and retry/DLQ.

---

# C12 — Settings / Privacy / Devices

## Sections
Account, devices, privacy, security, notifications, data controls, appearance, accessibility, storage, calls, camera, communities, Quanty, credits.

## Device management
Each linked device has:
device identity
key state
last active
session status
verification status
revocation control.

## Privacy
Audience defaults, last seen, read receipts, story visibility, location, calls, groups, discovery, personalization and AI context permissions.

## Data lifecycle
Export, deletion, retention and memory controls are explicit. Ephemeral deletion must propagate to caches/indexes/derived artifacts where applicable.

## Quanty controls
Global permission defaults plus per-surface controls:
conversation, meeting, community, camera, notification.

---

# C13 — Admin / Operations

## Purpose
Product-owned control plane for QuantChat. Not a generic central admin.

## Domains
- users and safety
- conversations/communities
- moderation
- reports
- calls/Meet health
- media/lenses
- bots/apps
- credits surfaces
- feature flags
- audit
- privacy requests
- incident operations

## Admin authorization
RBAC + capability grants + environment boundary + break-glass controls.

Every sensitive action:
actor → capability → target → reason → before/after → timestamp → correlation id.

## Moderation console
Queues for reports, spam, abuse, impersonation, unsafe media and policy escalations.

## Meeting operations
SFU health, room counts, packet loss, failed joins, recording jobs, transcription jobs, capacity pressure.

## Lens operations
Package version, permissions, compatibility, crash rate, moderation status, rollout percentage.

## Bot operations
bot identity, scopes, webhook health, abuse rate, credits usage, revoked permissions.

## Audit
Append-only operational audit stream. Admin UI is a projection; audit truth is immutable event data.

---

# 1. Cross-screen data ownership

| Surface | Owns | References |
|---|---|---|
| C01 Inbox | conversation projection, unread state | identity, stories, calls, notifications |
| C02 1:1 | messages, receipts, session metadata | contacts, Drive media, Calendar, Quanty |
| C03 Group | membership, group policy, messages | identity, Meet, Drive |
| C04 Community | community/channel hierarchy and permissions | identity, bots, Meet |
| C05 Channel | posts, threads, subscriptions | community, media, Quanty |
| C06 Camera | capture/session/draft/publish workflow | media storage, social graph |
| C07 Calls | call session metadata | identity, WebRTC/SFU |
| C08 QuantMeet | meeting session and collaboration state | Calendar, Drive, Mail |
| C09 Search | search projections | authorized source resources |
| C10 Quanty | AI session/action state | governed resource refs |
| C11 Notifications | delivery state | source notification intents |
| C12 Settings | user/device policy | identity/security |
| C13 Admin | operational projections | immutable audit/events |

# 2. Required backend contract per screen

Every implementation PR for a screen must document:
- route
- API contract
- command/mutation contract
- query/read model
- realtime events
- authorization policy
- idempotency strategy
- pagination
- caching
- offline behavior
- telemetry
- error taxonomy
- abuse/rate limits
- test matrix
- deep links
- cross-app resource refs

# 3. Screen completion definition

A screen is NOT complete because the UI renders.

It is complete only when:
- happy path works
- empty/loading/error/offline states work
- authorization is enforced server-side
- realtime reconciliation works
- refresh/reconnect works
- mobile + desktop responsive behavior works
- keyboard/accessibility works
- analytics and tracing exist
- abuse/security cases exist
- deep links work
- Quanty behavior is policy-correct where applicable
- cross-app handoffs are tested
- no fake seed data is used as production truth
- failure recovery is verified

# 4. Muse execution order

Phase A: C01 + C02 foundation
Phase B: C03 + C04 + C05 community graph
Phase C: C07 realtime calls
Phase D: C08 QuantMeet media/collaboration plane
Phase E: C06 camera/AR/stories
Phase F: C09 search
Phase G: C10 Quanty
Phase H: C11 notifications
Phase I: C12 privacy/devices
Phase J: C13 admin/operations

No phase may implement a local shortcut that violates the shared ecosystem contracts in:
- ecosystem resource contract
- capability registry
- context envelope
- event spine
- identity/security
- credits ledger
- governed memory.

# 5. Non-negotiable UX law

The user journey must feel continuous:

chat → camera → story/media → community → call → QuantMeet → collaboration → Quanty → Drive/Calendar/Mail/Git → back to Chat.

If any transition feels like opening an unrelated product, the architecture or navigation contract is incomplete.
