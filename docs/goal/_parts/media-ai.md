> Part of the Quant Ecosystem north-star (GOAL.md). Target-state vision for the
> media & AI cluster: the content-consumption surface (QuanTube), the content-
> creation engine (QuantCooks), and the super-app cockpit (QuantAI). One identity
> (QuantMail OAuth2/OIDC SSO), one currency (Quant Credits, 1 credit ≈ $1), one
> omnipresent agent (Quanty). Stack: pnpm + Turborepo, Next.js 15 / React 19,
> Fastify 5, PostgreSQL + pgvector / Prisma, Redis, Kafka CDC, Meilisearch +
> Qdrant, WebRTC, multi-model AI via OpenRouter, Cloudflare R2, Kubernetes. The
> cross-cutting Quanty agent/runtime layer has its own doc; this part references
> it rather than re-specifying it.

## QuanTube — "YouTube + Bilibili + Spotify + short-drama killer"
**Now:** scaffolded (web + backend exist) · **Target:** flagship media OS — every format (long video, Shorts, episodic short-drama, live, music) on one R2 pipeline, one recommendation core, one wallet, with an AI director that *operates* the player.

### Vision
One media graph for every format under a single identity, wallet, and AI director. Where YouTube, Spotify, and the short-drama apps are separate silos with separate subscriptions and separate recommendation stacks, QuanTube unifies catalog, playback, and monetization on one Cloudflare R2 pipeline. Quanty runs the player as an agent — task-driven watching, transcript-aware segment-skip, cross-app clip harvesting — so watching becomes doing.

### Competitors & their real architecture

**YouTube**
- Ingestion → transcode ladder: uploads are chunked on GOP boundaries and transcoded into a rendition ladder (H.264, VP9, AV1 on premium tiers) across resolutions/bitrates; audio to Opus/AAC.
- Delivery: fragmented MP4/WebM served over DASH (HLS for Apple) with client-side ABR switching per segment; edge-cached on Google's CDN + ISP-embedded Global Cache nodes.
- ContentID: rightsholders upload references; YouTube computes audio fingerprints + perceptual video hashes and matches every upload against the reference DB, firing claim/block/monetize policies.
- Recommendations: two-stage deep neural system — candidate generation as extreme-multiclass retrieval (learned user + video embeddings served via approximate nearest neighbor) then a ranking net predicting expected watch time; evolved into multi-task MMoE + an RL/REINFORCE layer optimizing long-term satisfaction over raw clicks.
- Live: RTMP/SRT ingest → low-latency chunked HLS/DASH with a DVR window in object storage.
- → Weakness we exploit: it optimizes watch-time/ad-load, not your stated goal; video, music, and Shorts live in separate apps with fractured history; no cross-app wallet; no agent that can operate the player toward a task.

**Spotify**
- Storage/encoding: tracks stored as Ogg Vorbis at 96/160/320 kbps (AAC for web/some clients), pushed to CDN; clients cache encrypted segments locally.
- Streaming: proprietary chunked delivery (not HLS); gapless playback via look-ahead buffering + crossfade; offline via encrypted local cache.
- Recommendation stack: hybrid — collaborative filtering (matrix factorization over the co-listen/playlist graph), NLP over crawled text about artists/tracks, and raw-audio CNNs on spectrograms for cold-start of unheard tracks; Home ranked by BaRT contextual bandits balancing explore/exploit.
- Discovery: Discover Weekly / Release Radar batch-computed weekly from taste vectors + playlist co-occurrence; "audio features" (danceability, energy, tempo) from the Echo Nest lineage.
- → Weakness we exploit: audio-only, no video or creator-owned catalog blending; a separate app + separate subscription from video; no user-owned credit wallet or direct creator tipping; no agentic "learn/DJ toward my goal" beyond a canned AI DJ.

