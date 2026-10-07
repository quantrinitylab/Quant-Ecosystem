# QuantChat — Unified Social, Messaging & QuantMeet Architecture

## Architectural correction
QuantChat is NOT only a WhatsApp-style messenger. It is the unified realtime social and communication platform combining WhatsApp + Telegram + Snapchat + Discord + QuantMeet.

QuantMeet is a first-class subsystem inside QuantChat, not a separate consumer app.

## Five first-class pillars
1. Private Messenger — 1:1/group E2EE, multi-device, voice notes, disappearing/view-once media, reactions, replies, edits, deletes, polls, location/contact sharing, calls, status/stories, communities, broadcast.
2. Telegram-class platform — channels, supergroups, topics, threads, bots, bot API, mini apps, inline actions, stickers/GIFs, scheduled messages, saved messages, folders, usernames, public/private links, discovery, roles, permissions, webhooks, monetization.
3. Snapchat-class camera/social — camera-first mobile, Stories, Spotlight-style short video, streaks, ephemeral media, view-once, AR lenses, face/body tracking, 3D/world effects, avatars, Snap-Map-style location, ghost mode, close friends, story interactions.
4. Discord-class communities — servers, text/forum/announcement channels, roles, granular permissions, AutoMod-style moderation, voice channels, stage channels, persistent voice, screen sharing, spatial audio, bots, integrations, events, onboarding and audit logs.
5. QuantMeet — instant and scheduled meetings, shareable rooms, waiting rooms, host/co-host, screen sharing, presentation mode, whiteboard, collaborative notes, reactions, hand raise, polls, Q&A, breakout rooms, stage mode, recording, transcription, translation, captions, speaker attribution, summaries, action items, Calendar integration, Drive recording, security and meeting analytics.

## QuantMeet escalation
DM → voice call → video call → QuantMeet room → scheduled meeting → breakout rooms → recording → QuantDrive meeting space → AI recap → Mail/Chat follow-up.

The user should never feel they switched products.

## QuantMeet domain ownership
Meeting session, participants, call state, signaling and media-session metadata belong to QuantChat/QuantMeet.
Scheduled calendar event belongs to QuantCalendar.
Person identity belongs to Identity/Contacts.
Recording file belongs to QuantDrive.
Invitation email belongs to QuantMail.
Project or PR state belongs to QuantGit.
AI summary/action plan is derived Quanty output.
Credits belong to QuantTrinity.

## Meeting architecture
QuantChat conversation → signaling → WebRTC → SFU → participants.
Supporting planes: screen share, captions, transcription, translation, recording, meeting chat, collaborative state, moderation and Quanty.
Multiparty media uses an SFU. Application servers must not relay raw media streams.
Recording is a media pipeline that creates a governed Drive resource; it is not a database field.

## Quanty modes
Quanty operates inside QuantChat as: personal assistant, conversation assistant, meeting assistant, community moderator and automation agent.
Examples: summarize chat; translate conversation; call a person; start a meeting with current participants; find a calendar time; create agenda; take meeting notes; identify decisions; extract action items; create a Drive document; send a recap.
Quanty must clearly distinguish observing, drafting, acting, executing and verified states.

## Camera and AR
Camera is a core QuantChat surface, not merely an attachment picker.
Pipeline: camera → GPU effects → AR/lens runtime → composition → safety/privacy checks → ephemeral or persistent media → story/chat/Spotlight/share.
Lenses support face landmarks, segmentation, body/hand tracking where available, depth/world tracking where available, shaders, particles, 3D objects and audio-reactive effects.
Lens packages are versioned and sandboxed.

## Stories and ephemeral
Stories are first-class resources with draft, published, active, expired, archived and deleted states.
Audience modes include public, followers, close friends, selected users and private.
Ephemeral messages have explicit server-authoritative expiry. Expiry must propagate to caches, indexes, notifications and applicable derived memory.

## Location
Snap-Map-style location is privacy-first: off, approximate, selected friends, temporary live location, ghost mode and event/meetup pins.
Precise location is never globally discoverable by default. Retention and audience are explicit.

## Communities
One community model supports WhatsApp Communities, Telegram channels/supergroups, Discord servers, forums, voice spaces, announcement spaces and QuantMeet stages.
Hierarchy: Community → channels → threads → messages → calls/meetings.
Permissions are capability based.

## Bots and mini apps
QuantChat exposes a scoped programmable platform: bot identities, commands, webhooks, event subscriptions, inline actions, mini-app surfaces, credits integration and approved ecosystem capability invocation.
Bots never inherit the user's complete account permissions.

## Social graph
QuantChat participates in the shared relationship graph through contacts, friends, close friends, group membership, community membership, channel subscriptions, callers, frequent communicators, blocked/muted/restricted relationships.
Interaction signals are policy-controlled and are not automatically treated as durable relationship facts.

## Ecosystem notification surface
QuantChat is the human notification surface. QuantMail, Calendar, QuantGit, QuantGram, QuantWave, QuantMax, QuantCooks, QuanTube and QuantAds can emit notification intents. QuantChat handles delivery/grouping/priority while the originating product remains authoritative.

## Economy
Potential metered or monetized surfaces: premium meeting capacity, recording/transcription, gifts, stickers, lens packs, creator tips, community subscriptions, channel boosts and bot/mini-app purchases.
All settlement goes through the shared Quant Credits ledger. QuantChat never mutates wallet truth directly.

## Unified product map
Messenger + Social Camera + Communities + Calls + QuantMeet + Quanty + Ecosystem connections + Economy.

## Critical implementation law
Do NOT build QuantChat as separate WhatsApp, Snapchat, Discord and QuantMeet clones.
Build one coherent product with shared identity, contact graph, realtime spine, safety infrastructure, notifications, Quanty, credits and governed memory.
Cross-product references use ecosystem resource contracts. Other products' source tables are never directly mutated.

## Muse execution consequence
Every QuantChat milestone must consider the interaction between messaging, camera/social, communities, calls and QuantMeet. A feature is incomplete if its obvious neighboring workflow is missing.

Target experience: chat → camera → community → call → meeting → collaboration → AI → ecosystem action, all feeling like one product.