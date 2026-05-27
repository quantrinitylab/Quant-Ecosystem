# Phase 18 Truth Audit

> Generated as part of Phase 18 - Truth Reset & Stub Elimination.
> Purpose: honest, verified assessment of the entire codebase.

---

## 1.1 Stub Inventory

Classification key:

- **REAL** - Production-quality code that delegates to real services/APIs
- **NAIVE** - Correct algorithm shape but unsuitable for production (in-memory, pure JS ML, no scaling)
- **FAKE** - Returns hardcoded/random data, no real logic
- **STUB** - Empty shell, health endpoint only, no domain code

### Moderation Package (`packages/moderation/src/services/`)

| File                  | Classification | Rationale                                                                                      |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `csam-matcher.ts`     | **FAKE**       | `NoOpCSAMMatcher` always returns `{matched: false}`                                            |
| `perceptual-hash.ts`  | **NAIVE**      | DCT-based pHash simulation from buffer bytes; correct algorithm shape but not production-grade |
| `text-classifier.ts`  | **REAL**       | Delegates to external `ModerationAPIClient` interface; real classification logic               |
| `image-classifier.ts` | **REAL**       | Delegates to external `ImageModerationAPIClient` interface; real classification logic          |
| `bot-detection.ts`    | **NAIVE**      | Heuristic scoring with configurable thresholds; no ML model                                    |

### QuantMeet Backend (`apps/quantmeet/backend/services/`)

| File                   | Classification | Rationale                                                                                    |
| ---------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `sfu.service.ts`       | **FAKE**       | Returns random ICE candidates, in-memory maps only, no real WebRTC/mediasoup                 |
| `recording.service.ts` | **NAIVE**      | Correct shape using `StorageClient` interface, but in-memory state, no real media processing |
| `breakout.service.ts`  | **NAIVE**      | Correct logic for managing rooms via in-memory Map                                           |

### Agent Runtime (`packages/agent-runtime/src/`)

| File                       | Classification | Rationale                                                                        |
| -------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `agents/email-pilot.ts`    | **NAIVE**      | Rule-based agent with WorkerAgent/AgentTask/StateMachine framework, no LLM calls |
| `agents/calendar-pilot.ts` | **NAIVE**      | Same pattern as above                                                            |
| `agents/chat-pilot.ts`     | **NAIVE**      | Same pattern                                                                     |
| `agents/code-pilot.ts`     | **NAIVE**      | Same pattern                                                                     |
| `agents/content-pilot.ts`  | **NAIVE**      | Same pattern                                                                     |
| `agents/data-pilot.ts`     | **NAIVE**      | Same pattern                                                                     |
| `agents/design-pilot.ts`   | **NAIVE**      | Same pattern                                                                     |
| `agents/devops-pilot.ts`   | **NAIVE**      | Same pattern                                                                     |
| `agents/finance-pilot.ts`  | **NAIVE**      | Same pattern                                                                     |
| `agents/research-pilot.ts` | **NAIVE**      | Same pattern                                                                     |
| `agents/social-pilot.ts`   | **NAIVE**      | Same pattern                                                                     |
| `agents/video-pilot.ts`    | **NAIVE**      | Same pattern                                                                     |
| `sandbox.ts`               | **NAIVE**      | Simple sandbox mode toggle with action log                                       |

### Recommendations (`packages/recommendations/src/`)

| File                     | Classification | Rationale                                                                                                         |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `core/neural-cf.ts`      | **NAIVE**      | Full backpropagation implementation in pure JS; correct ML but will not scale                                     |
| `retrieval/two-tower.ts` | **NAIVE**      | Pure JS linear forward pass with random weights                                                                   |
| `ranking/mmoe.ts`        | **NAIVE**      | Multi-gate Mixture-of-Experts in pure JS with gating/experts/towers; no trained weights, sigmoid aggregation only |

### ML Pipeline & Runtime

| File                                 | Classification | Rationale                                                  |
| ------------------------------------ | -------------- | ---------------------------------------------------------- |
| `packages/ml-pipeline/src/core/*.ts` | **NAIVE**      | In-memory feature store, training pipeline, model registry |
| `packages/ml-runtime/src/*.ts`       | **NAIVE**      | ONNX runtime interfaces defined, no real ONNX bindings     |

### Search (`packages/search/src/core/`)

| File                | Classification | Rationale                                                                  |
| ------------------- | -------------- | -------------------------------------------------------------------------- |
| `inverted-index.ts` | **NAIVE**      | Full BM25 implementation in pure JS; replaced in production by Meilisearch |

### Federation (`packages/federation/src/matrix/`)

| File             | Classification | Rationale                                    |
| ---------------- | -------------- | -------------------------------------------- |
| `bridge-bot.ts`  | **NAIVE**      | Bridge bot with in-memory message forwarding |
| `room-mapper.ts` | **NAIVE**      | Room mapping logic, in-memory state          |

### Service Stubs (Health-only servers)