**Bilibili**
- Danmaku (弹幕): time-synchronized comment overlays streamed as a separate track — each comment carries a playback offset and is rendered as scrolling/positioned text over the video canvas, deduped and collision-avoided client-side; server keeps a rate-limited, moderated danmaku pool per video.
- PGC/UGC split: licensed professional content (anime/dramas as seasons/episodes/bangumi) vs user uploads, with distinct players and rights handling.
- Delivery: standard HLS/DASH ABR plus P2P CDN assist on some clients to cut bandwidth cost.
- → Weakness we exploit: danmaku + episodic drama are siloed to one app/culture; no unified music; no Western-grade creator payout in one wallet; no AI director.

**Short-drama apps (ReelShort / DramaBox)**
- Vertical 1–2 minute episodes; seasons of 50–100 micro-episodes; aggressive per-episode paywall via "coins" bought as in-app purchases.
- Hook-optimized recommendation: the first 3 seconds drive retention, and every episode ends on a cliffhanger engineered to force the next unlock.
- Delivery: pre-transcoded vertical HLS on CDN, with heavy A/B testing of thumbnails and first frames.
- → Weakness we exploit: predatory coin economies with no real currency and no refunds; zero creator tooling to *produce* the dramas (we own that via QuantCooks); no cross-format home.

### What we build to beat them
- **One catalog, five formats:** long video, Shorts (vertical), episodic short-drama (series→season→episode graph), live, and full music streaming share one ingestion pipeline, one recommendation core, one player, one wallet.
- **Quanty as director/operator:** task-driven watching ("teach me to cook X" → Quanty searches QuanTube, opens the best video, reads its scene index + transcript, plays only the relevant step segments, narrates each, auto-pauses between steps, and saves the recipe to QuantMail Drive); transcript+scene AI segment-skip (sponsor/intro/recap); on-the-fly AI dubbing/translation of any track.
- **One-currency economy:** Quant Credits fund ad-free playback, channel subscriptions, fair refundable per-episode unlocks, superchat, tips, and music royalties; creators are paid in the *same* wallet and can cash out.
- **Deep cross-app supply + distribution:** QuantCooks auto-posts finished videos/music/dramas straight into QuanTube; clips harvested here flow to QuantGram Reels and QuantWave; QuantAds monetizes; QuantChat carries notifications; watch history in shared AI-memory informs every other app.
- **Intent-first recommendation:** optimize for the user's declared goal + long-term satisfaction (not raw watch-time), with transparent "why am I seeing this" and a user-tunable feed.

### Core features
- Long video: chapters, transcripts, multi-audio tracks, captions, up to 8K, AV1, HDR, frame-accurate seeking.
- Shorts: vertical feed, remix/duet, sounds library shared with the music catalog.
- Short-drama: series/season/episode model, credit-based per-episode unlock, binge mode, creator revenue split, cliffhanger-free "just play it" option.
- Music: full streaming catalog (albums/artists/playlists), gapless + crossfade, time-synced lyrics, AI DJ, unified likes across video + audio.
- Live: RTMP/SRT/WebRTC ingest, low-latency playback, credit superchat, co-streaming, DVR rewind.
- Channels, subscriptions, playlists, watch history, encrypted offline downloads, multi-device resume, watch-party rooms.
- Danmaku-style overlay comments (opt-in), reactions, timestamped comments, live chat.

### Deep / micro features (the long-tail lock-in)
- **Scene/segment index** per asset (shot-boundary detection + transcript + object tags) powering "jump to the part about X," instant clip export, and AI segment-skip.
- Frame-accurate AB-loop, pitch-corrected variable speed, per-scene speed presets.
- **Continue across formats:** pause a cooking video on desktop, resume its audio-only narration on mobile.
- Sleep timer; unified gapless queue mixing music + podcasts + video-audio; CarPlay/Android Auto mode.
- Creator studio: retention curves, A/B thumbnails, auto-chapter from transcript, monetization dashboard in credits.
- Loudness normalization (EBU R128) + per-track ReplayGain; Dolby/spatial audio.
- Accessibility: auto-captions, AI audio-description track (described video), high-contrast player, full keyboard control.

