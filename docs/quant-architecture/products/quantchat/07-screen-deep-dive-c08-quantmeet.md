# QuantChat C08 — QuantMeet Deep Screen Architecture

**Status:** Target-state architecture / implementation contract
**Scope:** C08 QuantMeet inside QuantChat
**Product law:** QuantMeet is not a tenth app and not a separate consumer product. It is the conferencing and collaboration subsystem of QuantChat.

## 0. Why C08 is a first-class architecture slice

QuantChat unifies WhatsApp + Telegram + Snapchat + Discord + QuantMeet. C08 is therefore the point where a normal communication session becomes a high-capacity collaboration session without forcing the user into a disconnected product.

Canonical escalation:

chat -> voice call -> video call -> QuantMeet room -> scheduled meeting -> breakout rooms -> recording/notes -> QuantDrive meeting space -> Quanty recap -> QuantCalendar/Mail/Chat follow-up.

Ownership remains strict:
- QuantChat owns meeting-session state, participants, roles, signaling metadata, chat-in-meeting, reactions, meeting policy and moderation state.
- QuantCalendar owns calendar events, recurrence, invitations and scheduling truth.
- QuantDrive owns recordings, transcripts, shared meeting files and durable artifacts.
- QuantMail owns email invitations and outbound email.
- QuantContacts owns people/contact truth.
- QuantTrinity owns credits/economy ledger.
- Quanty owns governed AI orchestration and derived outputs, never the canonical meeting record.

No database crosses these boundaries. Cross-app references use QuantResourceRef and QuantContextEnvelope.

---

# 1. C08 screen inventory

C08 is implemented as a family of coordinated screens rather than one monolithic page.

| Screen | Purpose | Primary surfaces |
|---|---|---|
| C08.1 Meet Lobby | Discover/join/start a meeting | Mobile, Web, Tauri |
| C08.2 Join Gate | Identity, device, permissions, policy | All |
| C08.3 Pre-Meeting Studio | Camera/mic, background, effects, captions, speaker | All |
| C08.4 Active Meeting | Main media/collaboration canvas | All |
| C08.5 Participant Grid | Gallery, speaker, pinned content | All |
| C08.6 Stage / Presenter | Stage roles and audience controls | All |
| C08.7 Meeting Chat | In-meeting conversation and shared resources | All |
| C08.8 Share / Present | Screen, window, tab, camera, file | Web/Tauri/mobile limited |
| C08.9 Breakout Control | Rooms, assignment, timers, broadcasts | Host/co-host |
| C08.10 Whiteboard / Collaboration | Shared visual workspace | Web/Tauri, mobile companion |
| C08.11 Captions / Translation | Live transcript and language rendering | All |
| C08.12 Recording / Consent | Recording state, consent, storage target | All |
| C08.13 Meeting Info / Security | Room identity, lock, permissions, safety | All |
| C08.14 Device & Network | Transport and hardware diagnostics | All |
| C08.15 Quanty Meeting Copilot | Governed AI actions and recap | All |
| C08.16 Post-Meeting | Recap, artifacts, follow-up actions | All |

The screen contract is incomplete until each screen has data ownership, server authorization, realtime reconciliation, offline/degraded behavior, accessibility, telemetry, abuse controls, tests and failure recovery.

---

# 2. C08.1 Meet Lobby

## Mobile
- Top: current QuantChat identity and compact meeting status.
- Primary action: Start instant meeting.
- Secondary: Join with link/code.
- Recent meeting cards are projections from QuantChat; no fake meetings.
- Scheduled meetings are fetched from QuantCalendar projection and clearly labeled as calendar-owned.
- Quick actions: Join next, create scheduled meeting, continue recent room.
- Bottom navigation remains QuantChat navigation; entering Meet is an in-context route transition.

## Web/Tauri
- Two-column layout: upcoming/scheduled meetings left, meeting launch controls right.
- Recent rooms and reusable room policies are shown only when authorized.
- Tauri may expose native device diagnostics and window sharing.
- Web uses browser permission APIs and browser share capabilities.

## Muse placement
- Muse is not a floating generic chatbot.
- A small contextual control appears beside the meeting action area.
- Before start: "Prepare meeting" can check agenda context from authorized Calendar/Mail/Drive refs.
- It must show exactly what context will be used.
- No silent access to unrelated conversations.

---

# 3. C08.2 Join Gate

Join is a state machine:

requested -> resolving -> authenticated -> policy-check -> device-check -> admitted | waiting-room | denied | expired.

Checks:
1. authenticated Quant identity
2. meeting token/signature validity
3. participant permission
4. room lock/waiting-room policy
5. device permission availability
6. moderation/safety policy
7. network viability

