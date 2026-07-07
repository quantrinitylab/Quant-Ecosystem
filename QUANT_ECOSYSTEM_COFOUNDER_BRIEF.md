# Quant Ecosystem — Cofounder Brief

> A single, deeply-interconnected super-ecosystem designed to do what Google **and** Meta do —
> but unified under one identity, one AI that can actually operate the apps for you, and one
> credits-based economy. This document explains the vision, the products, the architecture,
> how we differ from Google/Meta, and an honest snapshot of where the build stands today.

---

## 1. The one-liner

**Quant is one account that gives you email, chat, social, video, dating, creation tools, cloud
storage, and a coding platform — all controllable by a single personal AI that can run the apps
and your devices for you, paid for through one shared "Quant Credits" wallet.**

Google gives you a suite (Gmail, Drive, YouTube, Meet). Meta gives you a social graph (Instagram,
WhatsApp, Messenger). Nobody gives you **both**, fused together, with **one AI that can actually
do the work across all of them**, and **one currency** that flows from ads → creators → users.

That fusion is the product.

---

## 2. The core thesis — why this is different from Google + Meta

Three structural bets that neither Google nor Meta can easily copy because of their org structure
and legacy silos:

### Bet 1 — One identity, truly one platform

QuantMail is the **auth root** (OAuth2 / SSO) for the entire ecosystem. One login unlocks every
app. Your contacts, files, calendar, AI memory, credits and social graph are shared context across
Mail, Chat, Social, Video, Dating and the creation tools. Google's apps share a login but not a
unified product; Meta's apps barely talk to each other. Ours are designed interconnected from day
one.

### Bet 2 — An AI that operates the apps, not just answers questions

Every app embeds **QuantAI** as a small animated assistant. It is not a chatbot bolted on — it can
**control the app it lives in, your other Quant apps, and your device**:

- On a laptop it behaves like Claude Code / Codex (opens the coding workspace, works task-by-task,
  deploys, runs security checks).
- On a phone it behaves like a Gemini / Google-Assistant-class agent (opens apps, plays the exact
  video segment you asked for, composes and sends, automates routines).
- It uses connectors + MCP (Model Context Protocol) for long-horizon, multi-step agentic work.

"Open QuantTube and teach me to ride a bike" → it opens QuantTube and plays only the relevant
segments. "Build me an Uno-style game" → it opens the coding workspace inside QuantMail and ships
it. This is the headline differentiator.

### Bet 3 — One credits economy that closes the loop

A single currency, **Quant Credits** (target 1 credit ≈ $1), powers everything: AI usage over the
free daily allowance, in-app purchases, in-game goods, and **creator payouts**. Ads (QuantAds) fund
the ecosystem; creators get paid in credits; users top up (UPI / PayPal / Stripe / crypto) and can
withdraw daily. Overage billing is **off by default** — users opt in. This is a self-funding flywheel
that ad-only (Meta) or subscription-only (Google One) models don't close.

---

## 3. The products (what each app replaces)

| Quant app                 | Replaces / competes with                            | What it is                                                                                                                                                |
| ------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QuantMail**             | Gmail **+ GitHub + Claude Code** + Google Workspace | Auth root + email + a full code platform (repos, CI/CD, Codex-style coding) + Drive/Calendar/Docs/Meet as built-in features. The super-hub.               |
| **QuantChat**             | Snapchat + WhatsApp + Telegram                      | Avatars, lenses/AR, streaks, stories, Snap Map, groups, channels, bots, in-chat games. Phone number required.                                             |
| **QuantNeon**             | Instagram                                           | Reels, feed, stories, close friends, DMs, map of friends' posts, in-feed playable games.                                                                  |
| **QuantMax**              | TikTok + Omegle + Tinder                            | Short video, random video chat, dating, squads, party games, **real spatial/proximity voice**.                                                            |
| **QuantSync**             | X / Twitter / Threads                               | Full microblogging **+ an anonymous section** (for sensitive/leak content, heavily moderated) **+ a verified-only section** (official/gov-style posting). |
| **QuantTube**             | YouTube + YouTube Music / Spotify                   | Video + music, channels, live streaming, playlists — AI can control playback (segment-skipping).                                                          |
| **QuantEdits**            | CapCut + After Effects + Google Flow                | Pro timeline editor, effects, templates, collaboration; AI automations ("auto-edit daily AI news and post it").                                           |
| **QuantAds**              | Meta Ads + Google Ads                               | Second-price auction ad platform that funds the ecosystem; in-game banner ads; AI can wire campaigns.                                                     |
| **QuantAI**               | ChatGPT / Gemini / Claude + Assistant               | The central AI hub that controls all apps + device; agent framework, multi-model, connectors, MCP.                                                        |
| **QuantTrinity**          | (internal) Admin command center                     | Owner/admin control of all apps + users, monitoring, AI "employees" for internal teams, all cost/model config.                                            |
| **Quant Games**           | Plato + an open-world (Godot) game                  | Cross-app connected games with shared ranks; a GTA-style real-world game where NPCs are real AI.                                                          |
| **Google-suite features** | Drive / Calendar / Docs / Meet                      | **QuantDrive, QuantCalendar, QuantDocs, QuantMeet** live as features inside QuantMail.                                                                    |

