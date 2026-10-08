# QuantMax — Dating, Random Discovery, Safety & Trust Architecture

**Status:** Target-state architecture / execution contract
**Scope:** Dating, safe random discovery, live social matching, age assurance, identity trust, abuse prevention and the boundary between entertainment discovery and interpersonal matching.

> **Core law:** Serendipity is a product feature; safety is a platform invariant. QuantMax may help people meet, but no engagement metric can override eligibility, consent, blocking, age or safety policy.

## 1. Product surfaces
- Dating discovery
- Mutual-match inbox
- Safe random chat
- Interest-based random rooms
- Live social rooms
- Friend/squad discovery
- Nearby discovery with privacy radius
- Safety center
- Verification/trust center.

Dating and random discovery share infrastructure where useful, but remain separate policy domains.

## 2. Dating lifecycle
`PROFILE_ELIGIBLE → DISCOVERABLE → LIKE → MUTUAL_MATCH → CHAT_HANDOFF → OPTIONAL_MEET → BLOCK/UNMATCH/EXPIRE`.

A like is private until mutual eligibility is established.

An unmatch immediately removes future interaction capability and invalidates outstanding interaction actions.

## 3. Dating profile
Profile contains:
- canonical Quant identity reference
- display name
- age/eligibility state
- photos/media
- interests
- optional bio/prompts
- languages
- coarse location
- discovery preferences
- verification state.

Sensitive identity attributes are not automatically exposed to other users.

Exact home/work location is never shown.

## 4. Verification
Trust signals can include:
- account assurance
- phone verification
- liveness/photo verification
- device trust
- history of policy compliance.

Verification badges communicate a defined assurance level, not a guarantee that a person is safe.

Verification data is stored in the dedicated trust/security domain and exposed only as minimal status.

## 5. Age assurance
Age eligibility is a hard gate for restricted experiences.

Age state should be represented as policy-safe categories rather than unnecessarily exposing exact birth information:
- under minimum
- eligible
- restricted/unknown.

Dating, random video and mature games can have different age policies.

One successful check does not automatically authorize every future product.

## 6. Dating discovery
Candidate pipeline:
`eligibility → hard preferences → visibility/block rules → compatibility retrieval → safety filtering → ranking → diversity → delivery`.

Hard filters are evaluated before ranking.

Compatibility may use explicit interests, preferences and mutually permitted signals.

General watch-time or entertainment behavior must not silently determine romantic eligibility.

## 7. Dating ranking
Ranking may consider:
- shared interests
- explicit preference compatibility
- activity freshness
- mutual social context where permitted
- conversation compatibility signals where consented.

Ranking must not use protected/sensitive attributes as hidden desirability scores.

Boosts can alter eligible exposure according to transparent policy but cannot bypass safety, age, block or hard preference filters.

## 8. Quanty wingman
Quanty capabilities:
- suggest icebreakers
- summarize profile prompts
- translate
- propose safe date ideas
- help draft a message.

Quanty does not impersonate the user or send romantic messages without an explicit authorized action.

Quanty cannot reveal private profile information from another person.

## 9. Mutual-match handoff
After mutual match:
`QuantMax match → QuantChat conversation resource → notification → optional call/QuantMeet`.

The canonical conversation remains QuantChat-owned.

QuantMax stores the match relationship and handoff reference, not a second message history.

## 10. Random discovery
Random matching is a queue-based service with:
- age eligibility
- region/latency
- language
- interest tags
- availability
- safety trust tier.

Exact location is never required merely because two people are geographically nearby.

Users can disable random discovery independently of dating.

## 11. Random session lifecycle
`QUEUED → MATCHED → NEGOTIATING → ACTIVE → RECONNECTING → ENDED → REVIEWED`.

Skip, report and block are always available.

Repeated rapid matching can trigger cooldowns to reduce abuse and spam.

Session credentials are short-lived and scoped to the current match.