### UI/UX & 3D
- Direction: rose accent (`#F43F5E`, hue 350), cinematic dark-first, edge-to-edge player.
- **Immersive/spatial player:** react-three-fiber theater mode maps the video onto a curved plane in a 3D room; optional 180/360° and WebXR VR playback; ambient bias-lighting sampled from the frame's dominant colors via a WebGL pass.
- **3D music visualizers:** WebGL2/WebGPU GLSL shaders driven by a real-time Web Audio `AnalyserNode` FFT — spectrum-reactive particle fields and raymarched/fluid scenes, per-track presets, rendered on OffscreenCanvas so they never steal video frames.
- Short-drama reel transitions and Shorts feed use GPU shader wipes with a virtualized 60/120fps scroll.
- Performance: WebCodecs for low-latency decode + frame-accurate seek; MSE + custom ABR; OffscreenCanvas + Web Workers for overlays/visualizers; WASM for danmaku layout + subtitle shaping.
- Per-device: Tauri desktop uses hardware decode + system PiP + global media keys; Capacitor mobile uses a native player surface + background audio + cast; low-end devices fall back to a 2D player with shaders disabled.
- Accessibility: reduced-motion disables 3D, captions on by default, screen-reader-labeled transport controls.

### Data & backend
- Prisma domains: `Channel`, `Video`, `Series`/`Season`/`Episode`, `Track`/`Album`/`Artist`, `Playlist`, `LiveStream`, `WatchEvent`, `Comment`/`Danmaku`, `Subscription`, `Rendition`, `Caption`/`Transcript`, `SceneIndex`, `CreatorPayout`.
- Storage/streaming: originals + renditions in Cloudflare R2; packaged DASH/HLS with signed URLs and edge cache.
- **video-transcoder** (BullMQ-driven): ingest → shot-detect → transcode ladder (H.264/VP9/AV1, Opus/AAC) → package → thumbnail sprites → loudness-normalize → publish; music encoded to Ogg/AAC ladders.
- **search-indexer** → Meilisearch (titles, transcripts, lyrics, channels) + Qdrant (video/track/user embeddings for recs and semantic "find the part where…").
- Recommendations: candidate generation via ANN over Qdrant embeddings + collaborative-filtering signals from the `WatchEvent` stream (Kafka CDC via **cdc-relay** → feature store); ranking model served through `@quant/ai`; BullMQ batch jobs build Discover-Weekly-style mixes.
- **moderation-worker:** perceptual-hash + model scan on ingest (CSAM/copyright/violence), ContentID-style fingerprint matching against a reference DB, realtime danmaku/live-chat moderation.
- **signal-projector:** projects raw events into per-user taste vectors + creator analytics.
- Live path: ingest → transcoder → low-latency HLS + a WebRTC route; chat/superchat over **ws-gateway**.

### Cross-app integration
- "Teach me to cook paneer" → Quanty searches QuanTube, opens the top-ranked video, reads its `SceneIndex` + transcript, plays only the cooking-step segments, narrates each, pauses between steps, and saves the recipe to QuantMail Drive.
- "Skip the sponsor" / "just play the chorus" → Quanty seeks via `SceneIndex`.
- "Turn this into a Short" → hands the clip to **QuantCooks**, which auto-edits and (on approval) auto-posts to QuanTube Shorts + QuantGram Reels + QuantWave.
- "Make a playlist for my run" → Quanty builds it from the taste vector + tempo audio-features.
- **SSO:** QuantMail OIDC — one identity across web/desktop/mobile.
- **Credits:** ad-free, channel subs, episode unlocks, superchat, tips, and music royalties all settle in Quant Credits; creator payouts land in the same wallet.
- **Notifications:** new uploads, live-start, and drops fan out through **QuantChat**.
- **Shared AI-memory:** watch history + stated goals live in QuantMail Drive and inform Quanty everywhere (QuantAI dashboards, QuantCooks topic ideas). **QuantAds** serves in-stream/display inventory.