---

## 4. The cross-cutting pillars (the "moat")

1. **Single identity / SSO** — QuantMail issues tokens for every app (OAuth 2.1 + PKCE).
2. **QuantAI everywhere** — the same assistant persona appears across all apps and can act on your behalf.
3. **Deep interconnection** — content, games, identity and ranks flow across apps (post a game you built to QuantTube and it appears across the feed apps; ranks are shared).
4. **Credits economy** — one wallet, daily free allowance, opt-in overage, creator payouts, marketplace commissions.
5. **QuantAds funds it** — advertising is the ecosystem's revenue engine; payouts recycle as credits.
6. **QuantTrinity governs it** — one admin brain for the founder, with AI "employees" that can staff internal roles (e.g., review daily user reports).

---

## 5. Technical architecture (what actually exists in the repo)

This is a real, large TypeScript monorepo — not slides.

- **16 apps** (frontends + backends)
- **8 microservices** (git-server, ci-runner, matchmaking, moderation-worker, search-indexer, smtp-inbound, ws-gateway, cdc-relay)
- **78 shared packages** (auth, database, ai, realtime, payments, search, moderation, recommendations, ml-pipeline, storage, notifications, observability, and more)
- **Build system:** pnpm 10 + Turborepo; **TypeScript strict**; **Node 22**
- **Backend framework:** Fastify (HTTP) + WebSocket gateway
- **Data:** PostgreSQL + Prisma (with pgvector for embeddings), Redis, S3-compatible storage, Kafka/NATS for events, Meilisearch for search
- **AI:** central AI engine with a model router, circuit breakers, retries, semantic cache, safety pipeline and cost tracking; multi-provider (OpenAI / Anthropic / Google / OpenRouter / **Amazon Bedrock**)
- **Infra:** AWS EKS (Kubernetes) in us-east-1, ECR images, GitHub Actions CI/CD, nginx ingress, Let's Encrypt TLS
- **Domains:** apps on `quant*.quantrinity.in`; email addresses on `@quantmail.in`

The dependency backbone: `common → auth → server-core`, `common → database`, `common → ai →
agent-runtime → agent-swarm`. The `common` package is the shared foundation everything builds on.

---

## 6. How we concretely beat Google and Meta

| Dimension             | Google                        | Meta                   | Quant                                                              |
| --------------------- | ----------------------------- | ---------------------- | ------------------------------------------------------------------ |
| Identity              | One login, siloed products    | Fragmented across apps | **One identity, one interconnected platform**                      |
| AI                    | Answers / assists             | Feed ranking + chatbot | **AI that operates the apps and your device for you**              |
| Coding                | Separate (no consumer coding) | None                   | **GitHub + Claude-Code-class coding inside your mail app**         |
| Money                 | Ads + Google One subscription | Ads only               | **Credits economy: ads fund creators + users, daily withdrawable** |
| Social ↔ Productivity | Split (Workspace vs nothing)  | Social only            | **Social + productivity + creation fused**                         |
| Openness              | Closed                        | Closed                 | **User-owned AI, bring-your-own-model, connectors/MCP**            |

The wedge is not "a better Gmail" or "a better Instagram." It's the **combination** plus the
**agentic AI layer** that no incumbent ships across their whole suite.

---

## 7. Honest status — where the build actually is today

I will not oversell this. The vision above is the North Star; here is the real state.

