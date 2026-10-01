These four apps share one realtime spine — `services/ws-gateway` (presence + fan-out), `packages/webrtc` (WebRTC SFU calling), `packages/realtime` (pub/sub + CRDT), `packages/social-graph` (follows/affinity), and `services/signal-projector` (Kafka-CDC events → ranking/notification projection). Every surface authenticates through QuantMail OAuth2 SSO, spends one currency (Quant Credits, 1 credit ≈ $1), and is co-piloted by Quanty — the cross-app agent that can read, act, and (with permission) control the device. The cluster's mandate: own realtime human connection — messaging, feeds, discovery, and live rooms — as one graph, not four walled gardens.

## QuantChat — "Snapchat + WhatsApp + Telegram + Discord killer"
**Now:** scaffolded (web + backend exist) · **Target:** GA-grade secure messenger + AR camera + community/voice platform with QuantMeet conferencing built in; the ecosystem's calling, timer, notification and agent surface.

### Vision
QuantChat is where the ecosystem talks. It fuses WhatsApp-grade E2EE 1:1/group messaging, Telegram-scale channels and bots, Discord-style persistent servers with low-latency voice, and Snapchat's camera-first ephemeral culture (lenses, stories, streaks, Snap-Map) — then makes the whole thing agent-native: Quanty lives in every thread as an auto-reply avatar and an actuator ("call Shivam", "set a timer", "email the team"). The hook: one identity, one contact graph, and one assistant that can actually *do* the thing you're chatting about.

### Competitors & their real architecture

**WhatsApp**
- Backend is Erlang/OTP (ejabberd lineage) tuned for millions of persistent TCP connections per node; client-server transport is wrapped in the Noise Protocol Framework (Noise Pipes), not raw TLS.
- E2EE via the Signal Protocol: X3DH (Extended Triple Diffie-Hellman) sets up sessions asynchronously from server-published prekey bundles, then the Double Ratchet (DH ratchet + symmetric chain-key ratchet) yields per-message keys with forward secrecy and post-compromise security.
- Groups use Sender Keys: each member distributes one sender key over pairwise Signal channels, then broadcasts a single ratcheted ciphertext — turning O(N²) pairwise encryption into O(N) fan-out.
- Multi-device: each companion device has its own identity key; the sender fans out one ciphertext per recipient *device*; store-and-forward servers hold messages only until delivery, then delete.
- Media is an AES-encrypted blob on CDN; the symmetric key + SHA-256 ride inside the E2EE message.
- → Weakness we exploit: closed, no in-chat compute, no cross-app agent, no economy — messaging dead-ends instead of launching action.

**Telegram**
- Custom MTProto 2.0 transport; cloud chats are *not* E2EE — stored server-side (encrypted at rest, keys held by Telegram, deliberately sharded across jurisdictions) so they sync everywhere; only Secret Chats are device-to-device E2EE.
- Per-DC server farms with a user "home DC"; cloud-resident sessions let a new device instantly rehydrate full history.
- Bot platform on the Bot API (webhook/long-poll) atop MTProto: inline bots, keyboards, payments, Web Apps; supergroups to 200k and broadcast channels.
- In-app economy via Stars + the Fragment marketplace (usernames, numbers) with TON lineage.
- → Weakness we exploit: cloud chats trade privacy for sync; home-grown crypto; bots can't touch other apps or the device.

**Discord**
- Real-time gateway in Elixir/Erlang: each guild is a set of BEAM processes; presence + message fan-out over a compressed WebSocket (zstd, Erlang Term Format) with session resume and guild sharding.
- Message store moved Cassandra → ScyllaDB (Rust) for trillions of rows, fronted by Rust "data services" doing request coalescing to protect hot partitions.
- Voice is a self-run WebRTC SFU (Selective Forwarding Unit): Opus over RTP/UDP, per-region media servers in C++/Rust, signalling in Elixir — one upstream, forwarded to N listeners.
- → Weakness we exploit: no E2EE, no ephemerality, no AR, no camera; gaming-flavored but walled off from any economy or agent.

**Snapchat**
- Camera-first and ephemeral by default: Snaps are store-and-forward, deleted after view; the app is built around capture, not an inbox.
- AR via Lens Studio + SnapML: on-device nets for face-mesh landmarks, segmentation and body tracking; World lenses use SLAM surface tracking + LiDAR depth; lenses ship as compiled asset bundles into a carousel.
- Snap-Map clusters friends' Bitmoji + public-snap heat; Stories are 24h ephemeral; Spotlight is a TikTok-style ranked short-video feed.
- → Weakness we exploit: shallow chat, closed AR authoring (Lens Studio only), zero productivity/agent, no economy.

