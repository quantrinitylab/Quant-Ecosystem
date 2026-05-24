# Quant Ecosystem

A comprehensive 9-app interconnected platform built as a TypeScript monorepo. Each app integrates deeply with shared services for authentication, AI, real-time communication, and UI components.

## Architecture Overview

```
quant-ecosystem/
├── apps/                    # 9 Application frontends + backends
│   ├── quantchat/          # Instant messaging (Snapchat-like)
│   ├── quantmail/          # Email + Central OAuth provider (Gmail+GitHub)
│   ├── quantsync/          # Social feed (Twitter/Reddit)
│   ├── quantads/           # Advertising platform
│   ├── quantube/           # Video & music streaming (YouTube+Spotify)
│   ├── quantneon/          # Photo/video sharing (Instagram)
│   ├── quantedits/         # Video/photo editor (CapCut)
│   ├── quantmax/           # Short video + dating + random chat (TikTok/Tinder/Omegle)
│   └── quantai/            # Central AI assistant hub
├── packages/               # Shared libraries
│   ├── common/             # Types, constants, utilities, validators
│   ├── database/           # Database schemas and models for all apps
│   ├── auth/               # Authentication (QuantMail as OAuth provider)
│   ├── ai/                 # Central AI engine with domain services
│   ├── shared-ui/          # Reusable React UI components
│   └── realtime/           # WebSocket infrastructure
└── scripts/                # Build and dev scripts
```

## Apps

| App | Description | Key Features |
|-----|-------------|--------------|
| **QuantChat** | Instant messaging | Disappearing messages, stories, video calls, group chats, smart replies |
| **QuantMail** | Email platform | Full email client, central OAuth2 provider for ecosystem SSO |
| **QuantSync** | Social network | Posts, threads, communities, polls, trending topics |
| **QuantAds** | Ad platform | Campaign management, targeting, analytics, creative tools |
| **QuantTube** | Streaming | Video/music upload, live streaming, channels, playlists |
| **QuantNeon** | Photos | Photo/video sharing, filters, stories, close friends |
| **QuantEdits** | Editor | Timeline-based video/photo editing, effects, exports |
| **QuantMax** | Multi-mode | Short videos (TikTok), random video chat (Omegle), dating (Tinder) |
| **QuantAI** | AI Hub | Conversational AI, device control, multi-model support |

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
- **Monorepo**: npm workspaces
- **Frontend**: React with JSX
- **Styling**: Tailwind CSS utility classes
- **Database**: PostgreSQL (schemas defined in @quant/database)
- **Real-time**: Custom WebSocket implementation
- **AI**: Multi-model routing (OpenAI, Anthropic, Meta, Stability)

## Getting Started

```bash
# Structure is defined via npm workspaces
# All code is self-contained TypeScript - no external dependencies needed

# Type check all packages
npx tsc --noEmit

# Run validation
node scripts/test.js
```

## Project Structure Conventions

- Each app: `apps/<name>/src/` with pages, components, services, types
- Each package: `packages/<name>/src/index.ts` as barrel export
- All files use proper TypeScript type annotations
- Components use `.tsx` extension with props interfaces
- Services are class-based with dependency injection pattern
- Models extend BaseModel for consistent CRUD operations
