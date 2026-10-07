# QuantChat — Screen Deep Dive: C07 Calls

C07 is the unified calling surface for WhatsApp-class 1:1 calls, Telegram-style multi-device calling, Discord-style group voice, and the escalation path into QuantMeet. It is one call domain with multiple media topologies.

## 1. Product role

C07 handles 1:1 voice, 1:1 video, small group calls, community voice, stage/speaking sessions, device handoff, screen sharing, captions, translation, effects/avatar, authorized recording, escalation to QuantMeet, and post-call artifacts.

Call state is owned by QuantChat. Calendar owns scheduled events. Drive owns durable recordings/transcripts exported as files. Identity/Contacts own people and devices.

## 2. Call UX philosophy

The user should never feel that starting a call launches a different product.

Primary escalation:
**message → voice → video → group call → QuantMeet**

Preserve participants, conversation/community context, permissions, device preferences, and authorized resource references.

## 3. Screen family

C07.1 Incoming Call
C07.2 Outgoing/Ringing
C07.3 Pre-Call Device Check
C07.4 Active 1:1 Call
C07.5 Active Group Call
C07.6 Community Voice
C07.7 Stage/Speaking Mode
C07.8 Screen Share
C07.9 Captions + Translation
C07.10 Device/Network Panel
C07.11 Call Participants
C07.12 Escalate to QuantMeet
C07.13 Recording/Consent
C07.14 Post-Call Summary

## 4. Platform UI contract

### Mobile
Incoming call uses a high-priority full-screen or compact system call surface according to OS policy.

Active call:
- remote video/content is the primary stage
- local preview is movable/resizable
- bottom controls stay reachable
- secondary controls open in sheets
- gestures are never the only route to critical controls

Control bar: mute, camera, speaker, effects, captions, add person, share, Quanty, more, end.

### Web
Main media stage + participant/context rail + persistent bottom controls.

Keyboard shortcuts include M mute, V camera, S screen share, C captions, Esc close secondary panel. End-call remains deliberately protected against accidental activation.

### Tauri
Use native device enumeration, system audio routing, keyboard shortcuts, background call notification and picture-in-picture.

### Capacitor
Use native audio route, Bluetooth/headset state, interruption handling and background call integration through platform adapters.

## 5. C07.1 Incoming Call

Information hierarchy:
1. caller identity
2. call type
3. trusted security state where applicable
4. shared conversation/community context
5. accept
6. decline
7. message/reply
8. block/report

Group calls show initiator, group/community name and participant count.

Never expose private profile information merely because a call arrives.

## 6. C07.2 Outgoing/Ringing

States:
PREPARING → RINGING → ACCEPTED → CONNECTING

Show participant identity, ringing duration, cancel, camera/device controls and optional unanswered message.

For multiple recipients, show invitation progress without revealing hidden participant information.

Offline recipients use server-authoritative invitation/notification policy rather than an endless client timer.

## 7. C07.3 Pre-Call Device Check

Check:
- camera preview
- microphone level
- speaker test
- input/output device
- Bluetooth/headset
- network quality
- permissions
- background/effect preview
- captions preference

Use human-readable states such as Camera: Ready, Microphone: Ready, Network: Good.

Recovery:
permission denied → OS guidance
device unavailable → alternate device
bad network → audio-only recommendation
browser incompatibility → supported-mode explanation

## 8. C07.4 Active 1:1 Call

Video:
- remote participant full stage
- local preview floating
- active speaker indicator
- connection-quality indicator
- optional shared resource strip

Voice:
- large avatar
- waveform/activity indicator
- call duration
- audio route
- contextual actions

Controls: Mute, camera, speaker/device, effects, captions, add, share, Quanty, more, end.

A non-intrusive **Open QuantMeet** action appears when the user needs screen sharing, larger capacity, agenda, breakout rooms, recording or collaboration.

## 9. C07.5 Active Group Call

Dynamic stage:
- active speaker
- participant grid
- pinned participant
- content-share stage
- hand-raise/reaction state where enabled

Layout:
2–4 participants → large tiles
5–9 → adaptive grid
10+ → active-speaker stage + virtualized participant strip
beyond topology limit → QuantMeet escalation

Presence is aggregated; per-frame participant state never enters the normal event spine.

## 10. C07.6 Community Voice

Discord-style persistent voice room:
- room name
- topic
- speakers
- listeners
- hand raise
- moderator controls
- stage escalation
- text chat
- resource panel

Joining is a membership action, not a message. Voice metadata is durable; media packets remain in the realtime media plane.

## 11. C07.7 Stage/Speaking Mode

Roles: host, moderator, speaker, listener.

State:
LISTENER → REQUESTED → APPROVED → SPEAKER → MUTED/REMOVED → LISTENER

