# QuantChat — Deep Product Architecture

**Status:** Target-state architecture / execution contract  
**Product ID:** `quantchat`  
**Role:** Real-time communication domain of the Quant Ecosystem  

> **Important scope:** QuantChat is one unified product combining WhatsApp + Telegram + Snapchat + Discord + QuantMeet. QuantMeet is a first-class subsystem inside QuantChat, not a separate consumer app.

## Architecture law

QuantChat owns communication state. It may consume other product projections through typed ecosystem contracts, but it never becomes the source of truth for another product.

## Deep architecture documents

### Product and system
- `01-unified-social-messaging-meeting-architecture.md` — unified WhatsApp/Telegram/Snapchat/Discord/QuantMeet architecture.
- `02-screen-by-screen-deep-architecture.md` — **screen-by-screen target architecture for C01–C13**, including layout, state machines, data, realtime, offline, Quanty, safety, accessibility, failure modes, ownership and execution order.
- `03-screen-deep-dive-c01-c02.md` — deeper C01/C02 implementation architecture.
- `04-screen-deep-dive-c03-c04-c05.md` — deeper C03/C04/C05 community/channel architecture.
- `05-screen-deep-dive-c06-camera-stories-spotlight-ar.md` — deep C06 camera, Stories, Spotlight, AR, media editor, platform UI and Muse placement architecture.
- `06-screen-deep-dive-c07-calls.md` — deep C07 calling, WebRTC/SFU, device handoff, screen share, captions, QuantMeet escalation, recording, platform UI and Muse placement architecture.
- `07-screen-deep-dive-c08-quantmeet.md` — deep C08 QuantMeet: lobby, join gate, meeting studio, active meeting, stage, chat, sharing, breakouts, whiteboard, captions, recording, security, Quanty copilot, post-meeting, APIs, realtime, data ownership, platform UX, tests and Muse execution.
- `08-screen-deep-dive-c09-search.md` — deep C09 Search: unified search UI, message/people/community/media/meeting scopes, ecosystem routing, authorization, indexing, semantic retrieval, Quanty search, privacy, realtime invalidation, platform UX, tests and Muse execution.
- `09-screen-deep-dive-c10-quanty.md` — deep C10 Quanty: AI home, context, conversation/meeting/community modes, plans, approvals, tool execution, verification, evidence, memory, automation, model routing, safety, platform UX, tests and Muse execution.
- `10-screen-deep-dive-c11-notifications.md` — deep C11 Notifications: unified notification center, priority/grouping, mentions, meetings, ecosystem events, preferences, focus/quiet hours, routing, privacy, Quanty triage, delivery reliability, platform UX, tests and Muse execution.
- `11-screen-deep-dive-c12-settings-privacy-devices.md` — deep C12 Settings: account/identity, devices, sessions, security, privacy, presence, calls/Meet, camera/location, communities, Quanty grants, memory, data lifecycle, integrations, accessibility and platform UX.
- `12-screen-deep-dive-c13-admin-operations.md` — deep C13 Admin/Operations: organizations, users/devices, communities/channels, moderation, reports/appeals, Calls/QuantMeet ops, media/AR, bots, privacy requests, credits/entitlements, configuration, feature flags, audit, incidents, health, RBAC/capabilities and operator Quanty.
- `13-c01-c13-implementation-contract.md` — implementation contract mapping C01–C13 to domains, entities, commands, queries, events, state machines, realtime, offline, security, cross-app handoffs, observability and Muse execution waves.
- `14-database-domain-schema-contract.md` — PostgreSQL domain schema contract for C01–C13, Redis/Kafka boundaries, outbox/idempotency, E2EE storage boundary, indexes, retention/deletion, migrations, security and persistence tests.
- `15-api-event-websocket-contract.md` — endpoint-level API, event and WebSocket contract: envelopes, auth, pagination, idempotency, E2EE boundaries, reconnect/gap repair, Quanty tools, cross-app handoffs, rate limits and contract/load/security testing.
- `16-e2ee-multidevice-cryptographic-architecture.md` — E2EE and multi-device security: device identities, prekeys, session establishment, ratchet/group-key lifecycle, encrypted media, verification, recovery, local search, Quanty plaintext boundary, threat model and cryptographic test plan.
- `17-webrtc-sfu-quantmeet-media-architecture.md` — WebRTC/SFU media plane for Calls + QuantMeet: STUN/TURN, simulcast/SVC, adaptive quality, screen share, breakouts, captions/translation, recording, device handoff, AR/3D, scaling, observability and failure recovery.
- `18-offline-first-sync-multidevice-architecture.md` — Offline-first sync and multi-device convergence: encrypted local state, command journal, idempotency, cursor/delta sync, event gap repair, conflicts, resumable media, reconnect, storage pressure, E2EE sync and cross-app invalidation.
- `19-search-discovery-recommendation-architecture.md` — Search/discovery architecture: local E2EE search, Meilisearch/Qdrant retrieval, authorization-aware indexing, federated ecosystem search, semantic retrieval, recommendation boundaries, invalidation, offline search and Quanty evidence retrieval.
- `20-notification-presence-social-graph-architecture.md` — Unified notification, presence and social-graph architecture: relationship edges, block/mute/restrict, TTL presence, multi-device state, notification intents, priority/grouping/routing, cross-app fanout, affinity decay, privacy, Quanty triage and reliability.
- `21-media-content-processing-safety-architecture.md` — Media lifecycle: resumable R2 uploads, E2EE/server-readable boundaries, validation, malware scanning, derivatives, transcoding, Stories/Spotlight publication, quarantine/review, AR asset safety, signed delivery, retention/deletion, QuantMeet recordings, Quanty integration, cross-app handoffs and test/performance contracts.
- `22-bots-mini-apps-integrations-architecture.md` — Bot identities, scoped installations, commands, webhooks, OAuth, isolated Mini Apps, sandboxing, interactive messages, credits, Quanty tools, cross-app actions, moderation, reliability and security.