## 12. Video random chat
WebRTC media uses the shared Quant WebRTC/SFU architecture.

TURN credentials are short-lived.

Media authorization expires with the session.

Participants cannot discover network identifiers or private device information beyond what the platform intentionally exposes.

Camera/microphone permission is explicit and revocable.

## 13. Safety intervention hierarchy
1. Client controls: mute, camera off, block, report.
2. Session controls: disconnect, restrict, cooldown.
3. QuantMax enforcement: suspend, age restriction, discovery removal.
4. Platform enforcement: account/device-wide action when warranted.

High-severity safety actions can interrupt a session immediately.

## 14. Realtime safety
Safety signals can include:
- report events
- account/device trust signals
- spam behavior
- rapid reconnect patterns
- authorized audio/video safety classifiers on applicable non-E2EE surfaces.

Safety systems should minimize content retention and retain evidence according to explicit policy.

Private E2EE conversations remain outside server-side plaintext inspection unless content is explicitly and legitimately shared into a moderation workflow.

## 15. Block / mute / restrict
Block has highest interaction precedence.

After block:
- no direct contact
- no dating candidate
- no random pairing
- no invite
- no profile discovery where policy requires.

Muting affects visibility/notifications, not necessarily eligibility.

Restriction reduces interaction without necessarily making the relationship invisible.

All surfaces consume the canonical relationship policy.

## 16. Nearby discovery
Nearby uses coarse privacy-preserving spatial buckets.

Users can configure:
- visibility
- radius class
- ghost mode
- discovery category.

Precise location is never exposed to another user by default.

Location retention is minimized and short-lived for live matching.

## 17. Social trust graph
Trust projections can combine:
- account age
- verified state
- successful interactions
- policy history
- reports with validated outcomes.

Trust is not a public popularity score.

Low trust can limit high-risk discovery features without silently lowering a user's general social worth.

False reports and coordinated reporting are themselves abuse signals.

## 18. Dating safety
Controls:
- photo/profile reporting
- harassment reporting
- impersonation reporting
- unwanted-contact limits
- screenshot/privacy guidance
- safe-meet reminders.

High-risk contact patterns can trigger contextual safety prompts.

Quanty can offer safety guidance without forcing disclosure.

## 19. Random-chat safety
Random sessions receive stricter controls than normal friend interactions.

Features:
- one-tap leave
- one-tap report
- automatic session timeout
- age-policy enforcement
- repeat-offender matching exclusion
- cooldown after repeated skips.

Discovery ranking must not reward abusive behavior simply because it increases session time.

## 20. Dating + gaming connection
Games can be an optional shared activity after appropriate interaction.

Example:
`mutual match → QuantChat → invite to approved 2-player game → QuantMax session`.

Dating status never grants special game permissions.

Game voice/session safety rules remain active.

## 21. Live social rooms
Live rooms use separate creator/host and audience policies.

Moderation controls include:
- host moderation
- platform moderation
- participant reporting
- audience restrictions.

Random users cannot automatically become hosts.

## 22. Data model
Core durable domains:
- trust_profile
- age_assurance
- dating_profile
- dating_preference
- dating_like
- dating_match
- random_session
- random_interest
- discovery_eligibility
- safety_report
- safety_case
- enforcement
- block_edge
- mute_edge
- restriction_edge
- location_visibility
- verification_record.

Messages remain QuantChat-owned.

Game state remains QuantMax gaming-owned.

Economy remains QuantTrinity-owned.

## 23. API surface
- `GET /v1/dating/profile`
- `PATCH /v1/dating/profile`
- `GET /v1/dating/discover`
- `POST /v1/dating/likes`
- `DELETE /v1/dating/likes/{id}`
- `GET /v1/dating/matches`
- `POST /v1/dating/matches/{id}/handoff`
- `POST /v1/random/sessions`
- `POST /v1/random/sessions/{id}/skip`
- `POST /v1/random/sessions/{id}/leave`
- `POST /v1/random/sessions/{id}/report`
- `GET /v1/trust/status`
- `POST /v1/safety/reports`
- `POST /v1/blocks`.

