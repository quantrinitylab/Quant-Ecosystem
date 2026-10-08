# QuantMax — Short Video, Playable Feed & Recommendation Architecture

**Status:** Target-state architecture / execution contract
**Scope:** For You, Following, Live, playable feed, game discovery and the shared recommendation platform inside QuantMax.

> **Core law:** A video and a game are different resources but can share one discovery surface. Recommendation chooses the next useful experience; the runtime that executes it remains authoritative.

## 1. Product model
QuantMax has one discovery graph with multiple experience types:
- short video
- live stream
- playable video
- instant mini-game
- party game
- 3D room
- random discovery room
- dating profile/card.

Each item has an explicit `experience_type`, `resource_ref`, eligibility policy and launch contract.

The feed never embeds authoritative game state. It emits a typed launch intent into the correct QuantMax runtime.

## 2. Feed surfaces
- **For You:** personalized mixed media/playable discovery.
- **Following:** followed creators/friends, with chronological and ranked modes.
- **Play Now:** game-first discovery.
- **Live:** live streams, rooms, tournaments and game spectating.
- **Nearby:** privacy-preserving nearby social/game discovery.
- **Continue:** unfinished games, rooms and videos.
- **Friends Playing:** current QuantChat/social-graph activity.
- **Trending:** rapidly rising experiences with safety gates.

## 3. Candidate generation
Candidate sources are isolated so one source cannot monopolize the feed:
- follow graph
- creator graph
- watch history
- play history
- search
- semantic interest vectors
- game genre affinity
- friend activity
- regional trends
- fresh/new creator pool
- exploration pool
- live inventory
- tournament inventory.

Every candidate carries provenance and retrieval reason.

## 4. Two-stage ranking
### Stage A — retrieval
High-recall retrieval uses embeddings, graph neighbors, collaborative signals, recent trends and deterministic eligibility filters.

### Stage B — ranking
Heavy ranking estimates multiple outcomes instead of optimizing raw watch time:
- probability of meaningful watch
- completion
- replay
- share
- save
- follow
- game start
- game completion
- party join
- return intent
- satisfaction
- report probability.

Final ranking applies policy, diversity, freshness and creator exposure constraints.

## 5. Mixed-media ranking
A playable game competes for attention with a video, but the model must compare **utility**, not raw duration.

Example:
`video_score = expected_value(video)`
`game_score = expected_value(game_start + completion + social_value)`.

The ranker receives normalized experience-specific features and outputs a common utility score.

Paid placement is a separate labeled candidate class and cannot silently enter organic ranking.

## 6. Exploration vs exploitation
QuantMax reserves controlled exploration for:
- new creators
- new games
- new genres
- new formats
- cold-start users.

Exploration budgets are bounded per user/session and subject to safety eligibility.

Repeatedly ignoring an experience becomes a negative preference signal.

Explicit `Not interested`, mute, block and hide actions override recommendation signals.

## 7. Transparent recommendation
Every feed item exposes a lightweight "Why this?" explanation.

Examples:
- because you watched similar games
- because friends are playing
- trending in your selected region
- from a creator you follow
- because you finished this series.

Quanty can explain the recommendation without revealing private model internals or another user's private data.

## 8. User controls
Users can steer:
- content topics
- game genres
- difficulty
- session length
- language
- age suitability
- creator diversity
- following-only mode
- chronological mode
- autoplay
- playable frequency.

Quanty can convert natural language into these explicit controls.

Example: "Aaj sirf 10 minute ke multiplayer games dikhao."

## 9. Session-aware ranking
Ranking state changes within a session.

Signals include:
- skips
- rewatches
- rapid abandonment
- completed games
- party invites accepted
- fatigue
- explicit feedback.

Short-term session state must not automatically become durable personal memory.

## 10. Gaming-specific discovery
Game cards expose:
- player count
- estimated duration
- genre
- skill level
- current players
- friend activity
- latency/region compatibility
- accessibility
- safety rating.

Game discovery supports:
- solo
- 1v1
- 2-player
- party
- squad
- tournament
- spectator.

## 11. Playable video transition
Transition must be near-instant where cached:
`feed item → preview/bootstrap → game session → play → return`.

The feed stores a resumable navigation checkpoint:
- feed cursor
- item id
- scroll position
- media playback position.

Returning from a game restores the exact prior context.

## 12. Video recommendation pipeline
Content enrichment:
`upload → transcode → ASR → OCR → visual understanding → audio fingerprint → moderation → embeddings → indexing`.

Feature pipeline consumes verified engagement events through Kafka.

Online features use bounded TTLs where appropriate; long-term preference is separately governed.

## 13. Game recommendation pipeline
Game metadata enrichment includes:
- genre
- mechanics
- duration
- player count
- control scheme
- difficulty
- age rating
- accessibility
- network requirement.

Gameplay telemetry creates game-specific embeddings and affinity features.

Game recommendation must never infer sensitive traits from gameplay unless explicitly governed and permitted.

## 14. Live ranking
Live inventory has stronger freshness requirements.

Candidate freshness considers:
- currently live
- remaining capacity
- latency
- host trust
- viewer satisfaction
- moderation state.

Live rooms under active safety investigation are removed from recommendation immediately while preserving operational evidence.

## 15. Dating discovery boundary
Dating ranking is a separate policy/ranking domain.

QuantMax may share infrastructure and explicit user-controlled signals, but general entertainment engagement must not secretly determine romantic eligibility.

Dating compatibility requires its own consent, visibility and safety policy.

## 16. Random discovery boundary
Random-chat matching is also separate from feed ranking.

Feed behavior can suggest an entry point, but random matching uses its own eligibility, age, safety, language, interest and availability constraints.

