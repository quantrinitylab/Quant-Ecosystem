# Quant Ecosystem Architecture Map

## Overview

- **16 apps** (frontend/backend applications)
- **8 services** (microservices, all with full package.json)
- **78 packages** (shared libraries)
- **Build system:** pnpm 10.28.1 + Turborepo 2.9.14
- **Language:** TypeScript (strict mode, ESNext modules)
- **Node version:** 22

## Apps (16)

| App           | Scripts                                                        |
| ------------- | -------------------------------------------------------------- |
| marketing     | typecheck, test, build, lint                                   |
| quantads      | dev, build, typecheck, test, lint                              |
| quantai       | dev, dev:backend, build, build:backend, start, typecheck, test, lint |
| quantcalendar | dev, build, start, typecheck, test, lint                       |
| quantchat     | dev, dev:backend, build, build:backend, start, typecheck, test, lint |
| quantdocs     | dev, build, start, typecheck, test, lint                       |
| quantdrive    | dev, build, start, typecheck, test, lint                       |
| quantedits    | dev, test, lint                                                |
| quantmail     | dev, dev:backend, build, build:backend, start, typecheck, test, lint |
| quantmax      | dev, test, lint                                                |
| quantmeet     | dev, build, start, typecheck, test, lint                       |
| quant-mobile  | typecheck, test, build, lint                                   |
| quantneon     | dev, test, lint                                                |
| quantsync     | dev, build, typecheck, test, lint                              |
| quantube      | dev, test, lint                                                |
| status        | typecheck, test, build, lint                                   |

## Services (8)

All services have full package.json with scripts.

| Service           | Scripts                             |
| ----------------- | ----------------------------------- |
| cdc-relay         | start, dev, typecheck, test, lint   |
| ci-runner         | typecheck, test, build, lint        |
| git-server        | typecheck, test, build, lint        |
| matchmaking       | dev, typecheck, test, lint, build   |
| moderation-worker | start, dev, typecheck, test, lint   |
| search-indexer    | start, dev, typecheck, test, lint   |
| smtp-inbound      | typecheck, test, build, lint        |
| ws-gateway        | dev, typecheck, test, lint, build   |

## Packages (78)

### Core Infrastructure

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| common             | Types, constants, utilities, validators        |
| database           | Prisma schemas, models, migrations             |
| auth               | OAuth2, JWT, session management                |
| server             | Express server utilities                       |
| server-core        | Core server framework and middleware           |
| api-client         | Typed HTTP/REST client                         |
| queue              | Message queue abstraction (Redis/SQS)          |
| storage            | File storage abstraction (S3-compatible)       |
| realtime           | WebSocket infrastructure                       |
| encryption         | Crypto utilities, E2E encryption               |
| health-server      | Health check endpoints for services            |
| service-discovery  | Service registry and discovery                 |

### AI and ML

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| ai                 | Central AI engine, model routing               |
| ai-daily-brief     | Daily summary/brief generation                 |
| ai-memory          | Long-term AI memory and context                |
| ai-organization    | AI-powered organization and categorization     |
| agent-runtime      | AI agent execution runtime                     |
| agent-swarm        | Multi-agent coordination                       |
| browser-agent      | Browser automation AI agent                    |
| code-agent         | Code generation/analysis AI agent              |
| bharat-ai          | India-specific AI models and features          |
| ml-pipeline        | ML training and inference pipeline             |
| ml-runtime         | ML model serving runtime                       |
| triton-client      | NVIDIA Triton inference client                 |
| recommendations    | Recommendation engine                          |
| ranking            | Content/search ranking algorithms              |
| generative-media   | AI image/video/audio generation                |
| user-owned-ai      | User-controlled personal AI                    |

### Platform and Infrastructure

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| data-plane         | Data routing and transformation                |
| data-warehouse     | Analytics data warehouse integration           |
| observability      | Logging, metrics, tracing                      |
| error-monitoring   | Error tracking and alerting                    |
| performance        | Performance monitoring and optimization        |
| chaos-testing      | Chaos engineering test utilities               |
| testing            | Shared test utilities and fixtures             |
| security           | Security utilities, RBAC, audit logging        |
| governance         | Policy engine and compliance                   |
| privacy-ads        | Privacy-preserving advertising                 |
| federation         | ActivityPub/federation protocol                |
| identity-permissions | Fine-grained permissions system              |
| local-first        | Offline-first/CRDT sync                        |
| sync-engine        | Data synchronization engine                    |
| dev-platform       | Developer platform/API portal                  |

### App-Specific Packages

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| media              | Media processing (transcode, thumbnails)       |
| photos             | Photo processing and albums                    |
| universal-capture  | Cross-platform media capture                   |
| notifications      | Push/email/in-app notifications                |
| payments           | Stripe/payment processing                      |
| search             | Full-text and semantic search                  |
| social-graph       | Social connections and graph queries           |
| moderation         | Content moderation pipeline                    |
| cross-publish      | Cross-app content publishing                   |
| cross-app-workflows | Multi-app workflow orchestration              |
| universal-timeline | Unified activity timeline                      |

### UI and Frontend

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| shared-ui          | Reusable React UI components                   |
| command-palette    | Global command palette (Cmd+K)                 |
| contextual-sidekick | AI-powered contextual assistant UI           |
| spatial-ui         | Spatial/3D UI components                       |
| brand              | Brand assets, colors, typography               |
| onboarding         | Onboarding flows and wizards                   |
| maps               | Map components and geolocation                 |
| voice-input        | Voice input/transcription UI                   |

### Platform Features

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| co-presence        | Real-time presence and collaboration           |
| quant-automate     | Workflow automation (IFTTT-like)                |
| quant-codex        | Code collaboration platform                    |
| quant-commerce     | E-commerce/marketplace                         |
| quant-health       | Health and fitness tracking                    |
| quant-live         | Live streaming infrastructure                  |
| quant-notebook     | Notebook/wiki tool                             |
| quant-orchestrator | Cross-service orchestration                    |
| quant-tools        | Developer/power-user tools                     |
| device-control     | IoT device management                          |
| iot-control        | IoT protocol adapters                          |
| robotics-bridge    | Robotics integration bridge                    |
| voice-first-os     | Voice-first interface layer                    |
| wellbeing          | Digital wellbeing and screen time              |

### Launch and Operations

| Package            | Description                                    |
| ------------------ | ---------------------------------------------- |
| launch-beta        | Beta program management                        |
| launch-public      | Public launch utilities                        |

## Dependency Chain

Core dependency flow (based on tsconfig project references and package.json dependencies):

```
common -> auth -> server-core
common -> database
common -> ai -> agent-runtime -> agent-swarm
common -> realtime -> co-presence
common -> shared-ui
server-core -> health-server
database -> data-warehouse
ai -> ml-pipeline -> ml-runtime -> triton-client
```

The `common` package is the foundation. Most other packages depend on it.

`database` depends on `common` and requires Prisma client generation (`prisma generate`) before typecheck.

## Build Pipeline (turbo.json)

- `typecheck`: depends on `^typecheck` (upstream packages must typecheck first)
- `build`: depends on `^build` (upstream packages must build first), outputs `dist/**`
- `test`: depends on `^build` (upstream packages must be built first)
- `lint`: independent (no cross-package dependency)

Build order is automatically resolved by Turborepo based on the dependency graph. Parallel execution is used where possible.