Mutations use idempotency keys and capability checks.

## 24. Event model
- `quantmax.dating.profile_changed.v1`
- `quantmax.dating.like_created.v1`
- `quantmax.dating.match_created.v1`
- `quantmax.dating.match_ended.v1`
- `quantmax.random.session_created.v1`
- `quantmax.random.session_matched.v1`
- `quantmax.random.session_ended.v1`
- `quantmax.safety.report_created.v1`
- `quantmax.safety.enforcement_changed.v1`
- `quantmax.trust.status_changed.v1`.

All events carry canonical resource references and provenance.

## 25. Cross-app integration
**QuantChat:** canonical conversation after mutual match, random-chat communication and notifications.
**QuantMeet:** optional scheduled meeting/call after appropriate authorization.
**QuantContacts:** canonical identity/contact relationship.
**QuantCalendar:** optional date/event planning.
**QuantMax Gaming:** approved shared activities.
**QuantTrinity:** boosts or other paid actions through operation references only.
**Quanty:** governed wingman/safety assistant.

## 26. Privacy
User controls:
- discovery visibility
- dating visibility
- random-chat availability
- nearby visibility
- exact location sharing
- profile field visibility.

Every discovery query applies block/privacy policy before candidate delivery.

Deleting a profile removes it from discovery projections within defined propagation targets.

## 27. Reliability
Matchmaking queues can recover from worker failure without duplicate matches.

Match creation is idempotent.

Session disconnects expire automatically.

Safety enforcement propagates before a blocked user can receive a new candidate.

Stale discovery projections fail closed for high-risk eligibility decisions.

## 28. Accessibility
Dating cards support screen-reader semantics and keyboard navigation.

Random video supports captions and non-video fallback.

Spatial voice offers a mono/non-spatial mode.

Safety controls are reachable in one interaction from active sessions.

Reduced-motion mode disables decorative 3D effects.

## 29. Observability
Track:
- candidate latency
- match rate
- mutual-match rate
- random-session connection success
- WebRTC quality
- report rate
- block rate
- false-positive safety interventions
- enforcement latency.

Never use safety metrics as an engagement optimization target.

## 30. Testing
Security:
- age bypass
- identity spoofing
- blocked-user rediscovery
- location leakage
- session token replay
- unauthorized profile access.

Safety:
- report/ban propagation
- coordinated reports
- repeat offender exclusion
- emergency disconnect.

Matching:
- duplicate match
- queue crash
- reconnect
- regional overload.

E2E:
`discover → like → mutual match → QuantChat handoff → game/date interaction → block/report`.

## 31. Implementation sequence
**TRUST-01** — trust/eligibility resource contracts.
**TRUST-02** — block/mute/restrict policy engine.
**TRUST-03** — age assurance integration.
**TRUST-04** — dating profile/preferences.
**TRUST-05** — dating candidate retrieval/ranking.
**TRUST-06** — mutual match + QuantChat handoff.
**TRUST-07** — random matchmaking queues.
**TRUST-08** — random WebRTC session lifecycle.
**TRUST-09** — realtime safety/reporting.
**TRUST-10** — nearby privacy-preserving discovery.
**TRUST-11** — trust/enforcement projections.
**TRUST-12** — Quanty wingman/safety capabilities.
**TRUST-13** — dating/game shared-activity handoff.
**TRUST-14** — load/security/accessibility evidence.

## 32. Definition of done
Users can safely discover compatible people, control visibility, match mutually, move the conversation into QuantChat, optionally play together or meet through authorized Quant surfaces, and leave/block/report at any time without losing control of their identity or location.

> **Invariant:** No recommendation, boost, game mechanic, economy operation or Quanty action can override age, consent, block, privacy or platform safety policy.