### What we build to beat them
- **Quanty as a first-class participant, not a bot.** In any thread Quanty can be @-summoned or run as your auto-reply avatar (answers in your voice/style while you're away, with a visible "AI answered" badge). It doesn't just reply — it *acts*: "call Shivam" opens QuantChat and dials; "email all workers for a 5pm meeting, set a timer, notify me 10 min before" orchestrates QuantMail (compose+send) + QuantChat (timer + push) + calendar in one turn.
- **E2EE that survives an agent.** Signal-grade Double Ratchet for human messages; Quanty operates only on content explicitly shared into an "assistant-visible" scope (per-thread toggle), so privacy and AI coexist instead of the WhatsApp (no AI) vs Telegram-cloud (no privacy) tradeoff.
- **One contact graph, one currency.** Your QuantMail identity *is* your QuantChat identity *is* your QuantWave handle; credits pay for lens packs, premium meet rooms, boosted broadcasts, sticker/gift economy and creator tips — money moves in one wallet across all nine apps.
- **QuantMeet built in.** Full WebRTC conferencing (SFU, screen share, breakout rooms, recording→R2, live transcription/translation) lives inside chat, so a DM escalates to a 50-person call with breakouts without leaving the app or paying Zoom.
- **Open AR + 3D avatars.** `packages/ar-lenses` is an open lens runtime (GLSL/WebGL2 + on-device ML) anyone can author in-app; rapier-rigged 3D avatars render in chat, calls and Snap-Map.

### Core features
- **Messaging:** 1:1 + group, E2EE (prekeys, sender keys, safety numbers), disappearing/ephemeral messages, edit/unsend, reactions, threads, replies, read receipts, typing/presence, voice notes, view-once media.
- **Camera & ephemeral:** stories (24h), reels/spotlight, streaks, lenses/AR, Snap-Map, close-friends.
- **Voice/video:** 1:1 and group calls, QuantMeet conferencing, screen share, breakout rooms, audio-rooms (Discord/Clubhouse style), spatial-audio option.
- **Communities:** servers/channels, roles/permissions, polls, pins, federation (ActivityPub-style) with other Quant instances.
- **Bots & games:** bot API + in-chat arcade (`arcade-matchmaking` service), mini-games, Quanty auto-reply avatar.
- **Identity/safety:** mandatory phone-number + SMS verification, block/report, `moderation-worker` in loop.

### Deep / micro features (the long-tail lock-in)
- Per-chat custom themes/wallpapers, message effects, and Telegram-grade sticker/GIF packs bought with credits.
- Streak flames with grace-timers and streak-restore (credit sink); Snap-Map with ghost mode, time-boxed live location, and "meetup" pins.
- View-once + screenshot-detection notifications; message-tampering alerts on safety-number change; per-device revoke.
- Scheduled messages, reminders, self-destruct timers per message/chat; multi-device with independent keys.
- Polls with quiz mode, live/anonymous results; chat folders, pins, archive, and smart filters (unread/mentions).
- Voice-note transcription + speed control; smart replies + tone rewrite via Quanty; live in-call captions + translation.
- Custom/skin-tone + super-reactions; inline message translation; server-rendered link previews.

### UI/UX & 3D
- Camera-first mobile shell (Capacitor) with a GPU lens carousel: WebGL2/WebGPU + GLSL shaders for real-time lenses, on-device face-mesh/segmentation ML; rapier physics for reactive AR props.
- 3D avatars via three.js/react-three-fiber, rigged and lip-synced to voice notes and Quanty auto-replies; the same avatar appears on Snap-Map and in QuantMeet tiles.
- QuantMeet offers a 3D "room" mode (spatial-voice falloff, seat positions) beside classic grid; Framer Motion/GSAP drive send/receive physics, story progress and transitions.
- Per-device adaptation: desktop (Tauri) multi-pane servers + PiP calls + global hotkeys; mobile camera-first + haptics; web shareable call links.
- Accessibility: full keyboard nav, screen-reader labels on media, live captions/transcripts, reduced-motion mode that disables shaders/physics, high-contrast themes.

### Data & backend
- **Prisma domains:** User, Device, PreKeyBundle/SignedPreKey, Session, Conversation, Message, EphemeralMessage, Attachment, Story, Reel, Lens/AvatarRig, Call, Meeting, BreakoutRoom, Channel/Server, Role, Poll, Receipt, Streak, MapPin, Bot, ArcadeSession, VoiceNote, Reaction.
- **Backend routes (Fastify):** `auth`, `messages`, `conversations`, `e2ee`/`e2ee-prekeys`/`prekeys`, `ephemeral`, `calls`, `meetings`, `channels`, `ar-lenses`, `avatar`, `map`, `reels`, `spotlight`, `polls`, `receipts`, `games`, `voice-bot`, `voice-notes`, `memories`, `notifications`, `federation`, `websocket`, `ai`/`ai-agent`.
- **Realtime/streaming:** `services/ws-gateway` for presence + message fan-out; `packages/webrtc` + a self-run SFU for calls/QuantMeet; Kafka CDC via `services/cdc-relay` feeding `services/signal-projector` for receipts, streak state, and notification projection.
- **Storage:** Cloudflare R2 for media/recordings (encrypted blobs, signed URLs); Redis for presence/typing/session; Postgres for durable domain + persisted `SessionService` (SSO phase 0).
- **Search:** Meilisearch full-text over messages/channels (per-user index scope) + Qdrant vectors for semantic search and Quanty memory recall.
- **Moderation:** `services/moderation-worker` (CSAM hashing, spam, abuse) on non-E2EE surfaces (channels, spotlight, map) + client-side scanning hooks; `services/video-transcoder` for reels/recordings.

### Cross-app integration
- **Quanty actions:** "call Shivam" → open QuantChat, resolve contact, place WebRTC call; "start a QuantMeet with the design team at 5" → create room + invites + calendar hold; "email all workers about the 5pm meeting, set a timer, ping me 10 min before" → QuantMail compose+send + QuantChat timer + scheduled push; "read my unread and reply to Mom I'll call tonight" → summarize + draft + (on confirm) send E2EE.
- **SSO:** all sign-in via QuantMail OAuth2; phone/SMS verification binds the number to the SSO identity for the whole ecosystem.
- **Credits:** lens packs, sticker/gift economy, premium QuantMeet (large rooms/recording), boosted broadcasts, creator tips, streak-restore — all debit the one wallet.
- **Notifications:** QuantChat *is* the ecosystem's notification surface — QuantGram likes, QuantWave mentions, QuantMax matches, QuantMail VIP mail all land as QuantChat pushes/threads.
- **Shared AI-memory:** Quanty's cross-app memory persists in QuantMail Drive (vectorized in Qdrant), so a fact learned in QuantChat is recalled in QuantWave.
- **Links out:** share a reel to QuantGram/QuantWave; escalate a QuantMax match into a QuantChat DM; drop a QuantMail attachment straight into a thread.

### Platform presence
- **Web:** full messenger + QuantMeet + camera (WebGL lenses); shareable call/room links; PWA push.
- **Desktop (Tauri):** multi-pane servers/DMs, always-on call PiP, global push-to-talk hotkey, native notifications, per-window screen-share, tray presence.
- **Mobile (Capacitor):** camera-first capture, AR lenses, Snap-Map with geofencing, SMS auto-verify, haptics, background VoIP (CallKit/ConnectionService).
- **Own admin panel:** channel/server moderation queues, abuse reports, lens/store approval, broadcast tools, E2EE key-transparency dashboards, SMS-verification analytics.
- **Own marketing page:** privacy-forward positioning (E2EE + agent), lens showcase, QuantMeet-vs-Zoom comparison, download links.

## QuantGram — "Instagram + Facebook + Pinterest killer"
**Now:** scaffolded (web + backend exist) · **Target:** GA visual social network with an AI-ranked, user-steerable feed; the ecosystem's photo/video-sharing + visual-discovery surface.

### Vision
QuantGram is the ecosystem's visual home: Instagram's feed/stories/reels and DMs, Facebook's social-graph depth and events, and Pinterest's visual discovery — but with a feed you can *command*. Quanty ranks, narrates, and auto-scrolls for you, filters what you don't want, and turns any grid into a shoppable, remixable canvas. The hook: a feed that works for you (transparent, steerable) instead of one tuned only to keep you scrolling.

### Competitors & their real architecture

**Instagram**
- Feed/Explore is a two-stage recommender: candidate generation then multi-task ML ranking predicting p(like), p(comment), p(save), p(share), p(dwell), combined by a "value model" into a score.
- Explore candidate sourcing uses account embeddings (ig2vec — word2vec over sequences of accounts a user engaged) + approximate-nearest-neighbor retrieval, then ranking + business-rule reranking (diversity, integrity).
- Serves atop a Django/Python monolith with PostgreSQL, Cassandra, memcached; social graph via TAO; photos via Haystack/f4 blob stores.
- Stories/close-friends and Reels have their own models; heavy feature stores + real-time signals.
- → Weakness we exploit: optimizes engagement over intent; zero user control of ranking; no cross-app agent; creator economy is ads-gated.

**Facebook**
- Social graph in TAO: objects + associations over sharded MySQL + memcache, read-optimized, geo-replicated, eventually consistent.
- News Feed ranking evolved from EdgeRank (affinity × edge-weight × time-decay) to ML multi-task ranking over thousands of features optimizing "meaningful social interactions."
- Photos via Haystack (needle-in-a-haystack blob store) + f4 warm storage; log pipeline (Scribe); memcache lease/thundering-herd protections at scale.
- → Weakness we exploit: privacy erosion, engagement-bait, aging UX, no agent, no unified currency.

**Pinterest**
- Visual discovery via PinSage: a GraphSAGE GNN over the pin↔board bipartite graph producing pin embeddings at billion-scale, trained with random-walk neighborhood sampling.
- Related pins served by Pixie: an in-memory C++ random-walk engine over the board-pin graph for real-time recommendations.
- Home feed ranked by the Pinnability model; visual search ("Lens") = object detection + visual embeddings + ANN retrieval.
- → Weakness we exploit: inspiration-only, no messaging/agent, weak native checkout, no realtime social.

### What we build to beat them
- **Steerable, transparent feed.** A "why am I seeing this?" panel on every post + sliders ("more art, less politics", "chronological within follows"); Quanty rewrites your ranking prefs from a sentence ("stop showing me gym content").
- **Quanty auto-scroll + narration.** Hands-free browse: Quanty scrolls, reads captions aloud, describes images (accessibility/commutes), and auto-likes/saves per your rules — no incumbent lets an agent drive the feed.
- **Visual discovery that buys.** Pinterest-grade GNN visual search wired to `packages/quant-commerce`: any object in a photo is tappable → creator storefront → checkout in credits, one wallet.
- **Cross-app remix.** One capture posts to QuantGram + a QuantChat story + QuantWave with per-surface crops; DMs are the *same* thread as QuantChat (shared conversation store), not a second inbox.
- **Creator economy in one currency.** Tips, subscriptions, shoppable tags, virtual gifts (existing `virtual-gifts` service) all settle in credits, instantly, cross-app.

### Core features
- **Feed & discovery:** AI-ranked home feed, chronological toggle, Explore, hashtags, visual search, trending, saved/collections (Pinterest boards).
- **Content:** photo/video posts, carousels, stories (24h), reels, filters/AR lenses, alt-text, drafts, scheduling.
- **Social:** follow/close-friends, likes/comments/saves/shares, DMs (shared with QuantChat), profiles, SSO-backed verified badges, map of posts.
- **Creator:** insights/analytics, shoppable tags, subscriptions, tips, virtual gifts, collabs/co-author posts.
- **Games:** in-feed mini-games + leaderboards.

### Deep / micro features (the long-tail lock-in)
- Close-friends green ring, story highlights, story polls/quizzes/sliders/question stickers, link stickers.
- Collections/boards with collaborators; "save to board" from any app; auto-board suggestions via visual embeddings.
- Filters with on-device face/segmentation ML; retouch/relight; per-post aspect crops; drafts + best-time-to-post from analytics.
- Alt-text auto-generated by Quanty (accessibility + search); AI captions/hashtags; comment filters + kindness nudges.
- Pinned posts, archive, close-friends-only, hide-like-counts, restrict/mute, per-post comment controls.
- Reels remix/duet-style, templates, trending-audio attach; carousel drag-reorder; collab-post shared to both grids.

### UI/UX & 3D
- Immersive 3D story viewer (react-three-fiber): stories as a curved carousel/cube with depth parallax, GLSL transitions, gyroscope tilt on mobile; reels with buttery snap-scroll (Framer Motion) and shader transitions.
- WebGL2/WebGPU filter pipeline shared with QuantChat lenses; GSAP micro-interactions (double-tap heart burst with rapier confetti physics).
- Pinterest-style masonry with progressive image loading, blurhash placeholders, virtualized scroll; per-device: desktop multi-column + keyboard nav, mobile gesture-first, web SEO-friendly profiles.
- Accessibility: mandatory alt-text (auto + editable), reduced-motion disables 3D/shaders, screen-reader feed narration via Quanty, captions on all video.

### Data & backend
- **Prisma domains:** User, Profile, Post, MediaAsset, Carousel, Story, StoryHighlight, Reel, Filter/Lens, Comment, Like, Save, Board/Collection, Follow, CloseFriend, DM (shared Conversation), Hashtag, ShoppableTag, Product, Gift, GameSession, Leaderboard.
- **Backend routes:** `feed`, `explore`, `posts`, `photos`, `reels`, `stories`, `filters`, `ar-lenses`, `dm`, `profiles`, `games`, `notifications`, `federation`, `ai`.
- **Realtime/streaming:** `services/ws-gateway` for likes/comments/DM presence; `services/signal-projector` projects engagement events (Kafka CDC) into `packages/ranking`/`packages/recommendation`; `services/search-indexer` keeps Meilisearch + Qdrant fresh.
- **Storage:** R2 for photos/reels (multi-resolution derivatives + blurhash); `services/video-transcoder` for reels; Redis for feed cache + counters.
- **Search:** Meilisearch full-text (captions, hashtags, users) + Qdrant visual/text embeddings for Explore, visual search, and "similar posts."
- **Moderation:** `services/moderation-worker` (nudity/violence/CSAM classifiers, spam), comment-toxicity model with kindness nudges, C2PA provenance labeling of AI media.

### Cross-app integration
- **Quanty actions:** "scroll my feed and read it to me" → auto-scroll + TTS narration; "post this to Gram, my Chat story, and Wave" → cross-publish with per-surface crops; "show me more ceramics, less fitness" → rewrite ranking prefs; "who liked my last reel?" → summarize; "buy that jacket in the photo" → visual-match → checkout in credits.
- **SSO:** QuantMail OAuth2; verified badge derives from SSO identity assurance.
- **Credits:** tips, subscriptions, shoppable checkout, gifts, boosts — one wallet.
- **Notifications:** delivered through QuantChat.
- **Shared AI-memory:** taste graph (saved/liked embeddings) stored in QuantMail Drive/Qdrant, reused by QuantWave feed and QuantMax profile ranking.
- **Links:** DMs = QuantChat conversations; posts embeddable in QuantWave; storefronts powered by `quant-commerce`; capture pipeline shared with QuantChat camera.

### Platform presence
- **Web:** SEO-friendly profiles, full feed/Explore, creator studio, visual search.
- **Desktop (Tauri):** bulk upload + scheduler, multi-account creator dashboard, drag-drop from filesystem, native export.
- **Mobile (Capacitor):** camera + AR filters, stories capture, gyro 3D story viewer, haptic interactions, share-sheet ingest.
- **Own admin panel:** content-moderation queues, creator-monetization/payout tooling, ranking-experiment (A/B) console, hashtag/trend safety.
- **Own marketing page:** creator-economy pitch (one-wallet payouts), steerable-feed differentiator, visual-search demo.

## QuantWave — "X/Twitter + Threads + Reddit killer"
**Now:** scaffolded (web + backend exist) · **Target:** GA public-conversation network with dual anonymous + verified spaces, community forums, and an agent that reads/writes the feed for you.

### Vision
QuantWave is the ecosystem's public square: X's real-time broadcast + Threads' conversational feed + Reddit's community forums and vote-ranked discussion — split into a verified-only space (SSO-backed, high-trust) and a truly anonymous section (unlinkable pseudonyms, still moderated). Quanty can read the feed aloud, scroll, draft, schedule, post, and comment on your behalf. The hook: one home for both accountable public discourse and safe anonymous speech, with an agent that turns "post a thread about X" into a published thread.

### Competitors & their real architecture

**X / Twitter**
- Home timeline is candidate-sourced (~1500 in/out-of-network tweets) then scored by a large neural heavy-ranker (MaskNet-style, ~48M params), then heuristic reranking (author diversity, visibility filtering, feedback).
- SimClusters: community detection via matrix factorization into ~145k communities → sparse embeddings for candidate gen; Real Graph predicts pairwise interaction probability; GraphJet is the in-memory real-time interaction-graph engine.
- Storage/serving: Manhattan (distributed KV), Tweetypie (tweet service), EarlyBird (Lucene real-time search index) + Blender; Snowflake time-sortable 64-bit IDs.
- Fan-out is hybrid: fan-out-on-write into Redis timeline caches for normal accounts, fan-out-on-read for high-follower "celebrity" accounts to avoid write storms.
- → Weakness we exploit: no anonymity, health/toxicity regressions, no agent, no economy beyond subscriptions/ads.

**Threads**
- Rides Instagram infrastructure (shared identity + social graph, TAO, IG-style ranking stack); federates partially via ActivityPub; feed is ML-ranked, engagement-first.
- → Weakness we exploit: thin, IG-tethered, no communities/forums, no anonymity, no agent.

**Reddit**
- "Hot" ranking ≈ log10(score) + sign(score)·(t/45000): a logarithmic vote score plus a time term, so early votes dominate and posts decay predictably.
- Best-comment sort uses the Wilson-score confidence-interval lower bound on the upvote proportion (not raw score), so small-sample comments aren't over-ranked.
- Historic EAV "thing/data" schema on Postgres + Cassandra caches; nested comment trees materialized/cached; vote fuzzing + anti-brigading; AutoModerator is a YAML rules engine.
- → Weakness we exploit: dated tech + poor media/realtime, moderation burden on volunteers, no verified/anon duality, no economy beyond removed coins.

### What we build to beat them
- **Dual identity as a first-class feature.** A verified space (SSO identity assurance, real-name optional) *and* an anonymous section with cryptographically unlinkable pseudonyms — but anonymity ≠ impunity: `anonymous-moderator` + trust/rate scoring keep it safe.
- **Quanty runs the feed.** "Read me the top of my timeline", "draft a thread on X and schedule 9am", "reply supportively to that", "summarize this 400-comment thread", "post this poll to the quant-builders community" — full read/write/scroll/schedule agency no incumbent offers.
- **Communities + broadcast unified.** X-style timeline *and* Reddit-style communities with vote-ranked threads (hot/best/controversial via Wilson score) in one app, one identity, cross-posted with per-space norms.
- **Economy for discourse.** Tips, paid writer subscriptions, credit-boosted posts, PK-battle wagers (existing `pk-battle` service), community bounties — one wallet; the anon space uses credit-gated posting to throttle spam without doxxing.
- **Health by design.** Transparent ranking, tone/"are you sure?" nudges, community-note-style crowd context, and Quanty fact-check on request.

### Core features
- **Feed:** AI-ranked + chronological home timeline, following/for-you, trending, hashtags, lists, bookmarks, hybrid fan-out.
- **Posting:** text/media posts, threads, quotes, reposts, replies, polls, long-form, scheduling, edit window.
- **Communities:** forums/subs with vote ranking (hot/best/controversial), flairs, wikis, mod tools, AutoMod-style rules.
- **Anonymous space:** unlinkable pseudonyms, credit-gated posting, dedicated moderation, ephemeral option.
- **Discovery/social:** follow, notifications, mentions, proximity "radar", people/community matchmaking (existing `matchmaking` service).
- **Live:** PK-battles, live threads, real-time trending.

### Deep / micro features (the long-tail lock-in)
- Vote fuzzing + brigade detection; Wilson-score comment sort with a "controversial" toggle; collapse/expand comment trees with continuation loading.
- Community notes (crowd context) ranked by helpfulness; user-controlled author-diversity + out-of-network exploration knobs.
- Bookmarks/folders, lists, mute words/threads, advanced search operators, saved searches, "quiet posting".
- Scheduled + draft threads, auto-thread from long text; per-space identity switcher (verified ↔ anon) with hard leak-prevention.
- Anonymous handle rotation, per-post pseudonym, no cross-post correlation; credit-gated first post to deter spam rings.
- Reader mode + TTS; poll variants (ranked, multi-select); trending explainers via Quanty.

### UI/UX & 3D
- Fast, text-first, latency-obsessed timeline (virtualized, optimistic posting) — speed is the feature; motion kept subtle (Framer Motion).
- 3D "trending galaxy"/topic-map (react-three-fiber, WebGL2): communities as a force-directed graph you can fly through; radar/proximity as a spatial-sonar visualization (GLSL).
- PK-battle live view with animated vote meters (GSAP) and real-time bars; the anonymous space gets a visually distinct "masked" theme so users always know which identity is active.
- Per-device: desktop multi-column (TweetDeck-style) + keyboard shortcuts, mobile swipe-between-timelines, web fast SSR for SEO.
- Accessibility: reader/TTS mode, reduced-motion disables the 3D galaxy, full keyboard nav, high-contrast.

### Data & backend
- **Prisma domains:** User, VerifiedProfile, AnonymousIdentity, Post, Thread, Repost, Quote, Comment, Vote, Poll, Community, Membership, Flair, Follow, List, Bookmark, Notification, PKBattle, RadarPing, Interaction.
- **Backend routes:** `feed`, `posts`, `interactions`, `follow`, `communities`, `anonymous`, `radar`, `pk-battle`, `notifications`, `auth`, `ai`.
- **Realtime/streaming:** `services/ws-gateway` for live timeline/notifications; hybrid fan-out via Redis timeline caches + `services/signal-projector` (Kafka CDC) into `packages/ranking`; `matchmaking.service` for people/community suggestions.
- **Storage:** Postgres (posts, votes, comment trees), Redis (timelines, counters, trending), R2 (media); Snowflake-style sortable IDs.
- **Search:** Meilisearch full-text (posts, communities, operators) + Qdrant embeddings (semantic search, SimClusters-style community embeddings, dedupe).
- **Moderation:** `services/moderation-worker` + `anonymous-moderator` (trust scoring, spam-ring detection), toxicity/tone models, credit-gating as anti-spam, community-note pipeline.

### Cross-app integration
- **Quanty actions:** "read my timeline aloud and scroll" → TTS + auto-scroll; "draft a thread about the launch and schedule 9am" → compose + schedule; "summarize this thread"/"fact-check this" → inline; "post this anonymously to the vent community" → switch identity + post; "reply to @x saying congrats" → draft + (confirm) send.
- **SSO:** QuantMail OAuth2 for the verified space; the anonymous space issues SSO-derived but unlinkable blinded credentials.
- **Credits:** tips, subscriptions, boosts, PK-battle wagers, anti-spam posting gates.
- **Notifications:** via QuantChat.
- **Shared AI-memory:** interest/interaction graph in QuantMail Drive/Qdrant, shared with QuantGram feed + QuantMax matching.
- **Links:** cross-post to QuantGram; escalate DMs into QuantChat; share posts into QuantMail; communities can spin up QuantChat servers.

### Platform presence
- **Web:** fast SSR public profiles/threads (SEO), full timeline + communities, anon space.
- **Desktop (Tauri):** multi-column TweetDeck layout, keyboard-driven power posting, scheduled-thread manager, live-column pinning.
- **Mobile (Capacitor):** swipe timelines, radar/proximity, quick-post + voice-to-thread, identity switcher with anti-leak guard.
- **Own admin panel:** ranking/health dashboards, brigade + spam-ring detection, community-note review, anon-space trust tuning, verified-badge issuance.
- **Own marketing page:** dual verified/anon positioning, transparent-ranking pitch, "agent-runs-your-feed" demo.

## QuantMax — "TikTok + Omegle + Tinder killer"
**Now:** scaffolded (web + backend exist) · **Target:** GA short-video + live social-discovery app fusing a TikTok feed, safe random-chat, dating, and multiplayer 3D game rooms with spatial voice.

### Vision
QuantMax is the ecosystem's play-and-meet surface: TikTok's addictive short-video ForYou feed, Omegle's serendipitous random chat (made safe by SSO identity + Quanty moderation), and Tinder's swipe-dating — plus multiplayer gaming rooms, squads, party games and proximity/spatial voice. The hook: you don't just scroll or swipe — you drop into a live 3D room with strangers or your squad, voice-first and game-native, with an AI wingman/host that keeps it fun and safe.

### Competitors & their real architecture

**TikTok**
- ForYou is a real-time recommender (ByteDance "Monolith"): collisionless embedding tables (cuckoo-hashmap feature IDs) with online/streaming training, so the model updates within minutes of your watch behavior; retrieval + ranking on watch-time, finish-rate, replays, likes, shares.
- A video-understanding pipeline enriches cold-start + tagging: CV (scene/object), ASR (speech→text), OCR (on-screen text), audio fingerprinting → content embeddings.
- Streaming feature pipeline (Kafka/Flink), aggressive next-video prefetch + adaptive-bitrate CDN for instant playback.
- → Weakness we exploit: black-box with zero user control, no identity/dating/rooms, data-sovereignty concerns, no transparent economy.

**Omegle**
- Random 1:1 pairing via a matchmaking queue; WebRTC video peer-to-peer (STUN/TURN), text relayed by server; optional interest-tag bucketing to match common interests.
- Effectively no identity + minimal moderation → predation problems → shut down 2023.
- → Weakness we exploit: it died from unsafety; we keep the serendipity but add SSO identity, age assurance, Quanty realtime moderation, and report/ban with real consequences.

**Tinder**
- Double opt-in swipe = match; ML relevance ranking (moved off the old Elo desirability score); write-heavy swipe ingestion at billions/day.
- Geosharding: users bucketed by location (S2 cells / geohash, historically Elasticsearch geo) so "nearby" queries hit only local shards.
- Smart-photos; boosts/super-likes as paid ranking levers.
- → Weakness we exploit: pay-to-win, shallow photo-only profiles, catfishing (no verified identity), no shared activity/games, no agent icebreaker.

### What we build to beat them
- **Safe serendipity.** Random chat with SSO-verified identity + age assurance + real-time Quanty moderation (audio/video classifiers, escalation, one-tap report→ban) — Omegle's magic without Omegle's harm.
- **Meet by *doing*, not swiping photos.** Multiplayer 3D game rooms + party games + proximity/spatial voice: you match by playing together; dating profiles link to your real cross-app presence (verified, not catfish).
- **Quanty as host/wingman.** Breaks the ice, suggests openers, runs party-game logic, translates live across languages, and moderates; "find me a trivia room with people near me" → matchmaking → drop into a 3D room.
- **Transparent, steerable feed.** TikTok-grade recommendation but with "why this video" + user controls + creator payouts in credits (one wallet), not an opaque black box.
- **One identity, one wallet.** Boosts, super-likes, game entry fees, tips, cosmetics all in credits; your QuantMax profile is your ecosystem identity, so trust travels.

### Core features
- **Short video:** ForYou ranked feed, following, sounds, effects, duet/remix, creator tools, live streaming.
- **Random & live:** safe random video/text chat, interest matching, live rooms, spatial voice.
- **Dating:** swipe/match, rich cross-app-verified profiles, likes, super-likes, boosts, geolocation "nearby."
- **Gaming:** multiplayer game rooms, squads, party games, matchmaking, leaderboards, cross-app-gaming.
- **Commerce/economy:** tips, gifts, entry fees, cosmetics, creator payouts — credits.
- **Safety:** SSO identity, age assurance, report/block, `moderation-worker` + Quanty realtime.

### Deep / micro features (the long-tail lock-in)
- Swipe deck with undo/rewind, super-like, boost windows, "who liked you", match expiry, Quanty-generated icebreaker prompts.
- Geosharded "nearby" with privacy radius + ghost mode; passport/travel mode; verified-photo badge (liveness via SSO).
- Random-chat interest tags, skip cooldowns, reconnect, "add friend → QuantChat", language auto-match + live translation.
- Party games (trivia, drawing, werewolf-style, mini-arcade) with server-authoritative state; squad voice with spatial falloff; room cosmetics/skins.
- Short-video: green-screen, sound sync, captions/auto-subtitle, stitch/duet, watch-time-aware autoplay, "not interested", creator analytics.
- Live gifting with animated 3D gifts; PK-style creator battles; co-host rooms.

### UI/UX & 3D
- **This is the 3D flagship of the cluster.** Multiplayer game/dating rooms in three.js/react-three-fiber + rapier physics: avatars in a shared 3D space, seat-based **spatial voice** (WebRTC + distance-attenuated Web Audio panner), interactive props, party-game scenes.
- WebGPU where available (WebGL2 fallback) for high-density rooms; GLSL shaders for effects/gifts; GSAP/Framer Motion for swipe physics; short-video feed reuses the QuantChat lens runtime for GPU effects.
- Per-device: mobile is the hero (camera, gyro, haptics, spatial audio via headphones), desktop (Tauri) for creator/streaming + big-room hosting, web for quick-join room links.
- Accessibility: captions/auto-subtitle on all video, spatial-audio mono-mix option, reduced-motion 2D room fallback, screen-reader profile cards, colorblind-safe game UI.

### Data & backend
- **Prisma domains:** User, Profile, Video, Sound, Effect, Swipe, Match, LikeYou, RandomSession, LiveRoom, GameRoom, Squad, PartyGame, MatchmakingTicket, Gift, Boost, SafetyReport, ModerationCase.
- **Backend routes:** `feed`, `videos`, `swipes`, `matches`, `matching`, `profiles`, `random-chat`, `videochat`, `live`, `squads`, `safety`, `commerce`, `economy`, `payments`, `ai`.
- **Realtime/streaming:** `services/ws-gateway` for room/presence/matchmaking signalling; `packages/webrtc` + SFU for live/random/room media; server-authoritative game state; `services/signal-projector` (Kafka CDC) → recommendation + matching models.
- **Storage:** R2 for videos (multi-bitrate via `services/video-transcoder`) + assets; Redis for matchmaking queues, presence, geo buckets; Postgres for swipes/matches/rooms.
- **Search/matching:** Qdrant embeddings for video rec + dating compatibility + interest matching; Meilisearch for discovery; geosharding (S2/geohash) for "nearby."
- **Moderation:** `services/moderation-worker` + realtime audio/video classifiers on random-chat/live, age assurance, liveness/verified-photo, Quanty escalation, CSAM hashing.

### Cross-app integration
- **Quanty actions:** "find a trivia room with people near me" → matchmaking + drop into a 3D room; "be my wingman" → suggest openers/moderate; "who liked me?" → summarize; "start a squad game with my QuantChat friends" → pull graph + create room + invite via QuantChat; "translate this random chat" → live STT+MT; "post this clip to Gram + Wave" → cross-publish.
- **SSO:** QuantMail OAuth2 with age assurance + liveness for verified/dating trust.
- **Credits:** boosts, super-likes, game entry fees, gifts, cosmetics, creator payouts — one wallet.
- **Notifications:** matches/likes/room invites via QuantChat.
- **Shared AI-memory:** interest/compatibility graph in QuantMail Drive/Qdrant, reused across QuantGram/QuantWave.
- **Links:** match → QuantChat DM; friends pulled from QuantChat graph; clips → QuantGram/QuantWave; game achievements feed `cross-app-gaming`.

### Platform presence
- **Web:** short-video feed, quick-join room links, browser WebRTC rooms, profile discovery.
- **Desktop (Tauri):** creator/streaming studio, big-room hosting, multi-cam, tournament/squad management.
- **Mobile (Capacitor):** hero surface — camera + effects, swipe, spatial-audio rooms (headphones), gyro, haptics, geolocation, background VoIP.
- **Own admin panel:** safety/abuse queues (priority for random-chat/live), age-assurance + liveness review, matchmaking/rec tuning, creator payouts, tournament ops.
- **Own marketing page:** "meet by playing" positioning, safety-first (vs Omegle) messaging, verified-dating (vs catfishing) pitch, game-room showcase.