Moderator actions require capability authorization. A client cannot promote itself by changing a role field.

## 12. WebRTC/media architecture

Media path:
Client → ICE/STUN/TURN → Peer or SFU → Remote clients

Use P2P only when topology/features make it appropriate.

Use SFU for 3+ participants, screen sharing, recording, server-side transcription, adaptive simulcast, large device diversity and QuantMeet escalation.

Application servers own signaling/session state, not media packets.

## 13. Adaptive media

Measure RTT, jitter, packet loss, bitrate, CPU, battery/thermal pressure, network and codec capability.

Adapt resolution, FPS, bitrate, simulcast layer, audio bitrate, camera-off and audio-only fallback.

Priority:
**speech intelligibility > video resolution > effects**

Bad networks degrade gracefully instead of abruptly ending calls.

## 14. Device handoff

Supported:
phone → desktop
desktop → phone
browser → app
app → browser

Handoff transfers session authority, not raw media streams.

Flow:
request handoff → authenticate target → negotiate new media path → confirm target → release old path

If handoff fails, original call remains alive.

## 15. C07.8 Screen Share

Sources: entire screen, window, browser tab, application surface where supported.

Always show a prominent **You are sharing** indicator and a visible stop action.

Before first full-screen share:
**Everything visible on this screen can be shared.**

Screen-share state is call-owned and expires with the session.

## 16. C07.9 Captions + Translation

Pipeline:
audio → speech recognition → speaker attribution → punctuation → policy filter → caption stream

Translation:
caption segment → language detection → translation → participant language

Controls: captions toggle, language, font size, background/transparency, speaker labels, transcript action.

Captions may be ephemeral. Durable transcripts require explicit meeting/recording policy.

## 17. C07.10 Device + Network Panel

Expose:
- input/output device
- camera
- connection quality
- current media quality
- data estimate
- battery impact
- diagnostics

Do not expose raw WebRTC logs to ordinary users. Provide an explicit Send diagnostics action.

## 18. C07.11 Participants

Participant panel:
- identity
- speaking state
- mute/video state where policy permits
- connection quality
- role
- invite/add
- remove/block/report where authorized

Large sessions use virtualized/paginated participant lists.

Search uses canonical identity rather than display-name-only matching.

## 19. C07.12 Escalate to QuantMeet

Escalate for participant threshold, screen sharing, recording, breakout rooms, agenda/collaboration, scheduled meeting, community event or AI meeting workflow.

Show an explanation:
**QuantMeet adds screen sharing, breakout rooms, recording and meeting notes.**

Transition:
Call session → QuantMeet room session

Preserve authorized participants, conversation/community reference, call context, caption/language preferences and relevant resources.

Create Calendar event only when explicitly scheduled.

## 20. C07.13 Recording + consent

Recording is opt-in and visibly indicated.

State:
OFF → REQUESTED → CONSENT_PENDING → RECORDING → STOPPING → FINALIZING → READY

All participants receive recording indication according to applicable policy.

Recording artifact:
QuantChat call/meeting metadata → encrypted media artifact → QuantDrive resource

Raw recording bytes never become message rows.

If recording fails, the call continues unless recording is a hard policy requirement.

## 21. C07.14 Post-Call Summary

Show duration, participants, call type, missed-call state, shared resources, optional transcript, optional recording, action items and follow-up suggestions.

For ordinary private calls, do not automatically create transcript or durable AI memory.

For QuantMeet-derived calls, meeting policy controls transcript/summary generation.

Actions: call again, message participants, create Calendar follow-up, save authorized notes to Drive, share resource, report issue.

## 22. Call state machine

IDLE → INVITED → RINGING → ACCEPTED → CONNECTING → CONNECTED → RECONNECTING → CONNECTED → ENDING → ENDED

Terminal failures:
DECLINED, MISSED, BUSY, PERMISSION_FAILED, DEVICE_FAILED, NETWORK_FAILED, POLICY_BLOCKED

Durable transitions are server-authoritative.

## 23. Realtime split

Durable:
call invitation, participant membership, call start/end metadata, recording consent, role changes, moderation actions and meeting escalation.

Ephemeral:
audio/video media, active speaker, transient network stats and camera preview state.

Use realtime gateway for signaling. Use WebRTC/SFU for media. Never push audio/video through Kafka or ordinary WebSocket messages.

## 24. Data model

Core entities:
Call
CallParticipant
CallDevice
CallSession
CallInvitation
MediaTrack
DeviceRoute
NetworkSample
ScreenShareSession
CaptionSession
TranslationSession
RecordingConsent
CallRecordingRef
CallEscalation
CallModerationAction

CallRecordingRef references the Drive resource instead of storing recording data.