### Platform presence
- **web:** Next.js 15 (RSC) streaming player + catalog.
- **desktop (Tauri):** hardware decode, PiP, background music, global media keys, offline vault.
- **mobile (Capacitor):** native player, background audio, downloads, CarPlay/Android Auto, cast.
- **own admin panel:** catalog/rights + ContentID review, moderation queue, payout ledger, live ops, recommendation-model dashboards.
- **own marketing page (`/tube`):** creator-acquisition + "one app for video, music, drama, and live."

---

## QuantCooks — "Higgsfield + Figma + CapCut + After Effects + Runway killer"
**Now:** scaffolded (web + backend exist) · **Target:** the ecosystem's autonomous content engine — set a topic once and Quanty generates, edits, and auto-posts on a schedule, backed by a pro-grade GPU multiplayer timeline + node compositor.

### Vision
QuantCooks is the content engine that keeps the whole social side fed. Set a topic once; Quanty designs the workflow, generates and edits the footage, and auto-publishes on a schedule to QuanTube/QuantGram/QuantWave — while still offering a pro-grade, GPU-accelerated multiplayer timeline and node compositor for hands-on creators. It fuses Runway's generation, CapCut's editing, and Figma's real-time collaboration, then wires the output straight into distribution and a real payout economy.

### Competitors & their real architecture

