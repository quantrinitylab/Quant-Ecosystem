# QuantChat — WebRTC, SFU & QuantMeet Media Architecture

**Status:** Target-state media-plane contract  
**Scope:** C07 Calls + C08 QuantMeet + Discord-class voice/stage + screen share + captions + recording + translation + device handoff.

## 1. Media-plane thesis

QuantChat uses one media architecture for:
- 1:1 voice/video
- group calls
- community voice
- stage/broadcast audio
- QuantMeet
- screen sharing
- camera effects
- captions/translation
- recording
- breakout rooms.

Signaling and durable meeting state belong to QuantChat. WebRTC carries media. The SFU selectively forwards encrypted media streams. TURN provides relay fallback. Recording/transcription are explicit authorized processing paths.

The architecture must scale from a two-person call to large communities and Meet rooms without creating separate incompatible media systems.

## 2. Control plane vs media plane

### Control plane
Owns:
- identity
- authorization
- call/meeting state
- participant roles
- room policy
- admission
- moderation
- device state
- recording consent
- captions policy
- resource references.

### Media plane
Owns:
- ICE
- DTLS-SRTP
- RTP/RTCP
- simulcast/SVC
- SFU forwarding
- bandwidth estimation
- congestion control
- media quality
- TURN relay
- active track routing.

Never store live media state only in the browser.

## 3. Session topology

Default:

Client
→ Signaling Gateway
→ ICE/STUN/TURN negotiation
→ nearest healthy SFU
→ selected participant tracks.

For two-party low-latency calls, direct P2P may be considered where policy, NAT and quality permit.

For group/Meet:
Client → SFU.

For very large stages:
speaker/presenter → SFU → selective downstream layers.

## 4. Global media regions

Media placement considers:
- participant geography
- network latency
- room policy
- regulatory requirements
- current SFU capacity
- failover region.

Room placement is sticky while healthy.

A room migration requires supported renegotiation/handoff; clients must not assume a fixed SFU forever.

## 5. ICE architecture

Gather:
- host candidates
- server-reflexive candidates
- relay candidates.

Use STUN for discovery and TURN for restrictive NAT/firewall conditions.

TURN credentials are short-lived and scoped.

Never embed permanent TURN credentials in clients.

## 6. DTLS-SRTP

WebRTC media uses authenticated encrypted transport.

Control-plane authorization is separate from media encryption.

Participant identity must be bound to the authorized room/device identity so that an authenticated user cannot simply claim another participant's role.

## 7. SFU architecture

SFU responsibilities:
- receive RTP
- validate session/track authorization
- forward selected layers
- enforce room/participant policies
- adapt forwarding to subscriber capabilities
- report quality telemetry
- avoid unnecessary transcoding.

SFU should not decode media for ordinary forwarding.

Recording/transcription/moderation pipelines are separate authorized consumers.

## 8. Simulcast

Camera publishers may send multiple quality layers:
low
medium
high.

SFU chooses the layer per subscriber based on:
- viewport
- device
- bandwidth
- CPU
- network loss
- active speaker state
- presentation mode.

Mobile should not receive 1080p for a tiny participant tile when a low layer is sufficient.

## 9. SVC

Where supported, scalable video coding allows spatial/temporal adaptation with fewer independent encodes.

Client capability negotiation decides whether simulcast or SVC is used.

Fallback to a single stream is mandatory for incompatible clients.

## 10. Audio architecture

Audio prioritizes:
- low latency
- intelligibility
- echo cancellation
- noise suppression
- automatic gain control
- active speaker detection.

Voice rooms/stages may use audio-only optimization.

Stage mode separates:
- speakers
- invited speakers
- audience
- moderators.

Audience uplink is disabled unless explicitly promoted.

## 11. Active speaker

Server-assisted active-speaker state can combine:
- RTP audio levels
- client telemetry
- speaking permissions.

Do not use active-speaker state as a security decision.

UI receives stable participant state with debouncing to avoid rapid speaker flicker.

## 12. Screen sharing

Screen share is a first-class track.

Track types:
camera
microphone
screen
system audio where supported
presentation media.

Controls:
- share entire screen
- window
- tab where supported
- stop sharing
- presenter promotion.

Screen-share permission is evaluated server-side and by the operating system.

## 13. QuantMeet presentation mode

Presenter layout:
- primary presentation
- speaker strip
- participant count
- meeting controls.

SFU forwards the selected presentation layer separately from camera tracks.

If presentation stops, room automatically restores prior layout state without dropping the meeting.

## 14. Breakout rooms

Breakout lifecycle:
created
→ assigned
→ open
→ active
→ closing
→ merged.

A breakout room is a logical media/control room.

Participant assignment is durable meeting state.