## 17. Creator cold start
New creators receive bounded exploration based on quality/safety eligibility, not purchased organic ranking.

Signals:
- early completion
- meaningful interactions
- hide/report rate
- repeat viewers
- follows.

Creator exposure should not become a pure popularity contest.

## 18. Game cold start
New games receive controlled preview exposure after automated validation.

Early ranking uses:
- metadata similarity
- creator trust
- genre affinity
- preview interaction
- completion
- crash rate.

Game safety failures immediately override discovery gains.

## 19. Anti-manipulation
Detect:
- view farms
- bot plays
- coordinated likes
- fake completion
- reward farming
- leaderboard manipulation
- click injection.

Suspicious events are quarantined from ranking and economy until verified.

Ranking features must distinguish observed events from trusted events.

## 20. Recommendation event model
Core events:
- `quantmax.discovery.impression.v1`
- `quantmax.discovery.opened.v1`
- `quantmax.video.started.v1`
- `quantmax.video.completed.v1`
- `quantmax.game.previewed.v1`
- `quantmax.game.started.v1`
- `quantmax.game.completed.v1`
- `quantmax.discovery.dismissed.v1`
- `quantmax.discovery.reported.v1`
- `quantmax.discovery.saved.v1`.

Events use canonical resource references, provenance, correlation ids and privacy policy metadata.

## 21. Recommendation architecture
`Kafka → signal-projector → online feature projection → candidate stores → ranker → policy/reranker → feed cache → client`.

Offline training uses governed datasets.

Online ranking must have deterministic fallbacks when model services fail.

Fallback order:
`personalized cache → following/friend candidates → fresh safe popular → deterministic category feed`.

## 22. Search vs recommendation
Search answers explicit intent.
Recommendation proposes discovery.

A search for "2 player racing" must not be treated as a generic engagement signal.

Search result ranking remains query-aware; recommendation can use aggregate search interests within governed boundaries.

## 23. Quanty integration
Quanty has controlled recommendation tools:
- explainRecommendation
- setFeedPreference
- findGames
- findFriendsPlaying
- startPlayable
- resumeActivity.

Quanty cannot silently alter durable ranking preferences from a casual conversation.

Explicit preference changes create auditable preference mutations.

## 24. Cross-app integration
**QuantChat:** friends playing, invites, game launch notifications.
**QuantGram:** clips/highlights become shareable discovery candidates.
**QuantWave:** authorized music/sound references enrich video/game discovery.
**QuanTube:** streams and recorded gameplay become media candidates.
**QuantMail/Calendar:** scheduled tournaments and creator events.
**QuantDrive:** authorized creator assets and replays.
**QuantGit:** game developer build provenance.
**QuantAds:** labeled sponsored playable candidates.
**QuantTrinity:** economy signals only as authorized aggregate features; ledger remains isolated.

## 25. Data model
Recommendation-specific durable projections:
- discovery_item
- discovery_candidate
- discovery_impression
- discovery_feedback
- creator_affinity
- game_affinity
- topic_affinity
- session_preference
- ranking_experiment
- exploration_budget.

Raw product truth remains in the owning domain.

## 26. Experimentation
A/B tests require:
- experiment id
- eligibility
- treatment
- exposure
- primary metric
- guardrail metrics
- stop criteria.

Guardrails include:
- report rate
- block rate
- crash rate
- latency
- creator concentration
- diversity.

Experiments cannot bypass safety or privacy policy.

## 27. Platform behavior
Mobile prioritizes instant play and vertical video.
Web prioritizes discovery, share links and quick playable launches.
Tauri prioritizes creator analytics, streaming and tournament operations.

Reduced-motion and low-power modes disable expensive visual recommendation effects without disabling recommendation functionality.

## 28. Observability
Track:
- candidate retrieval latency
- ranker latency
- feed generation latency
- cache hit rate
- model error rate
- stale-feature rate
- recommendation diversity
- game-start conversion
- crash-after-launch.

Every feed response carries an internal trace/correlation reference for debugging.

## 29. Failure modes
If recommendation service fails: deterministic fallback.
If feature store is stale: use safe cached features.
If game service fails: do not fabricate successful launch.
If live room becomes unsafe: remove from discovery.
If experiment service fails: use control treatment.
If event pipeline lags: never invent engagement.

## 30. Privacy and retention
Raw impressions and behavior have explicit retention windows.

Long-term interest profiles are derived, reviewable where applicable and deletable through the platform data lifecycle.

Sensitive or high-risk inferences are prohibited from becoming general-purpose Quanty memory.

## 31. Implementation sequence
**DISC-01** — canonical discovery item/resource contract.
**DISC-02** — impression/feedback event pipeline.
**DISC-03** — candidate-source registry.
**DISC-04** — deterministic baseline ranker.
**DISC-05** — video enrichment and embeddings.
**DISC-06** — game enrichment and embeddings.
**DISC-07** — mixed-media ranker.
**DISC-08** — policy/diversity/freshness reranker.
**DISC-09** — playable-feed launch/resume contract.
**DISC-10** — Quanty recommendation capabilities.
**DISC-11** — experimentation/guardrails.
**DISC-12** — anti-manipulation signals.
**DISC-13** — live/dating/random discovery isolation.
**DISC-14** — observability/load/security evidence.

## 32. Definition of done
QuantMax is complete when a user can move from video → playable → multiplayer session → result → clip/share → discovery again without losing context, while recommendations remain explainable, policy-safe, measurable and independent of any single content format.

> **Invariant:** The feed recommends experiences. Product domains execute them. No recommendation component becomes the source of truth for video, dating, random-chat, game state or economy.