# QuantMax — Gaming, Mini Games & Playable Media Architecture

**Status:** Target-state product architecture / execution contract
**Product law:** QuantMax owns the ecosystem's full gaming and playable-content runtime. QuantChat may launch games or carry lightweight game interactions, but game sessions, authoritative state, matchmaking, inventories, achievements and game economy remain QuantMax-owned.

## 1. Product thesis
QuantMax is not only TikTok + Omegle + Tinder. It is the ecosystem's **play-and-meet operating layer**: short video, safe random discovery, dating, live rooms and a full playable ecosystem.

The gaming target combines the strongest patterns of Snapchat/YouTube-style playable content, WePlay-style social party gaming, casual arcade platforms, multiplayer rooms and creator-made games.

Core loop:
`discover → preview → play instantly → invite → party → compete/cooperate → earn/unlock → share → return`.

## 2. QuantChat vs QuantMax boundary
| Capability | QuantChat | QuantMax |
|---|---|---|
| Send game invite | Yes | Yes |
| Lightweight poll/game card | Yes | Yes |
| Launch playable | Yes | Yes |
| Full game runtime | No | **Yes** |
| Matchmaking | request/entry only | **Authoritative** |
| Game state | reference only | **Authoritative** |
| Game inventory | no | **Authoritative** |
| Game achievements | projection | **Authoritative** |
| Tournament | invite surface | **Authoritative** |
| Game creator tools | link/install | **Authoritative** |
| Game economy | handoff | **Authoritative** |
| Game analytics | notification projection | **Authoritative** |

Example: "Ludo kheloge?" in QuantChat creates a typed QuantMax launch intent. The user can return to Chat, but the live game session belongs to QuantMax.

## 3. Playable content classes
- **Instant mini-game:** seconds-to-minutes, low install footprint.
- **Party game:** 2–16+ players with room state.
- **Arcade game:** score/leaderboard oriented.
- **Social game:** chat/voice/avatar-first.
- **Skill game:** deterministic competitive state.
- **Casual game:** low commitment, asynchronous or synchronous.
- **Creator game:** UGC-built or configured through QuantMax tools.
- **Playable video:** a video/short contains a game entry point without leaving the feed.
- **Playable ad:** clearly labeled sponsored interactive experience owned by QuantAds but executed through approved QuantMax runtime capabilities.
- **3D world/room:** persistent or session-based social environment.
- **Live game show:** host + audience + real-time interaction.

## 4. Screen inventory
- QG01 Game Home
- QG02 For You / Playable Feed
- QG03 Game Discovery
- QG04 Game Detail
- QG05 Instant Preview
- QG06 Party Lobby
- QG07 Matchmaking
- QG08 Game Session
- QG09 Voice/Spatial Room
- QG10 Spectator Mode
- QG11 Results / Rewards
- QG12 Leaderboards
- QG13 Tournaments
- QG14 Friends / Squad
- QG15 Game Profile
- QG16 Creator Studio
- QG17 Game Builder
- QG18 Asset/Level Editor
- QG19 Publish/Review
- QG20 Game Analytics
- QG21 Inventory/Cosmetics
- QG22 Credits/Entry
- QG23 Safety/Report
- QG24 Quanty Game Copilot
- QG25 Settings/Privacy
- QG26 Gaming Admin/Ops

## 5. QG01 Game Home
Mobile is game-first: continue playing, friends online, recommended games, quick play, party rooms and recently played.

Web/Tauri adds category navigation, keyboard controls, controller/device setup and multi-window party management.

Muse/Quanty appears as a compact play assistant: "find me a 4-player game under 10 minutes" or "invite my QuantChat friends to this room". It does not occupy the game viewport during critical gameplay.

## 6. QG02 Playable Feed
Playable content can appear alongside short videos, but the feed must make the interaction boundary obvious.

Each card can expose:
- play time estimate
- player count
- age/safety rating
- controls/device requirements
- publisher/creator
- paid/free status
- network requirement.

Video-to-play transition must preserve feed position so returning never loses the user's place.

Recommendation signals include play start, completion, replay, session length, party join, abandonment, reports and explicit feedback. Raw time is not the only ranking signal.