Media sessions are ephemeral and recreated on reconnect.

Host can broadcast a message to all breakouts through control plane.

## 15. Device handoff

Supported:
phone ↔ web
phone ↔ Tauri
web ↔ Tauri
phone ↔ phone where policy permits.

Handoff:
new device authenticates
→ requests scoped meeting/call handoff
→ current device approves or user confirms
→ new device joins
→ media migrates
→ old device leaves or becomes secondary.

No account master token is transferred.

## 16. Reconnect

States:
healthy
degraded
reconnecting
recovered
failed.

On network change:
- preserve meeting identity
- rebuild ICE
- reconnect signaling if required
- renegotiate tracks
- restore selected quality layer
- restore mute/share state from authoritative room state.

Do not create duplicate participants on reconnect.

## 17. Network adaptation

Inputs:
RTT
packet loss
jitter
available bitrate
RTCP feedback
CPU pressure
battery state where available
viewport size.

Adapt:
resolution
frame rate
bitrate
audio quality
simulcast layer
screen-share quality.

Audio receives priority over video under congestion.

## 18. Quality scoring

Per participant:
connection state
RTT
jitter
loss
send bitrate
receive bitrate
frames dropped
audio concealment
codec
selected layer.

Room-level:
join success
time to first media
reconnect rate
median RTT
poor-quality participant percentage
SFU CPU/network saturation.

Quality scores are operational signals, not user reputation.

## 19. Captions

Caption pipeline:
audio track
→ authorized speech-to-text
→ timestamped caption segments
→ room distribution.

Modes:
local captions
meeting captions
translated captions.

Privacy:
caption processing requires policy/consent appropriate to the room.

E2EE-sensitive calls should not silently send protected audio to a server transcription service.

## 20. Translation

Translation pipeline:
authorized caption segment
→ language model/translation service
→ translated segment
→ target participants.

Original language remains available where policy permits.

Translation is explicitly indicated as generated content.

## 21. Recording

Recording state:
requested
→ consent check
→ preparing
→ recording
→ stopping
→ processing
→ ready
or failed.

Recording must have:
- explicit policy
- consent/notification behavior
- retention
- owner
- object reference
- Drive handoff.

Recording is not enabled merely because the operator has technical access.

## 22. QuantMeet recording architecture

Recorder may subscribe to selected SFU tracks through an authorized media consumer.

Pipeline:
SFU selected tracks
→ recorder
→ encrypted media segments
→ mux/transcode
→ moderation/privacy checks
→ QuantDrive artifact
→ meeting event.

Original participant media is not exposed to arbitrary backend services.

## 23. Live transcription

For meetings that explicitly enable transcription:
selected audio
→ STT
→ timestamped transcript segments
→ participant-visible transcript
→ optional Drive artifact
→ optional Quanty meeting context.

Quanty receives only the authorized transcript/context scope.

## 24. Quanty Meeting Copilot

Modes:
- local/private
- meeting-authorized
- moderator
- post-meeting.

Capabilities:
- summarize
- extract decisions
- identify action items
- draft follow-up
- answer meeting-context questions
- prepare Calendar/Mail/Drive actions.

Side effects require the normal Quanty approval/risk pipeline.

## 25. Camera effects / AR

Camera pipeline:
camera capture
→ local segmentation/face mesh
→ lens graph
→ GPU render
→ encoded track.

Where possible, effects execute on-device.

Server does not need raw camera frames for ordinary lenses.

QuantMeet supports:
- background effects
- avatars
- face effects
- spatial/3D presentation where supported.

## 26. 3D/spatial media

Architecture must allow future:
- 3D avatars
- spatial audio
- immersive stages
- virtual rooms
- WebGPU presentation.

Spatial features are capability-negotiated.

A non-spatial fallback is mandatory.

Do not make 3D a prerequisite for joining a meeting.

## 27. Recording consent UI

Before recording:
- visible indicator
- participant notification
- policy statement
- consent behavior where required.

During recording:
persistent recording indicator.

After recording:
owner
retention
sharing
download
deletion controls.

## 28. Moderation

Realtime moderation can operate on:
- metadata
- participant reports
- audio/video signals where the user explicitly enables supported safety processing
- public/server-readable content.

Do not silently bypass E2EE.

Moderator actions:
mute
remove
restrict
lock room
end room
disable chat
disable screen share.

Each action is capability- and policy-bound.

## 29. Security

Signaling authorization:
room membership + device/session + capability.

SFU authorization:
short-lived room/track token.

TURN:
short-lived scoped credentials.

Recording:
separate scoped authorization.

Admin:
no generic room master token.

All media/control transitions are auditable without storing unnecessary media content.

## 30. API contract

