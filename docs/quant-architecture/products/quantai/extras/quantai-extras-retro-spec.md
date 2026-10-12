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

Verified 2026-10-12 (F-197): each entry checked for (a) file on disk under
`apps/quantai/backend/routes/`, and (b) mount evidence — imported and
`app.register(...)`'d in `apps/quantai/backend/app.ts` (`buildApp`). 36/37 are
MOUNTED-REAL; 1 is FILE-ONLY (see note). Endpoint-level contracts remain a
follow-up via `18-backend-spec-template.md`.

| Route dir | Status | Mount evidence |
|---|---|---|
| `ab-testing` | MOUNTED-REAL | `app.ts:37` import → `app.register(abTestingRoutes, { prefix: '/ab-testing' })` |
| `cdn` | MOUNTED-REAL | `app.ts:34` import → `app.register(cdnRoutes, { prefix: '/cdn' })` |
| `cache` | MOUNTED-REAL | `app.ts:33` import → `app.register(cacheRoutes, { prefix: '/cache' })` |
| `flux-styles` | MOUNTED-REAL | `app.ts:63` import → `app.register(fluxStylesRoutes, { prefix: '/api/ai' })` |
| `image-inpainting` | MOUNTED-REAL | `app.ts:62` import → `app.register(imageInpaintingRoutes, { prefix: '/api/ai' })` |
| `image-wizard` | MOUNTED-REAL | `app.ts:56` import → `app.register(imageWizardRoutes, { prefix: '/image-wizard' })` |
| `video-generation` | MOUNTED-REAL | `app.ts:60` import → `app.register(videoGenerationRoutes, { prefix: '/api/ai' })` |
| `goals` | MOUNTED-REAL | `app.ts:49` import → `app.register(goalRoutes, { prefix: '/goals' })` |
| `marketplace` | MOUNTED-REAL | `app.ts:16` import → `app.register(marketplaceRoutes, { prefix: '/marketplace' })` |
| `quant-tools` | MOUNTED-REAL | `app.ts:41` import → `app.register(quantToolsRoutes, { prefix: '/tools' })` |
| `quantos` | MOUNTED-REAL | `app.ts:13` import → `app.register(quantosRoutes, { prefix: '/quantos' })` |
| `training` | MOUNTED-REAL | `app.ts:22` import → `app.register(trainingRoutes, { prefix: '/training' })` |
| `versioning` | MOUNTED-REAL | `app.ts:19` import → `app.register(versioningRoutes, { prefix: '/versioning' })` |
| `voice-flows` | MOUNTED-REAL | `app.ts:28` import → `app.register(voiceFlowsRoutes, { prefix: '/api/voice-flows' })` |
| `browser-agent` | MOUNTED-REAL | `app.ts:42` import → `app.register(browserAgentRoutes, { prefix: '/agents/browser' })` |
| `code-agent` | MOUNTED-REAL | `app.ts:43` import → `app.register(codeAgentRoutes, { prefix: '/agents/code' })` |
| `payments` | MOUNTED-REAL | `app.ts:32` import → `app.register(paymentRoutes, { prefix: '/payments' })` |
| `recommendations` | MOUNTED-REAL | `app.ts:30` import → `app.register(recommendationRoutes, { prefix: '/recommendations' })` |
| `scaling` | MOUNTED-REAL | `app.ts:35` import → `app.register(scalingRoutes, { prefix: '/scaling' })` |
| `mcp-connectors` | MOUNTED-REAL | `app.ts:57` import → `app.register(mcpConnectorsRoutes, { prefix: '/connectors' })` |
| `project-context` | MOUNTED-REAL | `app.ts:54` import → `app.register(projectContextRoutes, { prefix: '/projects' })` |
| `projects` | FILE-ONLY — **unverified as live** | File exists (`routes/projects.ts`, 202 lines, real handler code; referenced by `__tests__/project.service.test.ts`, `__tests__/projects-identity.test.ts`) but is **not imported or registered** in `app.ts`. The `/projects` path is served by `project-context` + `project-memory` routes instead. Do not treat as a live route. |
| `prompt-templates` | MOUNTED-REAL | `app.ts:45` import → `app.register(promptTemplateRoutes, { prefix: '/prompts' })` (also mounted at `/api/ai`) |
| `swarm` | MOUNTED-REAL | `app.ts:29` import → `app.register(swarmRoutes, { prefix: '/swarm' })` |
| `collaboration` | MOUNTED-REAL | `app.ts:21` import → `app.register(collaborationRoutes, { prefix: '/collaboration' })` |
| `events` | MOUNTED-REAL | `app.ts:38` import → `app.register(eventsRoutes, { prefix: '/events' })` |
| `analytics` | MOUNTED-REAL | `app.ts:18` import → `app.register(analyticsRoutes, { prefix: '/analytics' })` |
| `permissions` | MOUNTED-REAL | `app.ts:20` import → `app.register(permissionsRoutes, { prefix: '/permissions' })` |
| `personal-agent` | MOUNTED-REAL | `app.ts:14` import → `app.register(personalAgentRoutes, { prefix: '/personal-agent' })` |
| `user-owned-ai` | MOUNTED-REAL | `app.ts:44` import → `app.register(userOwnedAiRoutes, { prefix: '/agents/owned' })` |
| `federation` | MOUNTED-REAL | `app.ts:23` import → `app.register(federationRoutes, { prefix: '/federation' })` |
| `file-library` | MOUNTED-REAL | `app.ts:52` import → `app.register(fileLibraryRoutes, { prefix: '/files/library' })` |
| `extractor` | MOUNTED-REAL | `app.ts:59` import → `app.register(extractorRoutes, { prefix: '/api/ai' })` |
| `engine` | MOUNTED-REAL | `app.ts:58` import → `app.register(engineRoutes, { prefix: '/api/ai' })` |
| `sessions` | MOUNTED-REAL | `app.ts:6` import → `app.register(sessionsRoutes, { prefix: '/sessions' })` |
| `quanty-feed` | MOUNTED-REAL | `app.ts:64` import → `app.register(quantyFeedRoutes, { prefix: '/quanty/feed' })` |
| `quanty-ideas` | MOUNTED-REAL | `app.ts:50` import → `app.register(quantyIdeasRoutes, { prefix: '/quanty/ideas' })` |