### Shared ecosystem contracts
Muse MUST read these before implementing cross-app behavior:

- `docs/quant-architecture/03-product-boundaries-and-domains.md`
- `docs/quant-architecture/05-data-and-event-architecture.md`
- `docs/quant-architecture/06-ai-quanty-platform.md`
- `docs/quant-architecture/08-identity-security-trust.md`
- `docs/quant-architecture/09-economy-billing.md`
- `docs/quant-architecture/20-ecosystem-cross-app-connection-contract.md`
- `docs/quant-architecture/21-ecosystem-app-capability-registry.md`
- `docs/quant-architecture/22-ecosystem-cross-app-resource-and-context-contract.md`
- `docs/quant-architecture/23-event-spine-and-integration-runtime.md`

## Screen contract

The canonical QuantChat screen inventory is C01–C13:

C01 Inbox, C02 1:1, C03 Group, C04 Community, C05 Channel, C06 Camera/Media, C07 Call, C08 QuantMeet, C09 Search, C10 Quanty, C11 Notifications, C12 Settings, C13 Admin.

A screen is not complete because the UI renders. It requires data ownership, API contracts, permissions, realtime reconciliation, offline/degraded behavior, accessibility, telemetry, security, tests, cross-app handoffs and verified failure handling.

## Product thesis

QuantChat is the ecosystem's real-time communication operating layer:

- private messaging
- group messaging
- communities
- channels
- threads
- disappearing communication
- voice/video calls
- QuantMeet
- screen sharing
- media
- presence
- notifications
- bots/integrations
- Quanty
- ecosystem resource cards
- moderation
- creator/community economy

The differentiator is not merely feature count:

> **Every conversation can become a governed action surface for the rest of the Quant Ecosystem without allowing QuantChat to own data it does not own.**

## Ownership

QuantChat owns:
- conversations and membership
- messages/revisions/reactions/replies
- channels/communities and their permissions
- chat presence/read/delivery state
- call and meeting session metadata
- chat attachments and ephemeral policy
- chat moderation
- bot installation state
- chat notification preferences
- chat-specific encryption/session metadata

QuantChat does not own:
- identity → Identity
- canonical people/contact records → Contacts
- calendar events → QuantCalendar
- email → QuantMail
- files/recordings → QuantDrive
- repositories/PRs/issues → QuantGit
- creator/media source content → owning product
- wallet/credits ledger → QuantTrinity/economy
- durable cross-ecosystem memory → governed QuantDrive memory

Cross-app integration uses typed resource/context contracts. **Databases do not cross boundaries.**

## Unified user journey

`chat → camera → story/media → community → call → QuantMeet → collaboration → Quanty → Drive/Calendar/Mail/Git → back to Chat`

If a neighboring workflow is obviously part of the user's task and the implementation cannot complete it, the feature is incomplete.

## Muse execution rule

Before every implementation slice:
1. inspect current code
2. map code to this architecture
3. identify contradictions
4. preserve working behavior
5. implement one coherent slice
6. add tests
7. run affected validation
8. inspect UI/runtime behavior
9. document evidence
10. record remaining gaps

Never use fake data to make a screen appear complete. Never claim production readiness without fresh evidence.