### Live / working now (furthest along: QuantMail)

- **QuantMail is deployed on production Kubernetes (EKS)** with a real Fastify backend.
- **Auth works end-to-end**: register, login, session, OAuth userinfo, JWT with correct issuer/audience.
- **Real domains live** with valid TLS: `quantmail.quantrinity.in` (and sibling apps). Email identities issue as `@quantmail.in`.
- **Internal mail send/receive works** (user A → user B delivered end-to-end).
- **Mail sub-features wired to real DB APIs**: Contacts, Repos (list/create/branches/PRs/issues), CI pipelines, Calendar (events + calendars), Drive (files/folders/search).
- **QuantChat and QuantAI backends** are also deployed.
- **AI provider layer** now supports **Amazon Bedrock** (wired and unit-tested this week) so AI features can run on our AWS account without an external key.
- Premium **dark UI/UX** overhaul in progress (auth screens, inbox, composer done).

### Partial / in progress

- **AI live functionality** is wired but gated on an AWS Bedrock daily-token quota increase and (for Anthropic models) a one-time AWS "use-case" form. Amazon Nova models are accessible; quota needs raising for real traffic.
- **External email** (send/receive to Gmail etc.) via SES: domain, DKIM, SPF, DMARC configured; SES production access pending.
- **Frontends**: some apps still need their Next.js App-Router frontends finished; several screens still render fixture/mock data.
- **UI/UX polish** is not yet at the "Google/Meta-killer" bar across all apps — this is an explicit, known gap.

### Planned / not yet real (be candid with anyone technical)

- Many **feature engines are built but not yet wired into apps** (payments, notifications, AR lenses, federation, recommendations, live streaming).
- Several integrations are **still simulated** and need real backends: LLM agents (12 role "pilots" are rule-based, not yet LLM-driven), ML recommendations (pure-JS, won't scale), QuantMeet WebRTC SFU (needs LiveKit/mediasoup), CSAM moderation (needs PhotoDNA/Thorn — a legal prerequisite for user-generated content), search vectors.
- **Infra hardening** (containerize all backends, Helm for every app, committed DB migrations, staging environment, load testing, coverage from ~30% toward 50%+) is on the roadmap.
- The **Godot open-world game**, full **credits economy**, and **QuantTrinity** admin brain are designed but early.

**Bottom line for the cofounder:** the architecture and vision are real and unusually ambitious; the
monorepo is large and genuinely structured (16 apps, 8 services, 78 packages). QuantMail is the
proof-of-life — deployed, authenticated, on a real domain, sending mail. The rest of the ecosystem
ranges from "backend built, frontend pending" to "designed, not yet built." The primary risks are
scope (this is a multi-team, multi-quarter effort), the trust-and-safety/legal work required for
UGC apps, and getting real AI + real integrations wired app-by-app.

---

## 8. Monetization

- **QuantAds** is the primary revenue engine (auction-based, cross-app, in-game banners).
- **Credits**: users top up (UPI / PayPal / Stripe / crypto); creators earn and withdraw daily.
- **Marketplace commissions** on in-game digital goods and creator sales.
- **Plans + daily free allowance** (ChatGPT/Gemini-style tiers); overage is opt-in only.
- Cost strategy: start on hosted models (Bedrock/OpenRouter), shift toward local models over time to cut inference cost and improve margin.

---

## 9. Suggested near-term roadmap (to a launchable v1)

1. **Make QuantMail fully launch-ready** (it's the auth root and the furthest along): finish dark UI, external email via SES, AI compose live on Bedrock.
2. **Turn on QuantAI for real** across Mail/Chat (Bedrock quota + real agents).
3. **Finish the remaining app frontends** and replace mock screens with live APIs.
4. **Wire the orphaned engines** app-by-app (notifications, payments, recommendations first).
5. **Harden infra** (containers + Helm for all, committed migrations, staging, load tests).
6. **Trust & safety + compliance** before any public UGC launch (CSAM reporting, GDPR/India DPDP).
7. **Launch QuantMail publicly first**, then roll out the social apps behind the same identity.

---

_Prepared from the live repository: product vision (`.agents/state/quant-product-vision.md`),
architecture map, and go-live readiness/truth audits. Status reflects the current `main` branch and
this week's QuantMail + Bedrock work._