## 7. QG03/QG04 Discovery + Game Detail
Discovery supports genres, player count, skill level, friends playing, trending, new releases, creator games and accessibility.

Game Detail explains runtime permissions, network/media use, data access, price/credits, publisher, safety status, version and uninstall/reset behavior.

Paid placement is clearly labeled and cannot override safety or age restrictions.

## 8. QG05 Instant Preview
Instant preview is the QuantMax equivalent of a playable trailer.

Flow:
`metadata → lightweight bootstrap → sandboxed runtime → limited session → full launch`.

Preview has strict CPU, memory, network and duration limits.

Progress is never silently converted into a paid purchase.

## 9. QG06 Party Lobby
Lobby supports friends, invite links, public/private rooms, voice readiness, device checks, game rules, region, language and accessibility.

Host controls are capability-scoped.

QuantChat can receive the invite/notification, but the lobby/session is QuantMax-owned.

## 10. QG07 Matchmaking
Matchmaking ticket contains:
- game id/version
- region
- latency preference
- player count
- skill/MMR where applicable
- party reference
- language
- safety/age constraints
- input/device class.

Matchmaking must never expose precise private location merely to improve pairing.

Queues are ephemeral in Redis; accepted matches and game sessions are durable in PostgreSQL.

## 11. QG08 Game Session
Game state is authoritative on the server for competitive/multiplayer games.

Client sends intents/inputs. Server validates rules and emits state updates.

Never trust client score, currency, inventory, hit result, match outcome or reward claim.

Session lifecycle:
`CREATED → STARTING → ACTIVE → PAUSED/RECONNECTING → FINISHING → COMPLETED | ABORTED`.

Reconnect uses session token + authoritative sequence/cursor.

## 12. Runtime architecture
Three runtime classes:

### A. Web-native
HTML/Canvas/WebGL/WebGPU game running in a constrained browser/runtime sandbox.

### B. QuantMax managed runtime
Approved game engine/runtime with controlled APIs for networking, identity, voice, economy, achievements and storage.

### C. Native/full game
Used only for trusted first-party or reviewed experiences. Native capabilities are explicitly granted and cannot inherit arbitrary account permissions.

Games access QuantMax through a Game SDK, never through internal services.

## 13. Game SDK
SDK modules:
- identity
- profile projection
- friends/invites
- room/session
- realtime state
- voice
- achievements
- leaderboard
- inventory
- cosmetics
- credits/payment intent
- analytics
- moderation/report
- notifications
- Quanty hooks.

Each SDK call maps to a capability and resource scope.

Games cannot request a user's entire Quant ecosystem graph.

## 14. Game networking
For real-time games:
`client input → gateway → authoritative game server → validated state → delta broadcast`.

Use WebSocket/QUIC/WebRTC data channels according to latency and platform requirements.

State updates carry session id, tick/sequence, server timestamp and checksum/version.

Competitive games require deterministic or server-validated simulation.

## 15. Party games / WePlay-style architecture
Party-game engine supports:
- rooms
- host transfer
- ready state
- rounds
- timers
- voting
- teams
- spectator
- voice
- emotes
- shared boards
- mini-game rotation.

Quanty can act as host, rules explainer, translator, scorekeeper or moderator when explicitly enabled.

Host transfer must be deterministic. A disconnected host cannot permanently strand a room.

## 16. 3D social game rooms
QuantMax's flagship 3D layer uses three.js/react-three-fiber/WebGPU with WebGL2 fallback and Rapier-style physics where appropriate.

Room primitives:
- avatar
- seat
- zone
- prop
- portal
- game board
- proximity audio region
- interaction point.

Spatial voice uses server-controlled room membership plus WebRTC audio and client-side distance attenuation.

Low-end devices receive a reduced 2D/low-detail mode rather than being excluded.

## 17. QG09 Voice / spatial room
Voice is separate from game state but linked by session/resource references.

Controls: mute, deafen, participant volume, spatial toggle, captions, report/block.

Quanty may provide live translation or host assistance only with explicit session capability.

Moderation can act on server-visible room metadata and authorized realtime safety signals without claiming access to E2EE private content.

