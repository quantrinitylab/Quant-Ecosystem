# QuantAI — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B3).
Verified clean post-#564: the audit's fake-data routes now carry real backends.

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/feed` | Quanty activity feed | `GET /api/quanty/feed?page&limit`, `/generate`, `/instructions` | loading, empty, paged feed |
| `/goals` | Goal tracking | `GET /api/goals?status=tracking\|done`, `/api/goals/proposals` | tracking list, done list, proposals |
| `/ideas` | Idea capture | `/api/ideas` CRUD + `/{id}/{action}` | list, detail, actions |
| `/plan` | Quanty planning | `/api/quanty/plan` | plan view, generating |
| `/voice` | Voice assistant | `POST /api/voice/stt` (audio→text), `/api/assistant/chat` | listening, transcribing, responding |
| `/connectors` | App/service connectors | Catalog + connections fetch (injectable fetch for tests); search, sections, detail sheet | loading, empty, connected |
| `/profile` | User profile hub | Backend profile; mounts Marketplace; achievements section | loaded |

## Components

| Component | Verdict | Data contract |
|---|---|---|
| `components/Marketplace.tsx` | keep | `GET /api/marketplace`, `POST /api/marketplace/{id}/install\|uninstall` — real agent/plugin marketplace |
| `components/leaderboard/Leaderboard.tsx` | **remove** | Hardcoded fake entries — deletion wave |
| `components/achievements/AchievementSystem.tsx` | **remove** | Hardcoded fake achievements — deletion wave |
| `components/quests/DailyQuests.tsx` | **remove** | Hardcoded fake quests — deletion wave |
| `components/EcosystemMap.tsx` | **remove** | Dead, zero mounts — deletion wave |
| `components/community/CommunityHighlights.tsx` | **remove** | Fabricated "live activity" — deletion wave |

## `src/pages/` routes (kept)

`analytics, automation, code, device, ecosystem, image-gen, memory, models,
personas, plugins, prompts, training, translate` — real backends
(`/api/assistant/chat`, `/api/plugins`, `/api/voice/stt`), local-state history,
honest headers. In-mission for an AI workbench. `/ask` was a duplicate chat
surface and is already deleted (Part A).

## Backend extras (kept, group verdict)

`ab-testing, cdn, cache, flux-styles, image-inpainting, image-wizard,
video-generation, goals, marketplace, quant-tools, quantos, training,
versioning, voice-flows, browser-agent, code-agent, payments, recommendations,
scaling, mcp-connectors, project-context, projects, prompt-templates, swarm,
collaboration, events, analytics, permissions, personal-agent, user-owned-ai,
federation, file-library, extractor, engine, sessions, quanty-feed, quanty-ideas`
— present under `apps/quantai/backend/routes/`, spot-checked real.
Endpoint-level contracts are a follow-up via `18-backend-spec-template.md`.