Never trust role claims from the client. Server signs authoritative admission state.

Security:
- short-lived join credentials
- audience/room binding
- nonce replay protection
- server-side role evaluation
- explicit waiting-room transition
- revoked participant tokens rejected
- meeting links do not grant broader ecosystem permissions.

---

# 4. C08.3 Pre-Meeting Studio

Shared foundation with C06 camera, but meeting-owned controls.

Controls:
- camera preview
- microphone meter
- speaker test
- camera selection
- mic selection
- speaker selection
- background blur/image
- approved effects/lenses
- avatar fallback
- captions language
- translation target
- device handoff
- network quality
- join muted/camera-off preferences

Mobile uses a vertically stacked preview with bottom sheet controls.
Web/Tauri use a large preview canvas with a persistent device rail.
All platforms must preserve the same capability model, not identical pixel layouts.

Muse:
- can suggest "turn captions on" when accessibility settings indicate a need, but cannot silently enable capture.
- can help troubleshoot device selection.
- can preview an agenda or authorized Drive artifact before joining.
- cannot read raw microphone/camera streams unless the meeting explicitly grants a defined AI media capability.

---

# 5. C08.4 Active Meeting

## Core layout

Desktop:
- central adaptive media canvas
- left optional participant rail
- right contextual rail for chat, participants, resources or Quanty
- bottom control dock
- top room/security/status bar

Mobile:
- dominant speaker/content surface
- swipeable participant strip
- bottom control dock
- sheets for chat, participants, captions and resources

Tauri:
- desktop layout plus native window sharing, system audio where supported, tray/notification integration and multi-window behavior.

Web:
- permission-safe browser implementation, with capability detection and fallback messaging.

## Control dock
- mute/unmute
- camera
- device selector
- participants
- chat
- share
- captions
- reactions
- raise hand
- more
- leave

Host/co-host additionally:
- admit
- mute policy
- remove
- lock room
- spotlight
- stage
- breakout
- recording
- moderation

No control is shown as available if the server capability projection says it is forbidden.

---

# 6. C08.5 Participant Grid

Modes:
- active speaker
- gallery
- focused participant
- content + people
- stage

Participant tile contains:
- display identity from Contacts/Identity projection
- mic state
- camera state
- speaking indicator
- network quality indicator
- hand/reaction state
- role badge
- moderation affordance only for authorized users

Never expose private contact fields merely because a user is present in a meeting.

Virtualization is mandatory for large rooms. The UI must not instantiate heavy video rendering for off-screen tiles.

---

# 7. C08.6 Stage / Presenter

Stage is a role/capability model, not a visual-only feature.

Roles:
- host
- co-host
- presenter
- speaker
- attendee
- moderator
- interpreter
- producer

State transitions:
requested -> invited -> on-stage -> speaking -> off-stage.

Stage actions emit authoritative commands. Clients optimistically animate but reconcile with server events.

For broadcast-scale rooms, the media plane may separate presenter streams from audience receive paths.

---

# 8. C08.7 Meeting Chat

Meeting chat is a QuantChat conversation surface scoped to a meeting session.

Modes:
- everyone
- hosts/co-hosts
- direct participant
- thread/reply
- resource attachment

Messages are governed by QuantChat message rules and can reference:
- QuantDrive files
- QuantCalendar event
- QuantMail invitation
- QuantGit PR/issue
- other authorized Quant resources

A meeting chat message contains a typed resource reference, never an opaque cross-database foreign key.

Meeting chat can continue into the associated QuantChat conversation when policy permits; the UI must clearly show the destination and retention policy.

---

# 9. C08.8 Share / Present

Supported sources depend on platform:
- entire screen
- application window
- browser tab
- camera
- authorized Drive file
- whiteboard
- presentation artifact

Pipeline:
request -> capability check -> user consent -> media acquisition -> publish -> quality adaptation -> stop -> audit event.

Screen capture is always user-consented. No background capture.

Tauri may use native capture APIs; Web uses browser capture; mobile supports the platform's approved screen-share APIs where available.

Shared content has independent media state and can be spotlighted without forcing every participant into the same layout.

---

# 10. C08.9 Breakout Control

Host/co-host view:
- room list
- participant assignment
- automatic/manual assignment
- timer
- broadcast message
- close all rooms
- request help
- return-to-main state

Participant view:
- current room
- timer
- return request
- host contact
- room chat

State:
planned -> open -> active -> closing -> closed.

Assignment is server-authoritative and idempotent. A reconnecting participant resolves their current room from server state.