## 18. QG10 Spectator
Spectators receive a read-only projection of authoritative state.

Spectator permissions:
- watch
- react
- chat
- cheer/gift where allowed.

Spectators cannot influence hidden game state unless the game explicitly defines audience actions.

Anti-cheat must prevent spectator feeds from exposing secret information.

## 19. QG11 Results and rewards
Result screen distinguishes:
- score
- rank
- verified match result
- earned XP
- achievements
- cosmetic unlock
- credits transaction.

Rewards are issued only after server verification.

Credits are settled through QuantTrinity/economy. Game servers receive an operation reference, never wallet ledger access.

## 20. QG12 Leaderboards
Support global, regional, friend, season, game and tournament leaderboards.

Leaderboard updates are derived from verified results.

Anti-cheat/reversal can invalidate a result without rewriting historical audit records.

Players can control visibility where policy permits.

## 21. QG13 Tournaments
Tournament lifecycle:
`DRAFT → REGISTRATION → CHECK-IN → BRACKET_LOCKED → ACTIVE → FINALS → SETTLEMENT → ARCHIVED`.

Capabilities:
- brackets
- seeding
- matchmaking
- spectator
- moderators
- prizes
- dispute handling.

Paid tournaments require explicit economy/legal policy review; game logic cannot directly settle money.

## 22. QG14 Friends / squads
Friends originate from the canonical social graph.

Squads are QuantMax-owned temporary/team structures referencing canonical identities.

Invite path:
`QuantMax → QuantChat notification/deep link → QuantMax lobby`.

Do not duplicate contacts or friend records into the game database.

## 23. QG16 Creator Studio
Creators can:
- upload game builds/assets
- configure controls
- create levels
- define rules
- create cosmetics
- define age/safety metadata
- set supported devices
- configure monetization
- inspect analytics.

Creator ownership and payout contracts remain separate from game runtime.

## 24. QG17 Game Builder
Target low-code/no-code and advanced SDK paths.

Builder primitives:
- scene
- player
- NPC
- object
- trigger
- rule
- timer
- score
- inventory item
- dialogue
- spawn
- portal
- camera
- audio zone.

Generated logic executes inside a constrained runtime. Builder output cannot gain arbitrary filesystem/network/native access.

## 25. QG18 Asset / level editor
Asset pipeline validates models, textures, audio, shaders and scripts.

Limits:
- triangle/texture budgets
- package size
- shader complexity
- script execution time
- memory
- network calls.

Malicious or malformed assets enter quarantine.

## 26. QG19 Publish / review
Publication:
`DRAFT → BUILD_VALIDATION → SAFETY_REVIEW → QA_REVIEW → PUBLISHED → SUSPENDED/DEPRECATED`.

Automated checks cover malware, unsafe content, exploit signatures, prohibited network access and performance budgets.

Human review handles high-risk categories and appeals.

Game versioning is immutable. A published version cannot silently change its executable bytes.

## 27. QG20 Analytics
Creator analytics include:
- starts
- preview-to-start conversion
- completion
- retention
- session length
- party joins
- churn
- crash rate
- latency
- revenue/credits
- reports.

Analytics are aggregated and privacy-aware. Raw user behavior is not automatically exposed to creators.

## 28. QG21 Inventory / cosmetics
Inventory is QuantMax-owned game state.

Items have immutable definitions, ownership records, source, entitlement, trade policy and lifecycle.

Cosmetics may be shared across approved games only through an explicit ecosystem asset standard; a game cannot read another game's private inventory directly.

## 29. QG22 Credits / entry
Paid action flow:
`price preview → user confirmation → economy authorization → operation reference → game entitlement → verified result`.

No client can directly decrement credits.

Refunds/reversals are economy operations, not game-state hacks.

## 30. QG23 Safety
Safety includes:
- age/eligibility policy
- report/block
- voice abuse signals where authorized
- anti-cheat
- spam
- grooming/exploitation prevention
- malicious links
- creator abuse
- game-content moderation.

Random-chat/dating/game surfaces require stricter safety boundaries than ordinary single-player games.

Safety action precedence:
`platform safety → QuantMax safety → game rules → creator preferences`.

