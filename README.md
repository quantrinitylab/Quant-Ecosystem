# Quant Ecosystem

[![Build Status](https://img.shields.io/github/actions/workflow/status/quantrinitylab/Quant-Ecosystem/ci.yml?branch=main&label=CI)](https://github.com/quantrinitylab/Quant-Ecosystem/actions)
[![Coverage](https://img.shields.io/codecov/c/github/quantrinitylab/Quant-Ecosystem?label=coverage)](https://codecov.io/gh/quantrinitylab/Quant-Ecosystem)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange.svg)](https://pnpm.io/)

A production-grade, interconnected platform of **18 applications**, **106 shared packages**, and **7 infrastructure services** built as a TypeScript monorepo. Covers email, messaging, social, video streaming, AI, file storage, calendar, video conferencing, advertising, gaming, and a unified credits economy - all unified by a single authentication layer (QuantMail OAuth2) and shared infrastructure, with QuantAI as an assistant woven through every app.

## Product Vision (north star)

The goal is one deeply interconnected ecosystem that out-features the incumbents, with **QuantAI** present in every app (an "alien" assistant avatar) and able to control both the apps and the user's device:

- **QuantMail** - the authentication root (OAuth2/OIDC SSO for every app) and a super-hub: email **plus** GitHub-style repos, Codex/Claude-Code-style coding, and Drive/Calendar/Docs/Meet as embedded features.
- **QuantChat** - Snapchat + WhatsApp + Telegram: avatars, lenses/AR, streaks, reels, stories, Snap-Map, in-chat games, bots; phone-number required; QuantAI auto-reply avatar.
- **QuantNeon** - Instagram: reels, feed, stories, close-friends, DMs, map, in-feed games.
- **QuantMax** - TikTok + Omegle + Tinder: squads/rooms, party games, proximity voice.
- **QuantSync** - Twitter/X + Threads: plus an anonymous section and a verified-only space.
- **QuantTube** - YouTube + music with AI segment-skip playback.
- **QuantEdits** - CapCut/After-Effects killer with AI daily auto-edit -> auto-post automations.
- **QuantAds** - the monetization engine (in-game banners, creator payouts as credits) that funds the ecosystem.
- **Quant Games** - cross-app connected ranks/leaderboards, Uno/Ludo/Monopoly, and a Godot-based open-world game with AI NPCs (bring-your-own API key).
- **QuantTrinity** - the owner/admin command center: central control of all config, AI "employees", monitoring across every app and user.
- **Economy** - one currency (1 credit ~= $1): top-up via UPI/PayPal/Stripe/crypto, daily creator withdrawals, AI metering with a daily free allowance, overage opt-in (default OFF), plans/tiers, and a marketplace with commission. Models are served via OpenRouter.

> This is the long-term target. The platform is built up as verified, shippable increments - see the active spec under `.kiro/specs/unified-quant-credits-economy/` for the credits/payouts/marketplace rollout currently in progress.

## Quick Start

```bash
git clone https://github.com/quantrinitylab/Quant-Ecosystem.git && cd Quant-Ecosystem
pnpm install
pnpm dev:all
```

> Requires Node.js 22+, pnpm 10, and Docker for infrastructure services. See [docs/development.md](docs/development.md) for detailed setup.

## Architecture

```mermaid
graph TD
    subgraph Apps["20 Applications (Next.js 15)"]
        direction LR
        QM[QuantMail - Email + OAuth2]
        QC[QuantChat - Messaging]
        QS[QuantSync - Social Feed]
        QT[QuantTube - Video/Music]
        QA[QuantAI - AI Hub]
        QD[QuantDrive - Storage]
        Admin[Admin Panel]
        More[+10 more apps]
    end

    subgraph Packages["100+ Shared Packages"]
        direction LR
        SC[server-core]
        Auth[auth]
        DB[database]
        AI[ai]
        RT[realtime]
        Sec[security]
        Obs[observability]
        FF[feature-flags]
    end

    subgraph Services["8 Infrastructure Services"]
        direction LR
        WS[ws-gateway]
        SI[search-indexer]
        CDC[cdc-relay]
        SMTP[smtp-inbound]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL + pgvector)]
        Redis[(Redis)]
        Kafka[Kafka]
        Meili[Meilisearch]
        Qdrant[Qdrant]
    end

    Apps --> Packages
    Packages --> Services
    Services --> Data
```

## Apps

| App               | Description                     | Key Features                                                              |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------- |
| **QuantMail**     | Email + Central OAuth2 Provider | Full email client, SSO for all ecosystem apps, Git repos, CI/CD           |
| **QuantChat**     | Instant Messaging               | Disappearing messages, stories, video calls, smart replies                |
| **QuantSync**     | Social Network                  | Posts, threads, communities, polls, trending topics                       |
| **QuantTube**     | Video & Music Streaming         | Upload, live streaming, channels, playlists                               |
| **QuantAI**       | AI Assistant Hub                | Multi-model routing, device control, conversational AI                    |
| **QuantDrive**    | Cloud Storage                   | File upload, sharing, versioning, folder management                       |
| **QuantDocs**     | Collaborative Documents         | Real-time editing, templates                                              |
| **QuantCalendar** | Calendar & Scheduling           | Events, reminders, meeting scheduling                                     |
| **QuantMeet**     | Video Conferencing              | WebRTC, screen sharing, breakout rooms                                    |
| **QuantMax**      | Multi-Mode                      | Short videos (TikTok), random chat (Omegle), dating (Tinder)              |
| **QuantEdits**    | Video/Photo Editor              | Timeline editing, effects, exports                                        |
| **QuantNeon**     | Photo/Video Sharing             | Filters, stories, close friends                                           |
| **QuantAds**      | Advertising Platform            | Campaign management, targeting, analytics, creator payouts                |
| **QuantTrinity**  | Owner/Admin Command Center      | Central config control, AI employees, cross-app monitoring, team accounts |
| **Admin**         | Platform Admin                  | User/service management, audit, compliance, feature flags                 |
| **Status**        | Status Page                     | Uptime monitoring, incident reporting                                     |
| **Marketing**     | Landing Site                    | Product showcases, pricing                                                |
| **Quant-Mobile**  | Mobile App                      | Cross-platform via Capacitor (iOS + Android)                              |

## Key Packages

| Package                    | Purpose                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@quant/server-core`       | Fastify 5 app factory with auth, prisma, health, metrics, observability, feature-flags, audit plugins                                                                  |
| `@quant/auth`              | QuantMail OAuth2 + JWT + session management + PKCE                                                                                                                     |
| `@quant/database`          | Prisma schemas and base CRUD model for all domains                                                                                                                     |
| `@quant/ai`                | Multi-model AI engine (OpenAI, Anthropic, Meta, Stability, OpenRouter)                                                                                                 |
| `@quant/credits`           | Unified credits economy: append-only ledger wallet, usage metering, plans, overage (default OFF), provider-hosted billing, creator payouts, and the marketplace ledger |
| `@quant/realtime`          | WebSocket server/client with presence, channels, delivery guarantees                                                                                                   |
| `@quant/security`          | Rate limiting, DDoS, CSRF, XSS, SQL injection, WAF, encryption                                                                                                         |
| `@quant/security-advanced` | Double-submit CSRF, IP reputation, session management, field encryption                                                                                                |
| `@quant/observability`     | Distributed tracing (OTel), structured logging, metrics, SLO tracking, chaos engineering                                                                               |
| `@quant/feature-flags`     | Feature flag service with percentage rollouts and targeting rules                                                                                                      |
| `@quant/organizations`     | Multi-tenancy with roles and permissions                                                                                                                               |
| `@quant/queue`             | BullMQ job processing with dead letter handling                                                                                                                        |
| `@quant/data-pipeline`     | Redis Streams event streaming with analytics/notification/indexing processors                                                                                          |
| `@quant/edge-config`       | CDN cache policies, edge middleware, security headers for Next.js                                                                                                      |
| `@quant/shared-ui`         | React component library (Button, Modal, ChatBubble, VideoPlayer, etc.)                                                                                                 |

## Services

| Service             | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `ws-gateway`        | WebSocket connection management with JWT auth, presence tracking |
| `search-indexer`    | Kafka CDC event consumer, indexes to Meilisearch + Qdrant        |
| `cdc-relay`         | Change Data Capture from PostgreSQL WAL                          |
| `smtp-inbound`      | Inbound email processing for QuantMail                           |
| `ci-runner`         | CI/CD pipeline execution for QuantMail repos                     |
| `git-server`        | Git hosting backend                                              |
| `matchmaking`       | Real-time user matching (QuantMax)                               |
| `moderation-worker` | AI-powered content moderation pipeline                           |

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 22+
- **Monorepo**: pnpm 10 workspaces + Turborepo 2
- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Fastify 5 (via server-core), Next.js API routes
- **Database**: PostgreSQL with pgvector extension (Prisma ORM)
- **Cache/Queues**: Redis 7, BullMQ, Redis Streams
- **Messaging**: Kafka (CDC events)
- **Search**: Meilisearch (full-text) + Qdrant (vector/semantic)
- **Real-time**: Custom WebSocket server, WebRTC (QuantMeet/QuantMax)
- **AI**: Multi-model routing (OpenAI, Anthropic, Meta, Stability AI)
- **Observability**: OpenTelemetry, Prometheus, Grafana, Jaeger
- **Deployment**: Docker Compose, Kubernetes (Helm), ArgoCD, Terraform

## Development Commands

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, Meilisearch, etc.)
docker compose up -d

# Run all apps in development mode
pnpm dev:all

# Type check all packages
pnpm turbo typecheck

# Run tests
pnpm turbo test

# Build everything
pnpm turbo build

# Lint
pnpm turbo lint
```

## Documentation

| Document                                       | Description                                         |
| ---------------------------------------------- | --------------------------------------------------- |
| [Architecture](docs/architecture.md)           | System architecture with Mermaid diagrams           |
| [Deployment](docs/deployment.md)               | Local, Docker, and Kubernetes deployment guides     |
| [API Reference](docs/api-reference.md)         | All backend API endpoints                           |
| [Development](docs/development.md)             | Developer setup, conventions, contribution guide    |
| [Security](docs/security.md)                   | Security architecture, auth flow, incident response |
| [Runbook](docs/runbook.md)                     | Operational procedures, monitoring, troubleshooting |
| [SLOs](docs/slos.md)                           | Service Level Objectives                            |
| [Threat Model](docs/threat-model.md)           | Security threat model                               |
| [Federation](docs/federation.md)               | Federation protocol                                 |
| [Disaster Recovery](docs/disaster-recovery.md) | DR procedures                                       |

## Project Structure

```
Quant-Ecosystem/
├── apps/                    # 20 frontend applications (Next.js 15)
├── packages/               # 100+ shared libraries
├── services/               # 8 infrastructure services
├── infra/                  # Kubernetes (Helm), Terraform, ArgoCD, monitoring
├── docs/                   # Documentation
├── e2e/                    # Playwright end-to-end tests
├── k6/                     # Load testing scripts
├── scripts/                # Build and dev tooling
├── docker-compose.yml      # Full development stack
├── turbo.json              # Turborepo pipeline configuration
├── package.json            # Root workspace configuration
└── tsconfig.json           # Root TypeScript configuration
```

## Authentication

QuantMail serves as the central OAuth2 provider with PKCE support. All ecosystem apps authenticate through it, enabling seamless SSO:

```
User -> Any App -> QuantMail OAuth2 -> JWT issued -> SSO across all apps
```

## Quant Credits Economy

The ecosystem runs on a single currency - **Quant Credits** (1 credit ~= $1) - implemented in `@quant/credits` over an **append-only ledger** (the balance is always `SUM(ledger)`; entries are never mutated). Highlights:

- **Wallet & metering** - `CreditWallet` (durable, owner-scoped) and `UsageGate` (estimate -> reserve -> settle, fail-closed, idempotent) meter every paid action. AI usage draws a **daily free allowance** first.
- **Overage opt-in** - off by default for every owner; no surprise charges unless explicitly enabled.
- **Plans & tiers** - `PlanService` resolves entitlements, rate limits, and monthly included credits, activated idempotently on payment webhooks.
- **Top-up** - provider-hosted checkout via a vendor-neutral `PaymentProvider` port (Stripe, Razorpay/UPI, with PayPal/crypto adapters); card data never touches our servers; unconfigured providers fail closed.
- **Creator payouts** - `PayoutService` turns earned credits into withdrawals (UPI/crypto/bank) with no-overdraw guards, a per-day limit, compliance holds, and refund-on-failure. Earnings post to the same shared ledger.
- **Marketplace** - `MarketplaceLedger` settles in-credits purchases of digital goods atomically (buyer debit + seller earn + platform commission), idempotent per purchase to prevent double-spend.
- **Central control** - credit value, free allowance, commission, plan catalog, and overage defaults are tuned from QuantTrinity.

All money paths use crypto-strong identifiers (never `Math.random()`), fail closed, and keep the ledger as the single source of truth. See `.kiro/specs/unified-quant-credits-economy/` for the requirements, design, and task rollout.

## License

MIT
