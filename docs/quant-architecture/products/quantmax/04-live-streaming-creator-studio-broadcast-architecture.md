# QuantMax — Live Streaming, Creator Studio & Broadcast Architecture

**Status:** Target-state architecture / execution contract
**Scope:** Live video, creator broadcasting, co-hosting, PK battles, game streaming, audience interaction, clips, replay and creator operations.

> **Core law:** Live media is an owned QuantMax media experience; realtime transport, moderation, creator identity, game state and economy remain separate authoritative domains.

## 1. Live product model
QuantMax live combines:
- creator livestreams
- game streams
- 1:1/co-host live
- multi-host rooms
- PK/battle formats
- audience game shows
- tournament broadcasts
- watch parties
- live shopping/interactive commerce where enabled.

Every broadcast has a typed `LiveRoom` resource and explicit lifecycle.

## 2. Live lifecycle
`DRAFT → SCHEDULED → PREPARING → LIVE → ENDING → PROCESSING → PUBLISHED/EXPIRED`.

Unexpected disconnect enters `RECONNECTING` without fabricating continuity.

Replay processing is asynchronous and must preserve the original broadcast resource identity.

## 3. Creator Studio
Creator Studio supports:
- camera/source selection
- microphone/mixer
- scenes
- overlays
- captions
- guests
- screen/game capture
- stream health
- moderation
- gifts
- polls
- Q&A
- clips
- scheduling.

Tauri is the primary power-user surface; mobile provides quick live creation.

## 4. Broadcast sources
Supported source types:
- device camera
- device microphone
- screen share
- game capture
- remote guest
- prerecorded approved media.

Each source has explicit permission and lifecycle state.

## 5. Ingest architecture
`capture → secure ingest → regional edge → media pipeline → SFU/CDN delivery → archive`.

Low-latency interactive rooms use WebRTC/SFU.

Large audience broadcasts use scalable media distribution/CDN paths.

Creator control messages remain separate from media packets.

## 6. Co-host architecture
Hosts can invite guests through QuantChat or direct live-room invites.

Guest permissions are capability-based:
- camera
- microphone
- screen
- moderation controls.

Removing a guest revokes media authorization immediately.

## 7. PK / battle architecture
Battle rooms support:
- two or more creators
- synchronized rounds
- audience reactions
- verified scoring
- timers
- gifts where allowed.

Battle score is computed by the battle service from verified events, not client-provided totals.

Economy settlement is delegated to QuantTrinity through operation references.

## 8. Game streaming
Game streaming may originate from QuantMax games or external approved capture.

Game state is not reconstructed from the stream.

When a viewer enters the playable game, the viewer receives a new authorized QuantMax game session.

Stream and game resources remain linked by references.

## 9. Audience interaction
Audience features:
- reactions
- chat
- polls
- Q&A
- predictions where legally/policy permitted
- audience mini-games
- gifts
- follow
- subscribe/creator support where enabled.

Every interaction has rate limits and moderation.

High-frequency reactions are aggregated rather than persisted individually when detailed storage is unnecessary.

## 10. Live chat
Live chat is a QuantChat-compatible communication surface but broadcast chat state remains scoped to the live room.

Creators can configure:
- slow mode
- follower-only
- subscriber/entitled mode
- keyword filters
- moderator roles.

Private DMs are never duplicated into the live-chat store.

## 11. Moderation
Live safety layers:
- pre-stream account/creator checks
- realtime spam detection
- text moderation
- applicable audio/video safety classifiers
- moderator console
- viewer reports
- emergency stream termination.

Severe policy events can terminate a stream immediately.

Moderation evidence is retained according to explicit policy and access controls.

## 12. Quanty live copilot
Quanty can:
- generate title/description
- summarize chat
- surface repeated questions
- translate audience messages
- suggest moderation actions
- identify clip moments
- draft post-stream highlights.

Quanty cannot independently ban users or spend creator credits unless explicitly granted the corresponding capability.

## 13. Live captions and translation
Pipeline:
`audio → streaming ASR → caption segments → optional translation → client delivery`.

Captions have sequence ids and timestamps so late segments can be reconciled.

Translation is best-effort and visibly identified.

## 14. Clips
Creators/viewers with permission can mark a live moment.

Clip pipeline:
`live timestamp → source segment → clip job → transcode → moderation → publish`.

Clip provenance references the original live room and creator.

Clips can become QuantMax short-video candidates and can be shared to QuantGram/QuantWave/QuanTube where authorized.

## 15. Replay / VOD
Completed broadcasts generate optional replay assets.

Creator chooses visibility:
- public
- followers
- private
- delete.

Replay processing can produce multiple bitrates, thumbnails, captions and chapters.

Deletion invalidates delivery references and starts storage lifecycle cleanup.

## 16. Game tournament broadcast
Tournament service remains authoritative for bracket/result state.

Broadcast service renders the event but cannot alter tournament results.

Spectator overlays use read-only tournament projections.

## 17. Watch parties
Watch parties synchronize a playback cursor and participant presence.

Playback authority is explicit:
- host-led
- synchronized group control.

Copyright-protected content must use authorized playback paths.

## 18. Creator economy
Creator actions can reference:
- tips
- gifts
- subscriptions
- eligible battle rewards.