## 25. API surface

- POST /v1/calls
- GET /v1/calls/{id}
- POST /v1/calls/{id}/accept
- POST /v1/calls/{id}/decline
- POST /v1/calls/{id}/end
- POST /v1/calls/{id}/participants
- DELETE /v1/calls/{id}/participants/{participantId}
- POST /v1/calls/{id}/handoff
- POST /v1/calls/{id}/screen-share
- DELETE /v1/calls/{id}/screen-share
- POST /v1/calls/{id}/captions
- POST /v1/calls/{id}/translation
- POST /v1/calls/{id}/recording/consent
- POST /v1/calls/{id}/escalate-to-meet
- GET /v1/calls/history

## 26. Muse / Quanty placement

Muse has distinct call UX placements:
1. Pre-call assistant — device check, captions/language, accessibility
2. In-call assistant — translation and approved-context assistance
3. Network assistant — explain quality and suggest audio-only/device changes
4. Meeting escalation assistant — explain QuantMeet and prepare authorized agenda
5. Live QuantMeet assistant — captions, translation, notes, action items, moderation signals
6. Post-call assistant — follow-up, Calendar proposal, Drive note, policy-controlled summary

Example narrow context:
surface = c07.active-call
resource = call:{id}
allowedActions = translate, device_help, escalate_to_meet

Muse must not access microphone/camera streams merely because it is visible. Media access requires explicit capability.

## 27. Cross-app integration

QuantMail: typed call/meeting follow-up; Mail owns email.
QuantCalendar: scheduled Meet event; Calendar owns event/time.
QuantDrive: recording/transcript/meeting notes; Drive owns durable file.
QuantContacts: canonical participant identity.
QuantGit: authorized call/meeting reference in issue/PR; Git owns repository state.
QuantAI: explicit AI task against authorized call resource.
Other products: capability-based sharing only; no direct database access.

## 28. Security invariants

- signaling authorization is server-side
- media/session credentials are scoped and short-lived
- TURN credentials are ephemeral
- participant authorization is recalculated for sensitive actions
- screen share requires explicit user action
- recording requires visible consent/indicator
- role changes are audited
- blocked users cannot initiate calls unless policy permits
- call links expire/revoke
- diagnostics are opt-in
- Muse cannot silently record or transcribe

## 29. Accessibility

Required: screen-reader labels for every call control, keyboard navigation, adjustable captions, visual/haptic alternatives to audio state, speaker identification, reduced motion, high contrast, no gesture-only critical controls, accessible participant management and clear recording indicators.

Critical controls remain reachable while secondary panels are open.

## 30. Failure handling

Permission failure → call remains alive with audio-only/settings recovery.
Camera failure → continue voice.
Microphone failure → route/device recovery.
Network degradation → adapt, then audio-only.
ICE failure → restart ICE/TURN fallback.
SFU failure → regional failover where available; otherwise preserve call metadata and recovery state.
Device disconnect → re-enumerate and offer replacement.
Handoff failure → retain original session.
Recording failure → call continues unless policy requires it.
Caption failure → call continues with caption-unavailable state.
Meet escalation failure → remain in current call and offer retry.

## 31. Performance budgets

Connection: fast first audio, progressive video, bounded reconnects, no main-thread media processing.

Quality: prioritize audio continuity, reduce video dynamically, virtualize large participant lists.

Battery: reduce FPS under thermal pressure, pause unnecessary previews, avoid continuous expensive effects in background.

## 32. Test matrix

Unit: state transitions, authorization, routing, retry/idempotency, consent, handoff, escalation.

Integration: signaling, WebRTC negotiation, SFU, captions, screen share, recording, QuantMeet transition.

E2E: mobile ↔ web, mobile ↔ Tauri, web ↔ Tauri, 1:1, group, community voice, degraded network, permission denial, device disconnect, reconnect, recording consent, blocked participant.

Accessibility: VoiceOver, TalkBack, keyboard-only, reduced motion, captions.

## 33. Muse implementation sequence

C07-A: call domain/state machine + signaling.
C07-B: 1:1 voice/video + device routing.
C07-C: SFU-backed group calls + community voice.
C07-D: adaptive network/media engine.
C07-E: screen share + captions + translation.
C07-F: device handoff + recovery.
C07-G: QuantMeet escalation.
C07-H: recording/consent + Drive resource handoff.
C07-I: Muse call/meeting capabilities.
C07-J: cross-app notifications/resources.
C07-K: accessibility/security/performance.
C07-L: runtime evidence + E2E matrix.

Next deep slice: C08 QuantMeet — complete pre-join, meeting room, host console, breakout rooms, stage, collaboration, recording, transcript, AI meeting plane, post-meeting workspace and all-platform UI.