**Runway / Higgsfield (generative video)**
- Latent video diffusion: video is encoded to a spatiotemporal latent, a diffusion transformer is trained to denoise it conditioned on text/image/motion, then latents are decoded back to frames; Runway's Gen-4/Gen-4.5 push character + scene consistency across shots.
- Conditioning: text + reference image (first/last frame) + motion brush and cinematic camera-control presets (Higgsfield's specialty); Google Veo adds natively synchronized generated audio.
- Serving: heavy GPU inference — slow and expensive per second (Sora 2 Pro ran ~\$0.30/s; OpenAI shut Sora down on 2026-03-24 after burning ~\$15M/day on compute against tiny revenue; Veo Lite ~\$0.05/s). Runway Gen-4.5, Google Veo 3.1, Kling 3.0, and Seedance now lead a fragmented market.
- → Weakness we exploit: pure generators are point tools — no timeline, no multiplayer, no auto-posting, no distribution, no wallet, and brutal per-second economics with no creator monetization loop. We route generation across models via OpenRouter (cheapest model that clears the shot's quality bar), cache aggressively, and wrap it in a full studio + distribution + payout.

**CapCut (ByteDance)**
- Hybrid render: an on-device C++ editing engine drives real-time preview + timeline, with cloud rendering offloaded for heavy effects/exports, in a tight TikTok publish loop.
- Effects graph: layered effects, keyframes, ASR auto-captions, segmentation-based background removal, beat-synced templates, and a huge template + sound library.
- → Weakness we exploit: locked to TikTok's ecosystem; no true multiplayer; no open node graph; no cross-platform auto-posting into a wallet-backed network; templates are canned, not agent-generated.

**Figma (multiplayer engine)**
- Renderer: the performance-critical core is C++ compiled to WebAssembly, drawing the document through a tiled WebGL renderer (WASM cut load time ~3×); the C++ address space is one big JS typed array.
- Multiplayer: client/server over WebSockets with a separate server process per document, using a *simplified CRDT* — the server holds the latest value per (object, property) as a last-writer-wins register, so conflicts only exist between two writes to the same property of the same object. It deliberately picks "the dumber algorithm" because every edit is centrally ordered (not full CRDT, not OT).
- Structure: objects point to parents; sibling order uses fractional indexing so inserts never renumber siblings; LiveGraph pushes updated query results to clients at scale.
- → Weakness we exploit: Figma is a design canvas, not video/timeline — no generation, no render pipeline, no distribution. We adopt its server-authoritative LWW-register model and apply it to a video timeline + node graph.

**After Effects**
- Composition/layer model: comps hold layers on a timeline, each layer with an effects render tree; keyframe interpolation + expressions for procedural animation; GPU-accelerated (Mercury) for some effects, CPU for others.
- → Weakness we exploit: desktop-only, single-player, steep, with no cloud/auto pipeline, no AI generation, and no distribution.

### What we build to beat them
- **Topic-to-published autonomy:** the user states a topic + cadence once → Quanty builds an **Automation** (a persisted workflow DAG): research → script → generate scenes (multi-model via OpenRouter) → assemble on the timeline → auto-edit (captions, beat-cuts, B-roll) → render → schedule → auto-post to QuanTube/QuantGram/QuantWave → report performance → iterate. Human approval gates wherever the user wants them (Trust-before-intelligence).
- **Best-model routing + cost control:** OpenRouter routes each shot to the cheapest model that clears a quality bar; a semantic cache dedupes generations; credits show the true per-shot cost — directly attacking the per-second economics that killed Sora.
- **Multiplayer timeline + node compositor** with a Figma-style server-authoritative LWW model, so teams *and* Quanty can co-edit in real time.
- **Distribution + payout built in:** one click (or one automation) posts everywhere, and earnings from those posts flow back as Quant Credits — the engine literally feeds the ecosystem's social side and pays creators from the same wallet.

### Core features
- Multiplayer timeline editor: tracks, clips, transitions, keyframes, audio, captions, real-time collaboration + presence cursors.
- Node-graph compositor: effects/filters/generators as GPU-executed nodes; reusable, shareable graphs.
- AI generation: text→video, image→video, inpainting/outpainting, style transfer, camera-motion presets, AI voiceover/dubbing, music generation, auto-captions, background removal, upscaling.
- Templates + brand kits; multi-aspect export ladder (vertical/square/wide); server-side render farm.
- Automations gallery: reusable topic→post workflows on schedules, installable and shareable.
- Direct publish + cross-post scheduling to QuanTube, QuantGram, and QuantWave.

### Deep / micro features (the long-tail lock-in)
- Frame-accurate scrubbing via WebCodecs; proxy/optimized-media workflow; resumable background renders.
- Auto-editing: silence/filler removal, beat-synced cuts, auto-B-roll pulled from the QuanTube library, subject-tracking auto-reframe per aspect ratio, auto-chapter.
- Shot consistency: character/style reference locking across generated shots, seed control, regenerate-just-this-region.
- Project versioning + branching on the **git-server** backend; timeline comment threads; frame-level annotations.
- Cost preview: estimated credits per render/generation before committing; a per-model quality/cost picker.
- Asset library synced to QuantMail Drive with license/rights tracking; watermark / no-watermark tiers.
- Deterministic re-render: the project is data, renders are reproducible from it.

### UI/UX & 3D
- Direction: violet accent (`#7C3AED`, hue 270), dark, dense, pro-studio.
- **GPU-accelerated WebGL2/WebGPU timeline + compositor:** the preview canvas is a real-time compositor (Figma's WASM+WebGL approach, applied to video) — layers and effects run as GLSL/WGSL shader passes on OffscreenCanvas, with a WASM core for the timeline model + effect-graph scheduling.
- **3D scene editor:** react-three-fiber for 3D titles, camera paths, and particle systems, plus compositing generated video onto 3D planes; a node-graph UI for shaders/effects.
- Multiplayer cursors + selection halos and live co-presence, driven by the LWW document state.
- Performance: WebCodecs decode/encode, OffscreenCanvas + Web Workers, WASM effect kernels, WebGPU compute for effects/upscaling; proxy media for smooth scrub while final quality renders on the backend farm.
- Per-device: Tauri desktop taps the native GPU + local export (and local model inference where available); Capacitor mobile is capture → quick-edit → approve-and-post; low-power devices edit via proxies and render in the cloud.
- Accessibility: keyboard-driven timeline, captions-first, reduced-motion, high-contrast; every AI action is explained and reversible.

### Data & backend
- Prisma domains: `Project`, `Timeline`, `Track`, `Clip`, `Effect`/`Node`, `Asset`, `Render`, `GenerationJob`, `Automation` (workflow DAG + schedule), `Publication` (target app + status), `BrandKit`, `Collaborator`/`Presence`, plus a `CreditLedger` link.
- Multiplayer: **ws-gateway** + a per-document server process holding the LWW-register state; `@quant/realtime`; ordered ops persisted to Postgres; **git-server** for project versioning/branching.
- Generation: `GenerationJob` queued on BullMQ → multi-model routing through `@quant/ai` over OpenRouter → results to R2; a semantic cache in Redis/Qdrant dedupes prompts; **moderation-worker** scans generated output before publish.
- Render farm: **video-transcoder** + GPU workers execute the render DAG, assemble the timeline server-side, loudness-normalize, and write outputs to R2.
- Automations: the workflow DAG is persisted; a scheduler (BullMQ repeatable jobs / CronJobs) triggers runs; `@quant/agent-runtime` executes steps; each cross-app post calls the target app's API behind a credits check; results (views/earnings) are projected back by **signal-projector**.
- Search: Meilisearch (assets/projects/templates) + Qdrant (asset embeddings for "find similar B-roll" and semantic template match).

### Cross-app integration
- "Make a daily 60-second street-food Short and post it every morning" → Quanty creates an Automation that pulls trends, scripts, generates + edits, and at 8am posts to QuanTube Shorts + QuantGram Reels + QuantWave, then reports views/earnings; the user approves the first run, then it runs autonomously.
- "Turn my QuanTube clip into a highlight reel" → imports from QuanTube, auto-edits, publishes back.
- "Cut this podcast into 5 clips for QuantGram" → auto-segments, reframes, captions, and schedules.
- **SSO** via QuantMail; assets + brand kits live in QuantMail Drive (shared AI-memory); Quant Credits meter every generation/render/post and receive payouts; **QuantAds** can promote finished posts; approval prompts + notifications flow through **QuantChat**; **QuantAI** can trigger and monitor Cooks automations from the super-app.

### Platform presence
- **web:** the full studio (timeline, compositor, generation, automations).
- **desktop (Tauri):** GPU export, local media, heavy projects, offline editing.
- **mobile (Capacitor):** capture, quick edit, approve-and-post, automation monitoring.
- **own admin panel:** render-farm/queue health, model-cost dashboards, moderation of generated content, template-marketplace review, payout ledger.
- **own marketing page (`/cooks`):** "set a topic, we make and post the videos" — the automation + auto-post showcase.

---

## QuantAI — "ChatGPT + Gemini + Claude + Notion AI + Perplexity killer"
**Now:** scaffolded (web + backend exist) · **Target:** the ecosystem's super-app — one conversation that controls every Quant app, every app's own AI, your agents, and (with permission) your device, on one identity and one wallet.

### Vision
QuantAI is the human-facing cockpit for the cross-cutting Quanty layer: a multi-model chat + agent workspace, an app launcher/control surface, and an automations gallery — all on one QuantMail identity and one Quant Credits wallet. From here the user talks to a single AI that reaches every sibling app and each app's own AI, runs agents, and automates tasks with permission, so they barely have to touch their phone. (The Quanty agent/runtime internals are specified in the cross-cutting layer doc; this section covers QuantAI *as an app*.)

### Competitors & their real architecture

**ChatGPT (OpenAI)**
- Serving: autoregressive transformer inference with a KV-cache, continuous batching, and speculative decoding; long-context handling; multimodal text/image/voice.
- Tools: function-calling/tool-use, a sandboxed code interpreter, browsing/RAG, and a per-user "memory" that stores salient facts and injects them into context; custom GPTs bundle a scoped prompt + tools.
- → Weakness we exploit: a walled garden — it can call its own tools but can't natively operate a suite of first-party apps or control your device across a real OS with a wallet; memory is per-product, not a portable identity + memory across an ecosystem.

**Gemini (Google)**
- Natively multimodal with very long context (1M+ tokens); tight Workspace/Android integration; on-device (Nano) + cloud tiers; agentic actions inside Google surfaces.
- → Weakness we exploit: locked to Google's own apps + Android, not model-agnostic, no open credit economy, and no ability to route to the best third-party model per task.

**Claude (Anthropic)**
- Tool use + MCP (Model Context Protocol) to connect external tools/data; computer-use (screenshot→action loop) to operate a desktop; artifacts; projects with memory.
- → Weakness we exploit: it's a model + protocol, not an app ecosystem — someone still has to build the apps, identity, wallet, and cross-app memory it acts on. That is exactly what Quant is.

**Notion AI**
- Block data model: every element (page, text, toggle, DB row) is a block with id/type/parent/ordered-children, stored relationally; AI does RAG over the workspace's blocks for Q&A + writing.
- → Weakness we exploit: a knowledge-base assistant bounded to Notion's own docs — no device control, no cross-app action, no model routing, no economy.

**Perplexity**
- Answer engine: query → multi-source retrieval → rerank → LLM synthesis with inline citations; threaded follow-ups; some agentic "actions."
- → Weakness we exploit: excellent at cited search but thin on *doing* — no first-party app control, no life-running automations, no wallet, no memory spanning your whole digital footprint.

### What we build to beat them
- **One cockpit over everything:** QuantAI talks to all 8 sibling apps and each app's own AI, orchestrates agents, and (with permission) controls the device — through the cross-cutting Quanty layer. QuantAI is its UI + control surface.
- **True multi-model routing:** an OpenRouter-backed router picks the best/cheapest model per task (reasoning vs vision vs cheap-bulk), with transparent per-message credit cost, model pinning, and BYO-key — model-agnostic by law (architecture > model).
- **Portable identity + memory:** one QuantMail identity and one AI-memory (QuantMail Drive + `@quant/ai-memory`) span every app, so context follows the user everywhere instead of sitting in per-product silos.
- **Trust-gated action:** every cross-boundary action (send, spend, deploy, post) is auditable and approvable (Trust-before-intelligence), with credit budgets per agent/automation.
- **One wallet:** every model call, agent run, and automation meters in Quant Credits — no five separate AI subscriptions.

### Core features
- Multi-model chat workspace: threads, branches, system prompts/personas, file/image/audio/screen attachments, voice mode, streaming, citations, and an artifacts/canvas surface for docs + code.
- Model-router UX: per-thread/per-message model pick or auto-route, live cost + latency, quality/speed/cost sliders, BYO-key, pinning.
- App launcher / control surface: a command palette that invokes any Quant app action ("post this to QuanTube," "email X," "start a QuantCooks automation"), previewing what will happen + the credit cost + an approve step.
- Agent workspace: define/run agents (goal, tools = app actions + device, budget, schedule), watch the step-by-step trace, and pause/approve/stop.
- Automations gallery: browse/install/share templated cross-app automations ("morning briefing," "auto-clip my streams," "triage my inbox") — each a permissioned, budgeted workflow.
- Device control (with permission) via desktop/mobile agents: open apps, fill forms, read the screen, take actions — every step logged and reversible.

### Deep / micro features (the long-tail lock-in)
- Per-agent + per-automation credit budgets, spend caps, and a kill-switch; a full audit log of every action with its token/credit cost.
- Memory manager UI: see/edit/forget what Quanty knows, scope memory per app, with confidence + provenance from `@quant/ai-memory`'s temporal/confidence model.
- Model playground: side-by-side model comparison on one prompt, eval scoring, and save-as-routing-rule.
- Context inspector: exactly which context/RAG chunks were sent (transparency), with redaction controls.
- Voice-first hands-free mode: wake word, TTS with barge-in, screen-reader parity.
- Offline/local model fallback on device; graceful degrade that routes around a provider outage.
- Proactive suggestions surfaced but never auto-executed above a trust threshold.

### UI/UX & 3D
- Direction: purple accent (`#8B5CF6`, hue 263), a calm-but-powerful, conversation-centric cockpit with a spatial command canvas.
- **3D Quanty avatar:** a react-three-fiber presence — a reactive, viseme lip-synced avatar with audio-driven GLSL shader materials (voice amplitude → deformation/glow), gaze + emotion states, rendered on OffscreenCanvas so chat stays smooth; degrades to a 2D orb on low-power devices.
- **Spatial command canvas:** a WebGL2 node/graph space where agents, apps, and running automations are nodes you can wire, watch execute (animated data flow), and rearrange — the control surface as a living map of the ecosystem.
- Streaming-token typography, an agent-step timeline, and live cost gauges.
- Performance: WebGPU/WebGL2 for avatar + canvas, Web Workers for streaming/markdown/code-highlight, WASM for local embeddings/tokenization, WebCodecs for voice/screen capture.
- Per-device: Tauri desktop = full device control + global hotkey + always-on overlay; Capacitor mobile = voice-first, share-sheet capture, background agents; web = full cockpit minus OS-level control.
- Accessibility: voice-first, full keyboard, reduced-motion disables 3D, high-contrast, and screen-reader-first agent traces.

### Data & backend
- Prisma domains: `Conversation`/`Thread`/`Message`, `Agent`, `AutomationRun`, `RoutingRule`, `ModelUsage`, `MemoryRef`, `Permission`/`Grant`, `DeviceSession`, `AuditLog`, plus a `CreditLedger` link.
- Reasoning/routing: `@quant/ai` (ModelRouter over OpenRouter + SemanticCache), `@quant/agent-runtime` (plan→act→observe loop, tool registry = app actions + device), `@quant/ai-memory` (hybrid vector retrieval, temporal/confidence, state machine).
- Knowledge: RAG over QuantMail Drive + per-app data via Meilisearch (keyword) + Qdrant/pgvector (embeddings); a context manager assembles and logs every context.
- Realtime + jobs: **ws-gateway** streams tokens + agent steps; BullMQ runs scheduled automations and long agent jobs; CronJobs handle recurring runs.
- Coordination: cross-app actions are emitted as events (outbox → Kafka via **cdc-relay**) to sibling apps; results are projected by **signal-projector**; **moderation-worker** + `@quant/security` gate risky actions; every action lands in `AuditLog` (Trust law).
- Trust: OAuth2 scopes per app, per-tool permission grants, and server-side credit-budget enforcement.

### Cross-app integration
- "Summarize my day and clip the best moment from last night's stream to QuantGram" → Quanty reads QuantMail/QuantChat for the summary, asks QuanTube/QuantCooks to find + clip + edit, posts to QuantGram, and reports — each step budgeted and approved.
- "Book me focus time and mute chat" → controls calendar + QuantChat.
- "Start my QuantCooks morning-video automation and tell me when it posts" → triggers Cooks, notifies via QuantChat.
- "What did I watch about X — make me a study playlist" → reads QuanTube history from shared memory and builds the playlist.
- **SSO:** QuantAI is the front door to the QuantMail-issued identity; the credits wallet is shown here and spent across apps; notifications + approvals flow through **QuantChat**; all memory lives in QuantMail Drive; the cross-cutting Quanty layer doc covers the agent/runtime internals.

### Platform presence
- **web:** the full cockpit (chat, model router, agents, automations gallery).
- **desktop (Tauri):** device control, global hotkey overlay, local model fallback, opt-in always-listening.
- **mobile (Capacitor):** voice-first assistant, background agents, share-sheet, notifications.
- **own admin panel:** model/router config + cost dashboards, agent/automation observability, permission + audit review, abuse/safety controls, provider-health monitoring.
- **own marketing page (`/ai`):** "one AI that runs your whole ecosystem" — the automations + model-routing showcase.