QuantMax creates typed economy intents.

QuantTrinity performs ledger settlement.

Creators never receive direct wallet database access.

## 19. Data model
Core domains:
- live_room
- live_source
- live_participant
- live_stream
- live_chat_projection
- live_reaction_aggregate
- live_poll
- live_question
- live_battle
- live_clip
- live_replay
- live_moderation_case
- live_schedule
- live_creator_setting.

Media bytes remain object-storage owned.

## 20. API surface
- `POST /v1/live/rooms`
- `POST /v1/live/rooms/{id}/start`
- `POST /v1/live/rooms/{id}/end`
- `POST /v1/live/rooms/{id}/guests`
- `DELETE /v1/live/rooms/{id}/guests/{guestId}`
- `POST /v1/live/rooms/{id}/polls`
- `POST /v1/live/rooms/{id}/questions`
- `POST /v1/live/rooms/{id}/clips`
- `GET /v1/live/rooms/{id}/replay`
- `POST /v1/live/rooms/{id}/reports`
- `POST /v1/live/rooms/{id}/quanty-actions`.

## 21. Event model
- `quantmax.live.created.v1`
- `quantmax.live.started.v1`
- `quantmax.live.participant_changed.v1`
- `quantmax.live.ended.v1`
- `quantmax.live.clip_requested.v1`
- `quantmax.live.replay_ready.v1`
- `quantmax.live.report_created.v1`
- `quantmax.live.battle_state_changed.v1`
- `quantmax.live.schedule_changed.v1`.

Events carry resource refs, provenance, correlation ids and aggregate versions.

## 22. Cross-app integration
**QuantChat:** invites, private communication, live notifications and creator/friend handoff.
**QuantMeet:** optional larger meeting escalation; meeting state remains QuantMeet-owned.
**QuantGram:** clips/highlights.
**QuantWave:** authorized audio/sound.
**QuanTube:** long-form broadcast/VOD publication.
**QuantDrive:** creator-approved recordings/assets.
**QuantCalendar:** scheduled streams/events.
**QuantAds:** clearly labeled live sponsorship placements.
**QuantTrinity:** gifts/tips/subscriptions/battle settlement.

## 23. Discovery integration
Live rooms enter the discovery pipeline as `experience_type=LIVE`.

Eligibility and safety filters execute before recommendation.

Live ranking prioritizes freshness, current capacity, viewer satisfaction and safety health.

Creator popularity alone cannot bypass live safety.

## 24. Reliability
Creator disconnect:
`edge detects loss → reconnect window → source restoration → resume if valid`.

If recovery fails, room transitions to ended/processing without fake continuation.

Audience reconnect resumes from the latest authorized playback/session state.

Regional media failure can migrate where supported; control-plane state remains durable.

## 25. Observability
Measure:
- ingest latency
- end-to-end latency
- dropped frames
- bitrate
- packet loss
- jitter
- SFU CPU
- concurrent viewers
- reconnect rate
- moderation latency
- clip processing time.

Creator-visible health uses actionable signals, not internal infrastructure noise.

## 26. Accessibility
- live captions
- translated captions
- keyboard creator controls
- screen-reader audience controls
- reduced-motion reactions
- mono audio option.

Important controls remain reachable without gesture-only interaction.

## 27. Security
Controls:
- signed session credentials
- short-lived ingest tokens
- per-source capabilities
- encrypted transport
- stream-key rotation
- guest revocation
- replay access controls
- creator/admin audit trail.

Stream credentials are never exposed in client URLs or logs.

## 28. Testing
Unit: lifecycle, scoring, permissions, clip boundaries.

Integration: ingest, SFU, reconnect, guest handoff, captions, moderation and replay.

Load: large audience fanout, PK battles, chat spikes, tournament broadcasts.

Security: forged host action, leaked stream key, unauthorized guest, replay access and economy scope escalation.

E2E:
`schedule → start → invite guest → broadcast → interact → clip → end → replay → publish/share`.

## 29. Implementation sequence
**LIVE-01** — live resource/lifecycle contract.
**LIVE-02** — ingest + source permissions.
**LIVE-03** — WebRTC/SFU low-latency rooms.
**LIVE-04** — large-audience distribution.
**LIVE-05** — creator studio.
**LIVE-06** — co-host/guest controls.
**LIVE-07** — live chat/reactions/polls.
**LIVE-08** — moderation/emergency controls.
**LIVE-09** — captions/translation.
**LIVE-10** — clips/replay pipeline.
**LIVE-11** — PK/battle engine.
**LIVE-12** — game/tournament broadcasting.
**LIVE-13** — Quanty live copilot.
**LIVE-14** — creator economy references.
**LIVE-15** — discovery integration.
**LIVE-16** — load/security/accessibility evidence.

## 30. Definition of done
A creator can schedule or instantly start a safe broadcast, invite co-hosts, interact with viewers, moderate the room, run a battle/game stream, create verified clips, end the stream, receive a processed replay and distribute authorized highlights across the ecosystem.

> **Invariant:** Transport carries media; QuantMax owns live-room state; games own game state; QuantTrinity owns settlement; moderation can interrupt delivery but never mutates underlying creator ownership without an authorized policy action.