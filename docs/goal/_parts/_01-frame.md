## North Star — the thesis

Quant is not a suite of apps. It is **one operating system for a person's digital life, wearing nine faces.** A single identity (QuantMail SSO), a single currency (Quant Credits), a single memory (the QuantMail Drive vector store), and a single AI (**Quanty**) run *underneath* all nine products — so the instant you do something in one app, every other app already knows.

Each app, standing alone, is engineered to dethrone its category king: QuantMail vs Gmail + Google Workspace + GitHub, QuantChat vs WhatsApp + Snapchat + Telegram, QuanTube vs YouTube + Spotify, QuantCooks vs CapCut + Figma, and so on. But the reason a user **stays** is not any single app — it is that the nine are **connected in ways the incumbents structurally cannot copy.** No incumbent owns email *and* social *and* video *and* a creation studio *and* an ad exchange *and* a payments rail *and* an agent that can drive all of them **and** your device. We do.

> **Sab alag, fir bhi connected** — separate, yet one.

### Why we win — the unfair advantages

1. **One identity + one memory.** Log in once (QuantMail OAuth2). What you watch on QuanTube tunes your QuantGram feed; who you email becomes who QuantChat suggests. Cross-app context is the moat.
2. **One currency, closed loop.** Quant Credits (1 credit ≈ $1) are *earned* (creator payouts, ad revenue) and *spent* (AI usage, boosts, marketplace, tips) **inside the walls** — money that enters rarely wants to leave.
3. **Quanty owns the apps *and* the device.** Assistants that bolt onto other companies' apps (Siri, Gemini, ChatGPT Operator) are permanently second-class citizens there. Quanty is a first-class actor in every Quant app via a typed tool registry, and controls the device with consent.
4. **Per-app depth, not tabs.** Every one of the nine is a genuine category killer with its own backend, admin, and roadmap — not a thin shell around a shared feed.
5. **True omnipresence.** Web + desktop (Tauri) + mobile (Capacitor) parity for every product, from one codebase per app.
6. **The creator flywheel.** QuantCooks *creates* → QuanTube / QuantGram / QuantWave *distribute* → QuantAds *monetizes* → Credits *pay out* → spent back in-ecosystem. Each turn funds the next.

---

## Product principles — the six laws

Every design decision in this document traces back to one of these.

1. **Self-contained, yet connected.** Each product owns its *entire* platform presence — web, backend, desktop, mobile, marketing, admin — **inside its own `apps/<app>/` folder.** Connection happens through shared `packages/` and SSO, **never** by merging products into one mega-shell. (This is the active restructure: the old horizontal shells — `quant-desktop`, `quant-mobile`, `marketing`, `admin-enterprise` — get folded *into* each product; ecosystem-wide views become thin aggregators.)
2. **Quanty everywhere.** Every app exposes a **typed tool registry** so the AI is a first-class user of it. If a human can do it in the UI, Quanty can do it via a tool — with permission and metering.
3. **One currency, metered honestly.** All AI/compute flows through the credits `UsageGate` (estimate → reserve → settle, **fail-closed**, idempotent). A daily free AI allowance keeps casual use free; paid overage is **opt-in, default OFF** — we never surprise-bill.
4. **Single sources of truth, zero drift.** One app catalog (`@quant/app-registry`), one identity (QuantMail), one visual identity (`@quant/brand`), one memory (Drive). The three drifted per-shell app lists that motivated this restructure must never reappear.
5. **Best-in-class on every device.** Parity is the floor, not the ceiling: the target is *better* UI/UX than the incumbent on web **and** desktop **and** mobile — with 3D/WebGL/WebGPU used wherever it genuinely wins, and graceful degradation everywhere else.
6. **Admin per app, in its proper place.** Each app owns its own admin panel (QuantMail's = domains/DLP/identity; QuantAds' = ad-review/payout/fraud). A thin org hub *aggregates* them — it never re-implements them. Owner's words: *"Admin different for all 09 apps in their proper place — don't gather all in one."*

---

## Ecosystem at a glance

**Nine products.** Not fourteen — the extra folders in `apps/` are horizontal shells being folded in, and the "sub-apps" below are **features inside a host, not standalone apps.**

| App | Category | Kills | Hosts (as features) | Maturity |
|---|---|---|---|---|
| **QuantMail** | Productivity hub + auth root | Gmail, Workspace, GitHub, Claude Code | QuantDrive, QuantDocs, QuantCalendar, QuantGit/CodeHub | 🟡 most mature (~900 files; SSO + drive/calendar/repos live) |
| **QuantChat** | Messaging + realtime | WhatsApp, Snapchat, Telegram, Discord | QuantMeet (video) | 🟡 scaffolded, deep |
| **QuantAI** | AI super-app / control surface | ChatGPT, Gemini, Notion AI, Perplexity | — | 🟡 scaffolded |
| **QuantGram** | Photo/short social | Instagram, Facebook, Pinterest | — | 🟡 scaffolded |
| **QuantWave** | Text/discussion social | X/Twitter, Threads, Reddit | — | 🟡 scaffolded |
| **QuanTube** | Video + music | YouTube, Bilibili, Spotify | — | 🟡 scaffolded |
| **QuantMax** | Short-video + social discovery | TikTok, Omegle, Tinder | — | 🟡 scaffolded |
| **QuantCooks** | AI creation studio | CapCut, After Effects, Figma, Higgsfield | — | 🟡 scaffolded |
| **QuantAds** | Ads + gaming + monetization | Meta Ads, Google Ads | multiplayer games platform | 🟡 scaffolded |

**Not one of the nine:** **QuantTrinity** is the *economy control-plane* — the owner surface where credit value, free allowance, commission, plan catalog, and overage defaults are tuned. It governs the ecosystem; it is not a consumer product.

**The shape of the whole:** 9 apps · 100+ shared packages · a dozen infra services (ws-gateway, search-indexer, moderation-worker, matchmaking, video-transcoder, cdc-relay, smtp-inbound, git-server, ad-engine, signal-projector, ci-runner) · Postgres+pgvector, Redis, Kafka, Meilisearch, Qdrant, WebRTC, Cloudflare R2, Kubernetes.

---