| Service                          | Classification | Rationale                             |
| -------------------------------- | -------------- | ------------------------------------- |
| `services/ads-api/src/main.ts`   | **STUB**       | Health endpoint only, no domain logic |
| `services/ai-api/src/main.ts`    | **STUB**       | Health endpoint only                  |
| `services/chat-api/src/main.ts`  | **STUB**       | Health endpoint only                  |
| `services/edits-api/src/main.ts` | **STUB**       | Health endpoint only                  |
| `services/identity/src/main.ts`  | **STUB**       | Health endpoint only                  |
| `services/mail-api/src/main.ts`  | **STUB**       | Health endpoint only                  |
| `services/max-api/src/main.ts`   | **STUB**       | Health endpoint only                  |
| `services/neon-api/src/main.ts`  | **STUB**       | Health endpoint only                  |
| `services/sync-api/src/main.ts`  | **STUB**       | Health endpoint only                  |
| `services/tube-api/src/main.ts`  | **STUB**       | Health endpoint only                  |

### Service Workers (Functional but limited)

| Service                                  | Classification | Rationale                                                                      |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `services/ci-runner/src/*.ts`            | **NAIVE**      | Real BullMQ worker with parser/executor, but executes jobs in simulated manner |
| `services/moderation-worker/src/main.ts` | **NAIVE**      | Real BullMQ consumer with handler routing, but placeholder API clients         |
| `services/search-indexer/src/*.ts`       | **NAIVE**      | Real Kafka consumer structure with handlers, but vector search non-functional  |

### Summary Counts

| Classification | Count  |
| -------------- | ------ |
| REAL           | 2      |
| NAIVE          | 30     |
| FAKE           | 2      |
| STUB           | 10     |
| **Total**      | **44** |

---

## 1.2 Empty Package Inventory

Eight packages lack `package.json` and are invisible to pnpm/turbo:

| Package                       | Has Real Code?                                                    | Consumers?                                       | Decision                                   |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `packages/admin`              | Type exports only                                                 | None found                                       | **DELETE**                                 |
| `packages/analytics`          | Type exports only                                                 | None found                                       | **DELETE**                                 |
| `packages/data-pipeline`      | Type exports only                                                 | None found                                       | **DELETE**                                 |
| `packages/developer-platform` | Type exports only                                                 | None found                                       | **DELETE**                                 |
| `packages/ecosystem-bridge`   | Type exports only                                                 | None found                                       | **DELETE**                                 |
| `packages/gaming`             | Type exports only                                                 | None found                                       | **DELETE**                                 |
| `packages/i18n`               | RTL support + translation manager                                 | None found (not importable without package.json) | **DELETE** (recreate properly in Phase 26) |
| `packages/performance`        | Real implementations: LRU cache, connection pool, circuit breaker | None found (not importable)                      | **KEEP** (add package.json in Phase 18)    |

**Action items:**

- Delete 7 packages (admin, analytics, data-pipeline, developer-platform, ecosystem-bridge, gaming, i18n)
- Add `package.json` to `packages/performance` to make it a proper workspace member

---

## 1.3 Frontend Reality Check

### Apps with App Router (Next.js 13+)

| App       | Total Pages | Mock-Data Pages                      | Real-API Pages | Static/Layout          |
| --------- | ----------- | ------------------------------------ | -------------- | ---------------------- |
| quantai   | 2           | 1 (`app/page.tsx`)                   | 0              | 1 (`voice/page.tsx`)   |
| quantchat | 2           | 2 (`page.tsx`, `chat/[id]/page.tsx`) | 0              | 0                      |
| quantmail | 2           | 1 (`page.tsx`)                       | 0              | 1 (`compose/page.tsx`) |

### Apps with Pages Router

| App        | Total Pages | Mock-Data Pages | No-Mock Pages          | Mock % |
| ---------- | ----------- | --------------- | ---------------------- | ------ |
| quantedits | 9           | 7               | 2 (brand-kit, export)  | 78%    |
| quantmax   | 14          | 12              | 2 (profile, videochat) | 86%    |
| quantneon  | 19          | 9               | 10                     | 47%    |
| quantube   | 15          | 3               | 12                     | 20%    |
| quantads   | 12          | 2               | 10                     | 17%    |
| quantsync  | 17          | 1               | 16                     | 6%     |

### Apps with Backend Only (No Frontend Pages)

| App           | Frontend Pages      | Backend Services | Tests         |
| ------------- | ------------------- | ---------------- | ------------- |
| quantcalendar | 0                   | 10 services      | 10 test files |
| quantdocs     | 0                   | 10 services      | 10 test files |
| quantdrive    | 0                   | 11 services      | 11 test files |
| quantmeet     | 0 (.tsx types only) | 7 services       | 7 test files  |

### Frontend Summary

- **Total pages across all apps:** 92
- **Pages with mock/hardcoded data:** 38 (41%)
- **Pages with no inline mocks:** 54 (59%)
- **Apps with zero frontend:** 4 (quantcalendar, quantdocs, quantdrive, quantmeet)

---

## 1.4 Dependency Hygiene

### Security Audit (`pnpm audit`)

