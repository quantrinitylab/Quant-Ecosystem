# Quant Ecosystem

A 16-app interconnected platform built as a TypeScript monorepo. Each app integrates deeply with shared packages for authentication, AI, real-time communication, and UI components.

## Architecture Overview

```
quant-ecosystem/
├── apps/                    # 16 Application frontends + backends
│   ├── marketing/          # Marketing and landing site
│   ├── quantai/            # Central AI assistant hub
│   ├── quantads/           # Advertising platform
│   ├── quantcalendar/      # Calendar and scheduling
│   ├── quantchat/          # Instant messaging (Snapchat-like)
│   ├── quantdocs/          # Collaborative documents
│   ├── quantdrive/         # Cloud file storage
│   ├── quantedits/         # Video/photo editor (CapCut)
│   ├── quantmail/          # Email + Central OAuth provider (Gmail+GitHub)
│   ├── quantmax/           # Short video + dating + random chat (TikTok/Tinder/Omegle)
│   ├── quantmeet/          # Video conferencing
│   ├── quant-mobile/       # Cross-platform mobile app (Capacitor)
│   ├── quantneon/          # Photo/video sharing (Instagram)
│   ├── quantsync/          # Social feed (Twitter/Reddit)
│   ├── quantube/           # Video & music streaming (YouTube+Spotify)
│   └── status/             # Service status and uptime monitor
├── packages/               # Shared libraries (78)
│   ├── common/             # Types, constants, utilities, validators
│   ├── database/           # Database schemas and models for all apps
│   ├── auth/               # Authentication (QuantMail as OAuth provider)
│   ├── ai/                 # Central AI engine with domain services
│   ├── shared-ui/          # Reusable React UI components
│   └── realtime/           # WebSocket infrastructure
├── services/               # Infrastructure services (8)
└── scripts/                # Build and dev scripts
```

## Current Status

- **16 apps total:** Full-stack applications with frontend and/or backend components
- **78 packages:** Shared libraries covering AI, infrastructure, UI, platform features, and more
- **8 services:** All with full package.json (cdc-relay, ci-runner, git-server, matchmaking, moderation-worker, search-indexer, smtp-inbound, ws-gateway)
- **Frontend pages:** Some still use mock data (tracked in `.agents/state/mock-debt.csv`)
- **All CI gates pass:** typecheck, test, build, lint, audit

## Apps

| App               | Description        | Key Features                                                            |
| ----------------- | ------------------ | ----------------------------------------------------------------------- |
| **Marketing**     | Marketing site     | Landing pages, product showcases, pricing                               |
| **QuantAI**       | AI Hub             | Conversational AI, device control, multi-model support                  |
| **QuantAds**      | Ad platform        | Campaign management, targeting, analytics, creative tools               |
| **QuantCalendar** | Calendar           | Scheduling, events, reminders                                           |
| **QuantChat**     | Instant messaging  | Disappearing messages, stories, video calls, group chats, smart replies |
| **QuantDocs**     | Documents          | Collaborative editing, templates                                        |
| **QuantDrive**    | Cloud storage      | File storage, sharing, sync                                             |
| **QuantEdits**    | Editor             | Timeline-based video/photo editing, effects, exports                    |
| **QuantMail**     | Email platform     | Full email client, central OAuth2 provider for ecosystem SSO            |
| **QuantMax**      | Multi-mode         | Short videos (TikTok), random video chat (Omegle), dating (Tinder)      |
| **QuantMeet**     | Video conferencing | Meetings, screen sharing, breakout rooms                                |
| **QuantMobile**   | Mobile app         | Cross-platform mobile app via Capacitor (iOS + Android)                 |
| **QuantNeon**     | Photos             | Photo/video sharing, filters, stories, close friends                    |
| **QuantSync**     | Social network     | Posts, threads, communities, polls, trending topics                     |
| **QuantTube**     | Streaming          | Video/music upload, live streaming, channels, playlists                 |
| **Status**        | Status page        | Service status, uptime monitoring, incident reporting                   |

## Shared Packages

### @quant/common

Shared utilities used across all apps:

- **Types**: User, Session, ApiResponse, PaginatedResult, Notification, etc.
- **Constants**: App configs, API endpoints, WebSocket events, rate limits, error codes
- **Utils**: generateId, debounce, throttle, deepClone, retry, paginate, formatDate, etc.
- **Validators**: Email, phone, URL, username, password, file upload validation

### @quant/database

Complete database schema definitions and model classes:

- **Schemas**: Users, messages, emails, posts, ads, media, profiles, AI sessions, notifications
- **Models**: Base CRUD model with filtering, pagination, hooks; specialized models per domain
- **Migrations**: SQL migration definitions for PostgreSQL