Creator rules can narrow behavior but cannot weaken platform safety.

## 31. QG24 Quanty Game Copilot
Quanty modes:
- game recommender
- rules explainer
- teammate/coach
- party host
- translator
- accessibility assistant
- matchmaking assistant
- post-game analyst.

Examples:
"Find us a 10-minute 4-player game."
"Invite my QuantChat group."
"Explain this game to a new player."
"Host a trivia round."
"Translate the lobby."
"Why did I lose?"

Quanty must not cheat, reveal hidden opponent state, manipulate outcomes or spend credits without an authorized capability.

## 32. Playable video
Short-video and playable content share a discovery layer, but video ownership remains QuantMax media/feed domain and game runtime remains game-owned.

Flow:
`video → play affordance → instant game preview → session → return to exact video position`.

Playable videos must visibly identify interactive content and estimated data use.

## 33. Playable advertising
QuantAds can supply approved playable creative through a typed advertising capability.

QuantMax executes the playable in a sandbox and reports aggregate engagement/verified conversion events back to QuantAds.

Advertisers do not receive raw identity/game telemetry beyond approved measurement.

Ads never bypass age/safety/runtime restrictions.

## 34. Backend domains
Core PostgreSQL domains:
- game_catalog
- game_version
- game_session
- game_player
- game_party
- game_matchmaking
- game_result
- game_leaderboard
- game_tournament
- game_inventory
- game_entitlement
- game_creator
- game_build
- game_asset
- game_review
- game_report
- game_achievement
- game_economy_ref
- game_analytics.

Redis: matchmaking queues, presence, room coordination, hot session state.
Kafka: durable game facts and projections.
R2: builds, assets, replays, media and large artifacts.
PostgreSQL: authoritative durable game state.
Qdrant/Meilisearch: discovery/recommendation/search projections.

## 35. Realtime architecture
Shared `ws-gateway` handles session signalling/presence, while authoritative game servers handle game-specific state.

Never place authoritative game logic in the generic WebSocket gateway.

Event flow:
`game server → transactional result/outbox → Kafka → signal-projector → leaderboard/feed/notification projections`.

QuantChat receives notifications/invites through typed events.

## 36. API surface
- `GET /v1/games`
- `GET /v1/games/{id}`
- `POST /v1/games/{id}/previews`
- `POST /v1/game-sessions`
- `POST /v1/game-sessions/{id}/join`
- `POST /v1/game-sessions/{id}/leave`
- `POST /v1/game-sessions/{id}/inputs`
- `GET /v1/game-sessions/{id}/state`
- `POST /v1/matchmaking/tickets`
- `DELETE /v1/matchmaking/tickets/{id}`
- `GET /v1/leaderboards/{gameId}`
- `POST /v1/tournaments`
- `GET /v1/inventory`
- `POST /v1/economy/operations`
- `POST /v1/games/{id}/reports`
- `POST /v1/games/{id}/quanty-actions`.

Client game traffic uses the runtime protocol rather than arbitrary REST writes for high-frequency state.

## 37. Event contract
Core events:
- `quantmax.game.published.v1`
- `quantmax.game.version_published.v1`
- `quantmax.session.created.v1`
- `quantmax.session.started.v1`
- `quantmax.session.completed.v1`
- `quantmax.match.created.v1`
- `quantmax.result.verified.v1`
- `quantmax.reward.issued.v1`
- `quantmax.tournament.state_changed.v1`
- `quantmax.inventory.changed.v1`
- `quantmax.game.suspended.v1`.

Events carry resource refs, version, provenance and correlation ids.

## 38. Cross-app architecture
**QuantChat:** invite, DM, group notification, voice handoff and game deep links.
**QuantMail:** identity/SSO and optional transactional email.
**QuantCalendar:** tournament/party scheduling.
**QuantDrive:** creator assets, replays and authorized recordings.
**QuantContacts:** canonical people graph.
**QuantGit:** developer game source/build workflow through QuantGit capabilities.
**QuantGram:** share clips/highlights.
**QuantWave:** game sound/music publication where authorized.
**QuanTube:** stream/spectate/game-video publication.
**QuantAds:** playable advertising.
**QuantTrinity:** credits and economy settlement.