---

# 11. C08.10 Whiteboard / Collaboration

Whiteboard is a collaboration surface owned by the meeting session but durable artifacts belong in QuantDrive.

Realtime model:
- ephemeral cursor/presence
- operation-based drawing/document updates
- durable snapshots
- conflict-aware merge
- checkpoint events

Users can export/save to QuantDrive. The saved Drive artifact receives a QuantResourceRef.

Mobile is a companion/editor surface optimized for touch. Desktop/Web provide the full canvas.

---

# 12. C08.11 Captions and Translation

Pipeline:

media stream -> consent/policy -> speech processing -> caption segments -> translation projection -> participant render.

Requirements:
- speaker attribution where authorized
- language selection
- translated captions
- caption size controls
- high-contrast mode
- transcript pause/disable
- explicit retention policy

Live captions may be ephemeral. Durable transcript storage requires explicit policy/consent and creates a Drive artifact owned by QuantDrive.

Quanty can summarize captions only when the meeting policy grants that capability.

---

# 13. C08.12 Recording / Consent

Recording is a controlled state machine:

off -> requesting-consent -> recording -> paused -> stopping -> finalizing -> Drive-artifact-ready | failed.

Requirements:
- visible recording indicator
- participant notification
- policy-specific consent
- host authorization
- pause/resume semantics
- failure-safe finalization
- retention policy
- deletion/revocation propagation

Raw recording bytes are stored by QuantDrive/R2 infrastructure, not in the QuantChat relational database.

Recording metadata remains referenced by the meeting session through a typed resource reference.

Never imply that recording is active merely because the UI button was clicked. Server state is authoritative.

---

# 14. C08.13 Meeting Info / Security

Security sheet:
- meeting ID
- room lock state
- waiting room
- encryption/media security status
- participant permissions
- report/block tools
- link rotation
- host/co-host list
- recording/caption policy
- data retention summary

The UI must distinguish:
- transport/media security
- end-to-end encrypted chat
- server-assisted conferencing
- AI processing permissions

Do not make blanket "end-to-end encrypted meeting" claims unless the exact media architecture and participant/device constraints support it.

---

# 15. C08.14 Device & Network

Diagnostics:
- microphone input
- camera
- speaker output
- packet loss
- RTT
- jitter
- bitrate
- codec
- selected route
- connection type
- SFU region
- reconnect count

Quality state:
excellent -> good -> degraded -> critical -> disconnected.

Adaptive policy:
- lower video resolution first
- lower frame rate
- reduce non-essential streams
- switch simulcast layer
- preserve audio
- reconnect/migrate SFU if needed

The user sees actionable language, not raw metrics alone.

Example:
"Network unstable. QuantMeet is keeping audio priority and reducing video quality."

---

# 16. C08.15 Quanty Meeting Copilot

Quanty has six explicit modes:

1. Pre-meeting
   - agenda preparation
   - authorized context retrieval
   - participant brief

2. In-meeting
   - action capture
   - definitions/clarification
   - controlled Q&A
   - translation/help

3. Moderator
   - moderation suggestions
   - spam/abuse signals
   - queue assistance

4. Collaboration
   - summarize whiteboard
   - organize decisions
   - draft action items

5. Post-meeting
   - recap
   - decisions
   - action items
   - unanswered questions

6. Follow-up
   - draft Mail
   - create Calendar follow-up
   - save Drive recap
   - send Chat task/reminder
   - reference QuantGit work when explicitly requested

Quanty is capability-scoped. Every action must carry:
- actor
- meeting ID
- capability
- input resource refs
- policy decision
- output resource refs
- provenance
- audit event

Quanty cannot silently:
- record
- invite people
- send email
- modify calendar
- edit Drive artifacts
- change meeting roles
- expose private participant data.

---

# 17. C08.16 Post-Meeting

Post-meeting screen is an artifact hub.

Sections:
- meeting summary
- decisions
- action items
- transcript/captions if retained
- recording if retained
- whiteboard
- shared files
- participant list
- follow-up suggestions

Every durable item links to its owning product.

Example flow:
"Save recap" -> QuantDrive artifact.
"Schedule follow-up" -> QuantCalendar command.
"Email attendees" -> QuantMail command.
"Discuss action item" -> QuantChat conversation.
"Create engineering task" -> QuantGit command.

The UI must show the destination before execution.

---

# 18. Media architecture

QuantMeet uses:
- WebRTC for client media
- STUN/TURN for connectivity
- SFU for multiparty distribution
- simulcast/SVC where supported
- adaptive bitrate
- congestion control
- active speaker detection
- optional server-side media processing for captions/recording when policy permits