### @quant/auth

Authentication and authorization with QuantMail as the central identity provider:

- **QuantMail OAuth2 Provider**: Authorization code flow with PKCE, all ecosystem apps registered
- **Phone Auth Provider**: SMS verification for QuantChat with rate limiting
- **Token Service**: JWT generation, validation, refresh token rotation, theft detection
- **Session Service**: Multi-device sessions, cross-app SSO, concurrent limits
- **Auth Middleware**: Express-compatible middleware for route protection

### @quant/ai

Central AI engine with specialized services per domain:

- **Engine**: Request routing, caching, rate limiting, cost tracking, streaming
- **Context Manager**: Conversation history, long-term memory, context optimization
- **Model Router**: Intelligent model selection based on capabilities, cost, latency
- **Chat AI**: Smart replies, moderation, translation, spam detection (QuantChat)
- **Mail AI**: Summarization, composition, categorization, phishing detection (QuantMail)
- **Content AI**: Moderation, hashtags, quality scoring, trend detection (QuantSync/Neon)
- **Recommendation AI**: Feed, videos, music, matches, people suggestions
- **Device Control AI**: Natural language commands, scene creation, safety validation (QuantAI)

### @quant/shared-ui

Reusable React components with TypeScript props interfaces:

- **Base**: Button, Input, Modal, Avatar, Card, Badge, Toast, Loader
- **Media**: VideoPlayer, AudioPlayer, ImageViewer
- **Chat**: ChatBubble, ChatInput, ChatList, TypingIndicator
- **Feed**: FeedCard, StoryRing
- **Navigation**: BottomNav, TopBar, SearchBar
- **AI**: AISuggestion, AIChat
- **Hooks**: useAuth, useRealtime, useTheme
- **Themes**: Light, Dark, Neon

### @quant/realtime

WebSocket infrastructure for real-time features:

- **WebSocket Server**: Connection management, message routing, authentication
- **WebSocket Client**: Auto-reconnection, message queuing, typed events
- **Channel Manager**: Rooms/channels, members, history, broadcasting
- **Presence Manager**: Online status tracking, cross-app awareness, heartbeat
- **Events**: Typed event system with full event registry

## Authentication Flow

QuantMail serves as the central OAuth2 provider for the ecosystem:

```
1. User opens QuantChat (or any app)
2. App redirects to QuantMail OAuth2 /authorize endpoint
3. User authenticates with email/password (or phone for QuantChat)
4. QuantMail issues authorization code
5. App exchanges code for access + refresh tokens
6. Access token used for API calls across ecosystem
7. Refresh token rotation prevents token theft
```

All first-party apps use the same auth flow with pre-registered client IDs and PKCE support.

## AI Integration

The AI engine routes requests to the optimal model based on task requirements:

```
Request --> Model Router --> GPT-4 (complex reasoning)
                        --> GPT-3.5 (fast, simple tasks)
                        --> Claude 3 (long context)
                        --> Llama 3 (cost-effective)
                        --> Stable Diffusion (images)
                        --> Whisper (audio transcription)
```

Each app has a specialized AI service that understands its domain context.

## Real-time Architecture

WebSocket connections power live features across the ecosystem:

- **QuantChat**: Message delivery, typing indicators, read receipts
- **QuantSync**: Live post interactions, comments, trending updates
- **QuantTube**: Live stream chat, viewer counts, donations
- **QuantMax**: Video call signaling (WebRTC), random matching
- **QuantAI**: Streaming AI responses, device status updates
- **All Apps**: Online presence, notifications, cross-app events

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 22+
- **Monorepo**: pnpm workspaces + turborepo
- **Frontend**: React with JSX
- **Styling**: Tailwind CSS utility classes
- **Database**: PostgreSQL (schemas defined in @quant/database)
- **Real-time**: Custom WebSocket implementation
- **AI**: Multi-model routing (OpenAI, Anthropic, Meta, Stability)

## Getting Started

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Type check all packages
pnpm typecheck

# Run tests
pnpm test

# Build all packages and apps
pnpm build

# Lint
pnpm lint
```

## Project Structure Conventions

- Each app: `apps/<name>/src/` with pages, components, services, types
- Each app backend: `apps/<name>/backend/` with routes, services, tests
- Each package: `packages/<name>/src/index.ts` as barrel export
- All files use proper TypeScript type annotations
- Components use `.tsx` extension with props interfaces
- Services are class-based with dependency injection pattern
- Models extend BaseModel for consistent CRUD operations