## 39. Platform architecture
**Mobile/Capacitor:** hero casual/party experience, touch/gyro/haptics, controller support where available.

**Web:** instant playable games, shareable sessions and discovery.

**Tauri:** creator studio, tournament control, streaming, multi-window rooms and controller-heavy games.

**QuantMeet:** may be launched from a game room for larger social sessions, but Meet owns meeting state.

## 40. Offline/degraded behavior
Single-player/local games may continue offline with local state.

Competitive sessions fail closed when authoritative server state is unavailable.

Reconnect restores from server checkpoint/sequence. Client-only result claims are never accepted as official.

Cached catalog metadata can display offline, but purchases, matchmaking and competitive rewards require connectivity.

## 41. Anti-cheat
Layered model:
- client integrity signals
- server-authoritative simulation
- impossible-state detection
- timing/input anomaly detection
- replay analysis
- rate limits
- account/device trust signals.

Anti-cheat decisions are auditable and appealable.

Do not collect unrelated device data merely because it might improve anti-cheat.

## 42. Performance
Targets are game-class specific:
- instant preview should start progressively
- playable feed transition must preserve responsiveness
- real-time sessions prioritize latency and jitter
- 3D rooms adapt quality by device/GPU/network
- low-end devices get deterministic reduced-detail mode.

Measure frame time, input latency, network RTT, jitter, packet loss, server tick time, crash rate and memory pressure.

## 43. Accessibility
Games must support where applicable:
- remappable controls
- captions
- text alternatives
- colorblind-safe indicators
- reduced motion
- haptic alternatives
- mono audio
- scalable UI
- screen-reader accessible menus.

Accessibility metadata is part of game discovery.

## 44. Security
Threats:
- malicious game build
- sandbox escape
- cheating
- fake result
- economy abuse
- phishing game
- malicious asset
- WebRTC abuse
- cross-game inventory access
- Quanty privilege escalation.

Controls:
- signed builds
- isolated runtime
- capability-based SDK
- server authority
- economy isolation
- short-lived session credentials
- asset scanning
- publisher verification
- audit/provenance.

## 45. Test matrix
Unit: rules, scoring, state machines, entitlement, inventory, permissions.

Integration: matchmaking, session lifecycle, reconnect, leaderboard, economy, QuantChat invite and cross-app handoff.

Security: sandbox escape, forged input, fake score, replay, token theft, scope escalation and malicious assets.

Load: concurrent rooms, tick stability, matchmaking spikes, leaderboard writes and spectator fanout.

UX: mobile touch, controller, keyboard, low-end GPU, poor network, accessibility.

E2E: discover → preview → play → invite → session → result → reward → Chat share.

## 46. Implementation sequence
**GAME-01** — catalog/version/game resource contracts.
**GAME-02** — sandboxed playable runtime + Game SDK.
**GAME-03** — game session/state protocol.
**GAME-04** — matchmaking + parties.
**GAME-05** — party-game engine.
**GAME-06** — leaderboards/results/achievements.
**GAME-07** — inventory/cosmetics/entitlements.
**GAME-08** — QuantTrinity economy references.
**GAME-09** — creator studio + builder.
**GAME-10** — build/asset validation and review.
**GAME-11** — tournaments/spectator.
**GAME-12** — 3D rooms/spatial voice.
**GAME-13** — playable video integration.
**GAME-14** — QuantAds playable runtime.
**GAME-15** — Quanty game capabilities.
**GAME-16** — QuantChat cross-app invites/share.
**GAME-17** — anti-cheat/safety.
**GAME-18** — observability/load/accessibility/security evidence.

## 47. Definition of done
QuantMax gaming is complete only when a user can discover a game, preview it, launch it instantly where supported, invite friends, enter an authoritative session, reconnect safely, receive verified results/rewards, communicate through the appropriate voice/chat surface, report abuse, and return to the exact originating feed/context.

> **Architectural invariant:** QuantMax owns play. QuantChat connects people to play. QuantTrinity settles the economy. Each domain remains authoritative for its own state.