Media plane is separated from the durable control plane.

Control plane:
- meeting session
- participants
- roles
- policy
- chat
- commands
- events

Media plane:
- audio/video tracks
- screen shares
- data channels
- SFU routing

Storage plane:
- Drive/R2 recordings
- transcripts
- whiteboards
- exported artifacts

---

# 19. Meeting state model

Meeting:
created -> scheduled -> open -> live -> closing -> ended -> archived.

Participant:
invited -> joining -> waiting -> admitted -> connected -> reconnecting -> disconnected -> removed/left.

Track:
requested -> acquiring -> publishing -> active -> degraded -> stopped -> failed.

Recording:
off -> consent -> active -> finalizing -> stored/failed.

Breakout:
planned -> active -> closing -> closed.

All state transitions are versioned and reconciled through server events.

---

# 20. API contract

Representative routes:

GET /api/meetings
POST /api/meetings
GET /api/meetings/:meetingId
POST /api/meetings/:meetingId/join
POST /api/meetings/:meetingId/leave
POST /api/meetings/:meetingId/participants/:id/admit
POST /api/meetings/:meetingId/participants/:id/remove
POST /api/meetings/:meetingId/roles
POST /api/meetings/:meetingId/stage
POST /api/meetings/:meetingId/breakouts
POST /api/meetings/:meetingId/share
POST /api/meetings/:meetingId/recording
POST /api/meetings/:meetingId/captions
GET /api/meetings/:meetingId/diagnostics
POST /api/meetings/:meetingId/quanty/actions
GET /api/meetings/:meetingId/artifacts

All mutations require:
- authenticated identity
- capability authorization
- idempotency key for retryable commands
- meeting version/concurrency check where required
- audit event
- typed error response

WebSocket topics:
meeting.presence
meeting.participant
meeting.role
meeting.stage
meeting.chat
meeting.reaction
meeting.hand
meeting.breakout
meeting.share
meeting.caption
meeting.recording
meeting.policy
meeting.device
meeting.quality
meeting.lifecycle

Media signaling is not treated as durable chat state.

---

# 21. Data model

Core QuantChat-owned entities:
- Meeting
- MeetingParticipant
- MeetingRole
- MeetingPolicy
- MeetingInviteRef
- MeetingRoom
- BreakoutRoom
- StageSession
- MeetingChatBinding
- MeetingReaction
- MeetingHandRaise
- MeetingShareSession
- MeetingCaptionSession
- MeetingRecordingRef
- MeetingArtifactRef
- MeetingAuditEvent

External references:
- CalendarEventRef
- DriveFileRef
- MailMessageRef
- ContactRef
- GitResourceRef

No raw external primary keys are embedded as domain ownership shortcuts.

---

# 22. Cross-app connection contract

### QuantCalendar
Scheduled meeting is created through Calendar. C08 receives a typed calendar resource projection.

### QuantDrive
Recording, transcript, whiteboard export and recap are Drive artifacts.

### QuantMail
Calendar/meeting invitation email is requested through Mail; C08 never becomes the email source of truth.

### QuantContacts
Participant identity and contact relationships come from Contacts/Identity.

### QuantGit
Action items can deep-link or invoke authorized Git commands. C08 stores only the reference.

### QuantTrinity
Premium meeting capabilities, storage/recording add-ons, creator features or other metered operations consume credits through the economy contract. The meeting UI never invents or directly mutates balances.

### Quanty
C08 exposes meeting capabilities through the capability registry and returns governed outputs with provenance.

---

# 23. Realtime and offline behavior

The meeting itself is realtime-first. Durable meeting metadata remains server-authoritative.

Offline:
- show disconnected state
- preserve local UI state
- do not fake participant presence
- queue only explicitly retry-safe commands
- never queue role changes or destructive actions without policy support
- reconnect through fresh join/session credentials
- reconcile participant and room state from server version

Chat messages may use QuantChat's normal offline queue where applicable. Media does not use a fake offline queue.

---

# 24. Accessibility

Required:
- full keyboard navigation on Web/Tauri
- screen-reader labels
- focus trap for sheets/dialogs
- visible focus state
- captions
- translated captions where supported
- reduced motion
- high contrast
- large controls
- non-color-only role/status indicators
- audio-only fallback
- text alternatives for shared content where available

Mobile:
- touch targets sized for one-handed operation
- safe-area handling
- TalkBack/VoiceOver announcements for mute/camera/connection changes

---

# 25. Safety and privacy