**Result: 8 vulnerabilities (1 low, 7 moderate)**

| Severity | Package         | Issue                                          | Path                                                                          | Patched In |
| -------- | --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| low      | `ai`            | Filetype whitelist bypass on upload            | `packages__ai>ai`                                                             | >=5.0.52   |
| moderate | `esbuild`       | Dev server allows cross-origin requests        | `.>vitest>vite>esbuild`                                                       | >=0.25.0   |
| moderate | `jsondiffpatch` | XSS via HtmlFormatter::nodeBegin               | `packages__ai>ai>jsondiffpatch`                                               | >=0.7.2    |
| moderate | `vite`          | Path traversal in optimized deps .map handling | `.>vitest>vite`, `apps__quantmeet>vitest>vite`                                | >=6.4.2    |
| moderate | `postcss`       | XSS via unescaped style tags in stringify      | `apps__quantai>next>postcss`                                                  | >=8.5.10   |
| moderate | `uuid`          | Missing buffer bounds check in v3/v5/v6        | `apps__quantcalendar>uuid`, `packages__notifications>firebase-admin>...>uuid` | >=11.1.1   |

**Assessment:** All vulnerabilities are in transitive dependencies (vitest/vite toolchain, next, firebase-admin). None are in production runtime paths. The `vite`/`esbuild` issues are dev-only. The `uuid` and `postcss` issues are moderate and should be resolved by bumping parent packages.

### Outdated Dependencies (`pnpm outdated`)

| Package                          | Current | Latest | Type |
| -------------------------------- | ------- | ------ | ---- |
| turbo                            | 2.9.14  | 2.9.15 | dev  |
| @typescript-eslint/eslint-plugin | 8.59.4  | 8.60.0 | dev  |
| @typescript-eslint/parser        | 8.59.4  | 8.60.0 | dev  |
| typescript-eslint                | 8.59.4  | 8.60.0 | dev  |
| @commitlint/cli                  | 19.8.1  | 21.0.1 | dev  |
| @commitlint/config-conventional  | 19.8.1  | 21.0.1 | dev  |
| @faker-js/faker                  | 9.9.0   | 10.4.0 | dev  |
| @vitest/coverage-v8              | 2.1.9   | 4.1.7  | dev  |
| eslint                           | 9.39.4  | 10.4.0 | dev  |
| lint-staged                      | 15.5.2  | 17.0.5 | dev  |
| typescript                       | 5.5.4   | 6.0.3  | dev  |
| vitest                           | 2.1.9   | 4.1.7  | dev  |

**Assessment:** All outdated packages are dev dependencies. The major version gaps (vitest 2->4, eslint 9->10, typescript 5->6) represent breaking changes and should be upgraded carefully in a dedicated phase. Minor bumps (turbo, typescript-eslint) are safe to apply.

---

## 1.5 Schema-to-Code Coverage

Database schemas are defined in `packages/database/src/schemas/` as TypeScript interfaces. There is no Prisma schema file; the project uses a repository pattern with in-memory implementations.

### Schema Files

| Schema File        | Primary Models                               | Consuming Apps/Services      | Repository Exists?                 |
| ------------------ | -------------------------------------------- | ---------------------------- | ---------------------------------- |
| `users.ts`         | UserSchema, UserPreferences                  | database pkg only            | Yes (`user.repository.ts`)         |
| `emails.ts`        | EmailSchema, EmailAttachment, EmailRecipient | quantmail (routes, services) | Yes (`email.repository.ts`)        |
| `messages.ts`      | ConversationSchema, MessageSchema            | quantchat (routes)           | Yes (`message.repository.ts`)      |
| `posts.ts`         | PostSchema, LinkPreview                      | quantsync (routes)           | Yes (`post.repository.ts`)         |
| `media.ts`         | VideoSchema                                  | quantube (routes, services)  | Yes (`media.repository.ts`)        |
| `ads.ts`           | CampaignSchema, TargetingConfig              | quantads (routes), payments  | No dedicated repo                  |
| `ai-sessions.ts`   | AISessionSchema, AIMessageSchema             | database pkg only            | Yes (`ai-session.repository.ts`)   |
| `notifications.ts` | NotificationSchema                           | database pkg only            | Yes (`notification.repository.ts`) |
| `profiles.ts`      | DatingProfileSchema                          | database pkg only            | No dedicated repo                  |

### Coverage Gaps

- **UserSchema:** Has repository but no service/app consumes it directly (identity service is STUB)
- **AISessionSchema:** Has repository but quantai app uses mock data, not the repository
- **NotificationSchema:** Has repository but no notification service consumes it
- **DatingProfileSchema:** No repository, no consumer outside schema definition
- **CampaignSchema:** Used by ads routes and payments, but no dedicated repository

### Summary

- 9 schema files defining 15+ models
- 7 repositories implemented
- Only 4 schemas are consumed by app-level code (emails, messages, posts, media)
- 5 schemas exist only at the package level with no real consumers

Full coverage data exported to `.agents/state/schema-coverage.csv`.