POST /api/v1/chat/calls/prepare
POST /api/v1/chat/calls
POST /api/v1/chat/calls/{callRef}/join
POST /api/v1/chat/calls/{callRef}/leave
POST /api/v1/chat/calls/{callRef}/renegotiate

POST /api/v1/chat/meetings
POST /api/v1/chat/meetings/{meetingRef}/join
POST /api/v1/chat/meetings/{meetingRef}/leave
POST /api/v1/chat/meetings/{meetingRef}/breakouts
POST /api/v1/chat/meetings/{meetingRef}/handoff
POST /api/v1/chat/meetings/{meetingRef}/recording
POST /api/v1/chat/meetings/{meetingRef}/captions
POST /api/v1/chat/meetings/{meetingRef}/translation

Signaling messages:
join
offer
answer
ice-candidate
renegotiate
track-published
track-unpublished
mute-state
quality-update
handoff
leave.

## 31. Media session state

Participant:
invited → admitted → connecting → connected → degraded → reconnecting → connected/left.

Track:
published → negotiating → active → paused → failed → unpublished.

Recording:
requested → consent_pending → active → processing → ready/failed.

## 32. Redis / realtime state

Redis may hold:
participant presence
active track routing
typing/ephemeral states
short-lived room coordination
rate limits
TURN credential state.

Durable meeting state stays PostgreSQL.

## 33. Observability

Metrics:
call setup time
meeting join time
time to first media
ICE success
TURN usage
SFU CPU
SFU network
packet loss
RTT
jitter
reconnect rate
track failure
caption latency
translation latency
recording processing latency.

Distributed traces connect:
API → signaling → SFU control → recorder → Drive artifact.

## 34. Failure handling

No TURN:
try alternate candidate path; fail with actionable network state.

SFU unhealthy:
mark degraded; migrate/renegotiate where supported; otherwise reconnect.

Signaling lost:
media may continue briefly; control actions pause; reconnect signaling.

Publisher failure:
subscriber sees track failed and retry state.

Recorder failure:
meeting continues; recording status becomes failed and user is notified.

Caption failure:
meeting continues without captions.

Translation failure:
original captions continue if available.

Handoff failure:
original device remains connected.

## 35. Platform UX

### Mobile / Capacitor
- pre-call device check
- participant grid optimized for small screens
- speaker-focused mode
- swipe participant controls
- compact meeting controls
- picture-in-picture where OS permits
- background audio policy
- battery/network awareness.

### Web
- adaptive grid
- presenter mode
- participant side panel
- screen-share controls
- keyboard shortcuts
- live captions
- breakout manager.

### Tauri
- multi-window meeting
- native screen-share selection
- persistent call controls
- system audio/device switching.

### QuantMeet
- dedicated stage/presenter workspace
- breakout control
- meeting chat
- whiteboard/artifacts
- recording/caption panels
- Quanty copilot.

## 36. Accessibility

- keyboard-call controls
- screen-reader participant labels
- caption-first fallback
- visible mute/share/record states
- reduced motion
- high-contrast speaker indicators
- accessible breakout controls
- no audio-only information without equivalent visual indication when needed.

## 37. Load/scaling model

Target scaling dimensions:
- concurrent calls
- participants per room
- tracks per participant
- SFU regions
- signaling connections
- TURN bandwidth
- recording throughput
- caption throughput.

Large rooms use:
regional SFU placement
selective forwarding
simulcast/SVC
active-speaker optimization
stage/audience separation
bounded control fanout.

Do not broadcast every participant's every state change to every client.

## 38. Muse implementation sequence

MEDIA-01 WebRTC abstraction + capability negotiation.
MEDIA-02 signaling gateway.
MEDIA-03 STUN/TURN credential service.
MEDIA-04 SFU integration and room authorization.
MEDIA-05 1:1/group calls.
MEDIA-06 QuantMeet rooms.
MEDIA-07 simulcast/SVC/adaptive quality.
MEDIA-08 screen sharing/device handoff.
MEDIA-09 breakouts/stage/voice.
MEDIA-10 captions/translation.
MEDIA-11 recording/Drive pipeline.
MEDIA-12 camera/AR/3D media.
MEDIA-13 observability/load testing.
MEDIA-14 failure drills and security hardening.

## 39. Media security invariant

**WebRTC encrypts transport, SFU selectively forwards, QuantChat authorizes participants, and every higher-level processing path—recording, transcription, translation or AI—requires its own explicit policy boundary.**

## 40. QuantMeet product invariant

**A QuantMeet room is not a separate app. It is a first-class QuantChat media/session domain that can be entered from a DM, group, community, calendar event or ecosystem handoff and can produce governed Drive/Mail/Calendar/Quanty artifacts.**