Required controls:
- report participant
- block
- remove
- mute
- lock room
- waiting room
- host transfer
- abuse rate limits
- link revocation
- recording consent
- retention policy
- data export/deletion hooks
- moderation audit

AI safety:
- Quanty receives minimum useful context
- raw meeting content is not automatically durable memory
- sensitive inference is not written as permanent profile truth
- meeting summaries are labeled derived outputs
- user can inspect action inputs/targets before high-impact actions.

---

# 26. Failure matrix

| Failure | Required behavior |
|---|---|
| Camera denied | stay in meeting audio-only |
| Mic denied | show clear permission recovery |
| SFU degraded | adapt quality, preserve audio |
| SFU unavailable | reconnect/migrate when possible |
| Signaling lost | freeze authoritative state, reconnect |
| Participant reconnects | server reconciliation, not local ghost state |
| Recording upload fails | show finalization failure and retry path |
| Caption service fails | meeting continues without captions |
| Translation fails | original captions remain |
| Calendar unavailable | meeting can continue; scheduling action unavailable |
| Drive unavailable | meeting continues; artifact save marked pending/failed |
| Quanty unavailable | meeting continues; AI controls disappear/degrade |
| Network critical | audio priority + explicit reconnect state |
| Host disconnects | server-defined host transfer policy |
| Browser unsupported | explain missing capability and offer fallback |

---

# 27. Performance targets

Targets are measured, not assumed:
- first meeting UI interactive before media connection completes
- participant grid virtualized
- no unnecessary camera decode for off-screen tiles
- adaptive bitrate under congestion
- control actions remain responsive during media degradation
- reconnect should preserve meeting identity when session policy permits
- diagnostics must be sampled, not flood telemetry
- client telemetry batches non-critical events

The implementation must add real performance measurements before claiming these targets are met.

---

# 28. Test matrix

Unit:
- state machines
- capability checks
- permission evaluation
- idempotency
- meeting resource refs
- role transitions

Integration:
- join/admit/leave
- host transfer
- breakout lifecycle
- screen share
- recording
- captions
- device handoff
- Quanty action authorization
- Calendar/Drive/Mail handoffs

Realtime:
- reconnect
- duplicate events
- out-of-order events
- stale participant state
- network degradation
- SFU migration

Security:
- forged join token
- expired token
- wrong-room token
- role escalation
- replay
- unauthorized recording
- unauthorized artifact access
- cross-tenant resource reference
- prompt/context injection through meeting content

Accessibility:
- keyboard-only
- screen reader
- reduced motion
- high contrast
- captions
- touch target checks

E2E:
- DM -> call -> Meet
- Calendar -> Meet
- Meet -> Drive recording
- Meet -> Quanty recap -> Chat
- Meet -> Mail follow-up
- Meet -> Git action reference

---

# 29. Muse implementation sequence

C08-A: meeting domain/state model and capability contract.
C08-B: lobby/join gate/pre-meeting device studio.
C08-C: WebRTC signaling and SFU integration.
C08-D: active meeting desktop/mobile shells.
C08-E: participant/stage/roles.
C08-F: meeting chat and resource cards.
C08-G: screen share and presentation.
C08-H: captions/translation.
C08-I: recording/Drive artifact pipeline.
C08-J: breakout rooms.
C08-K: whiteboard/collaboration.
C08-L: device/network diagnostics.
C08-M: Quanty meeting copilot.
C08-N: post-meeting artifact/follow-up flow.
C08-O: security/accessibility/performance hardening.

For every implementation slice Muse must:
1. inspect existing code first
2. identify reusable QuantChat/C06/C07 infrastructure
3. implement one coherent vertical slice
4. add tests
5. run affected validation
6. inspect UI/runtime behavior
7. document evidence and remaining gaps
8. never add fake meeting data to hide missing backend behavior.

---

# 30. C08 definition of done

C08 is complete only when:
- all C08 screens have responsive UI contracts
- mobile/Web/Tauri behavior is specified
- Capacitor uses the mobile contract without creating a second architecture
- media/control/storage planes are separated
- server authorization is authoritative
- meeting state reconciles after reconnect
- recording and transcript retention are explicit
- Quanty is capability-scoped
- Calendar/Drive/Mail/Contacts/Git integrations use typed references
- accessibility and failure paths are implemented
- no fake production data is used
- security tests cover join/role/recording/resource boundaries
- performance is measured
- observability exists
- runtime evidence is recorded before any production-readiness claim.

## C08 architectural invariant

**A QuantMeet room is a governed communication session inside QuantChat: the room can orchestrate the ecosystem, but it never becomes the owner of the ecosystem's identity, calendar, email, files, code, memory or economy.**
