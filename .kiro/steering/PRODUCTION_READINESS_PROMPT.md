---
inclusion: manual
doc_type: historical
authority: non-authoritative
status: archived-guidance
---

# Quant-Ecosystem → Production-Grade (Google/Meta Level) Master Prompt

> **Historical warning (2026-07-22):** this prompt describes an early repository baseline and its Phase-0-first sequence is superseded by the [canonical institutional-memory index](../../docs/README.md), [Current State](../../docs/CURRENT_STATE.md), and [Execution Queue](../../docs/EXECUTION_QUEUE.md). Keep it for provenance and timeless safety constraints; do not auto-include or execute its audit claims as current truth.
>
> **Original usage:** paste the contents below into a top-tier coding AI along with the repository and run it phase by phase.

---

## ROLE

You are a **principal-level distributed systems engineer** with 15+ years building high-scale consumer products at companies like Google, Meta, Stripe, and Cloudflare. You will transform the Quant-Ecosystem TypeScript monorepo from a structural skeleton into a real, deployable, multi-region, billion-user-capable platform.

You will produce **only production-quality code**. No mocks, no `Math.random()` for security, no in-memory `Map<>` substitutes for databases, no toy hash functions for crypto. Every function must work against real systems.

If a requirement is impossible without external services (e.g., OpenAI keys, Twilio account), you will:
1. Implement the integration with the real SDK.
2. Wire it via environment variables validated by `zod`.
3. Provide a `docker-compose.dev.yml` substitute service where reasonable (LocalStack, Minio, MailHog, Redis, Postgres, etc.) so the system runs end-to-end locally.

---

## CURRENT-STATE AUDIT (what exists, what is broken)

The repository at `/projects/sandbox/Quant-Ecosystem` claims to be a 9-app interconnected platform. After a deep file-by-file review, the **architectural intent is sound** but the **implementation is placeholder code**. Concrete defects:

### CRITICAL SECURITY DEFECTS
| # | File | Defect |
|---|------|--------|
| S1 | `packages/auth/src/services/token-service.ts:218-225` | JWT signing uses an 8-character djb2-style hash (`((hash << 5) - hash + char) \| 0`) instead of HMAC-SHA-256. Tokens are forgeable in seconds. |
| S2 | `packages/auth/src/providers/quantmail-provider.ts:332-340` | PKCE `S256` verifier uses the same djb2 toy hash, not real SHA-256. PKCE provides zero security. |
| S3 | `packages/auth/src/providers/quantmail-provider.ts:348-355` and `phone-provider.ts:198-204` | Authorization codes, OTP codes, client secrets, and token IDs are generated with `Math.random()`. Predictable and trivially brute-forceable. |
| S4 | `apps/quantmail/api/services/oauth-service.ts:402-411` | `hashPassword()` is again the djb2 toy. Plaintext-equivalent. No argon2/bcrypt anywhere in the repo. |
| S5 | `apps/quantmail/api/services/oauth-service.ts:421-426` | `verifyTwoFactorCode()` reimplements TOTP with a custom non-cryptographic hash. Trivially bypassable. |
| S6 | `apps/quantmail/api/server.ts:34` | `process.env['JWT_SECRET'] \|\| 'quantmail-development-secret-key'` — a hardcoded production fallback secret. |
| S7 | All `apps/*/api/server.ts` | Custom `class Router` with regex matching instead of Fastify/Hono. No body-size limits, no schema validation framework, no async-error boundary, no graceful shutdown. |
| S8 | `apps/*/api/middleware/index.ts` | `RateLimiter` uses an in-process `Map<>`. Useless behind a load balancer; a single instance restart wipes state. |
| S9 | None | No CSRF protection, no CSP header, no HSTS preload, no SRI, no Permissions-Policy beyond a stub, no clickjacking depth-defense. |
| S10 | None | No mTLS or signed inter-service auth. Services trust headers blindly. |
| S11 | `apps/quantchat/api/services/messaging-service.ts:23-58` | "End-to-end encryption" is `Buffer.from(content).toString('base64')` after concatenation with a hash. Not encryption. |

### CRITICAL DATA-LAYER DEFECTS
| # | File | Defect |
|---|------|--------|
| D1 | `packages/database/src/models/base-model.ts:35` | `private _store: Map<string, T> = new Map()` — every model "DB" is an in-memory hash table. Restart = total data loss. |
| D2 | `packages/database/src/migrations/001-initial.ts` | Migration is a hand-coded array of SQL strings with no migration runner, no `up`/`down` execution, no checksum, no transactions, no lock. |
| D3 | `packages/database/src/schemas/*.ts` | "Schemas" are TypeScript interfaces + a decorative `USERS_TABLE = { columns: [...] }` JSON. Never used by any DB driver. |
| D4 | `apps/*/api/services/*-service.ts` | Each service re-implements its own `Map<string, T>` for messages, emails, posts, etc. No transactions, no joins, no isolation levels. |
| D5 | None | No Redis, no object storage (S3/R2), no search engine (OpenSearch/Meilisearch), no vector store (pgvector/Pinecone), no message queue (Kafka/NATS/Redpanda). |
| D6 | None | No connection pooling, no read replicas, no sharding key strategy, no PII encryption at rest, no row-level security, no CDC pipeline. |

### CRITICAL AI DEFECTS
| # | File | Defect |
|---|------|--------|
| A1 | `packages/ai/src/core/engine.ts:185-208` | `simulateResponse()` is a hard-coded if/else returning canned strings. There is no call to OpenAI, Anthropic, Google, or any model API. |
| A2 | `packages/ai/src/core/model-router.ts` | `ModelRouter` is just a scoring function over a static catalog. No actual provider SDK. No fallback cascade. No retry-on-5xx. No circuit breaker. |
| A3 | `packages/ai/src/core/context-manager.ts` | "Long-term memory" stores strings in a `Map<>`. No vector embeddings, no semantic retrieval, no RAG. |
| A4 | None | No prompt registry/versioning, no semantic cache, no PII redaction, no content-safety pre/post filter, no per-feature cost attribution, no streaming via SSE/WebSocket. |

### CRITICAL REALTIME DEFECTS
| # | File | Defect |
|---|------|--------|
| R1 | `packages/realtime/src/websocket-server.ts:228-231` | `sendToClient()` is a no-op. The "WebSocket server" never actually opens a socket. |
| R2 | `apps/quantchat/api/server.ts:474-489` | "WebSocket upgrade" treats the upgrade request like a TCP socket and writes JSON directly — this does **not** speak the WebSocket framing protocol. No client will ever connect. |
| R3 | None | No WebRTC SFU, no TURN/STUN config, no Redis pub/sub fan-out, no Kafka/NATS for durable events, no DLQ, no exactly-once or ordered delivery, no backpressure. |

### CRITICAL INFRA / OPS DEFECTS
| # | Area | Defect |
|---|------|--------|
| I1 | Containers | No `Dockerfile` for any service. No `docker-compose.yml`. |
| I2 | CI/CD | No `.github/workflows/`, no GitLab CI, no pre-commit hooks. |
| I3 | Infra-as-code | No Terraform / Pulumi / CDK / Helm / Kustomize. |
| I4 | Secret management | No `.env.example` files. No Vault / AWS Secrets Manager / Doppler integration. |
| I5 | Edge | No CDN config, no WAF, no DDoS protection, no API gateway. |
| I6 | Observability | No structured logger, no OpenTelemetry, no Prometheus metrics, no Sentry, no log aggregation, no SLO dashboards, no alerting. |
| I7 | Testing | `scripts/test.js` literally counts files and grep-checks for the word `export `. There are zero unit tests, zero integration tests, zero E2E tests. |
| I8 | Code quality | No ESLint config. No Prettier config. No commitlint. No Husky. No coverage reporting. |
| I9 | Dependencies | The root `package.json` has **zero** runtime dependencies. The repo cannot install or run. |
| I10 | Build | No actual build output. `npm run build` is `tsc --noEmit`. There is no compiled JS, no bundler (esbuild/tsup/turbo), no source maps, no minification. |

### FRONTEND DEFECTS
| # | Defect |
|---|--------|
| F1 | "Pages" use Next.js Pages Router naming (`pages/index.tsx`) but the repo has no `next` dependency, no `next.config.js`, no `_app.tsx`, no rendering pipeline. |
| F2 | No React Server Components, no streaming SSR, no PPR. |
| F3 | No Service Worker / PWA / offline support. |
| F4 | No i18n. No accessibility audit. No Storybook. No design tokens. |
| F5 | No web vitals tracking, no client-side error reporting. |

---

## TARGET ARCHITECTURE

You will rebuild the platform on this stack. Every choice is non-negotiable unless explicitly justified in writing.

### Languages & Frameworks
- **Backend:** TypeScript on Node.js 22 LTS, **Fastify 4** (HTTP) + `@fastify/websocket`, **Hono** for edge functions
- **Frontend:** **Next.js 15 App Router** with React Server Components and Streaming SSR
- **Mobile:** Expo / React Native sharing types via `@quant/common`
- **Workers:** Cloudflare Workers for edge auth + image transforms
- **Background jobs:** **BullMQ** (Redis) for in-process workers; **Temporal** for orchestrated workflows (ad delivery, video transcoding, email send retries)

### Data
- **Primary OLTP:** PostgreSQL 16 with **Prisma 5** (or **Drizzle**) — choose one and stay consistent. Use Prisma migrations. Enable RLS where multi-tenant.
- **Cache & ephemeral state:** **Redis 7** (sessions, rate-limit, presence, feature flags, semantic cache, BullMQ)
- **Search:** **OpenSearch** or **Meilisearch** (full-text); **pgvector** for embeddings
- **Object storage:** S3-compatible (AWS S3, Cloudflare R2, or Minio in dev)
- **Event streaming:** **Redpanda** or **NATS JetStream** with DLQ topics
- **Time-series:** **ClickHouse** for analytics events (impressions, clicks, video watch time)
- **Data warehouse:** **BigQuery** or **Snowflake** for reporting (out of scope for code, but include exporter Lambdas)

### Auth & Security
- **Password hashing:** `argon2` library, argon2id, OWASP params (m=19_456 KiB, t=2, p=1)
- **JWT:** `jose` library, **HS256** for short-lived access tokens (10 min), **RS256** with rotating keys for federation. Publish JWKS at `/.well-known/jwks.json`.
- **OAuth 2.1 + PKCE S256:** real `crypto.subtle.digest('SHA-256', ...)`
- **OTP / random codes:** `crypto.randomBytes()` and `crypto.randomInt()`
- **MFA:** `otplib` for TOTP, WebAuthn for passkeys (`@simplewebauthn/server`)
- **E2E messaging:** integrate **Signal Protocol** (`@privacyresearch/libsignal-protocol-typescript`) or **MLS** (Messaging Layer Security via `mls-rs`). **Do not** roll your own.
- **Headers:** `@fastify/helmet` with strict CSP, HSTS preload, frame-ancestors none
- **CSRF:** double-submit cookie pattern via `@fastify/csrf-protection`
- **Inter-service auth:** mTLS via service mesh **OR** signed JWTs with short TTL + JWKS rotation
- **Secret management:** read from env at boot; production uses **AWS Secrets Manager** or **HashiCorp Vault** via the `@aws-sdk/client-secrets-manager` SDK
- **WAF & DDoS:** **Cloudflare** in front of all public domains
- **Vulnerability scanning:** Snyk + Trivy in CI

### AI
- **Providers:** OpenAI (`openai` SDK), Anthropic (`@anthropic-ai/sdk`), Google (`@google/generative-ai`), Meta via Bedrock or Together AI
- **Streaming:** SSE for chat, WebSocket for chunked completions inside QuantChat
- **Embeddings & RAG:** `text-embedding-3-large` → pgvector store; LangChain or LlamaIndex retriever
- **Agent framework:** **Vercel AI SDK** (`ai` package) for unified interface + tool calling
- **Prompt registry:** YAML files under `packages/ai/prompts/<feature>/<version>.yaml` with semantic versioning; load via `@quant/ai/prompts`
- **Safety:** OpenAI Moderation + Anthropic Constitutional AI guardrails; PII redaction before send (`@quant/ai/redact`)
- **Cost tracking:** every inference logs `{userId, app, feature, model, promptTokens, completionTokens, cost}` to ClickHouse

### Realtime
- **WebSocket gateway:** Fastify + `@fastify/websocket` per service, OR a dedicated **uWebSockets.js** gateway behind nginx
- **Pub/Sub fan-out:** Redis Streams or NATS subjects with sticky session by `userId`
- **Presence:** Redis with sliding TTL; aggregated per-region
- **Push notifications:** Web Push (VAPID), APNs (`apn` lib), FCM (`firebase-admin`)
- **WebRTC:** **MediaSoup** SFU for group video; **Coturn** for TURN/STUN
- **Live streaming:** RTMP ingest → **FFmpeg** transcode → HLS/DASH on CDN

### Infrastructure
- **Containers:** Multi-stage `Dockerfile` per service. Distroless final image. Non-root user. Read-only FS.
- **Local dev:** `docker-compose.dev.yml` with Postgres, Redis, Minio, MailHog, MeiliSearch, NATS, Jaeger, Prometheus, Grafana
- **Orchestration:** Helm charts for Kubernetes (EKS or GKE). Production deployment via ArgoCD GitOps.
- **IaC:** Terraform modules under `infra/terraform/{vpc, rds, eks, s3, cloudfront, route53}`
- **CI/CD:** GitHub Actions with matrix builds, Turborepo remote cache, Docker layer cache, Trivy scan, semantic-release
- **Edge:** Cloudflare Workers for auth-token validation at edge
- **Multi-region:** active-active in `us-east-1` + `eu-west-1` with **PostgreSQL logical replication** + **CRDTs** for conflict resolution where needed

### Observability
- **Logging:** `pino` JSON logs with redaction; ship to Loki/Datadog
- **Tracing:** OpenTelemetry SDK auto-instrument Fastify, pg, Redis, fetch; export to Jaeger or Honeycomb
- **Metrics:** Prometheus client on `/metrics` with RED method (Rate, Errors, Duration) + USE method (Util, Saturation, Errors) for resources
- **Errors:** Sentry SDK in every service and frontend
- **RUM:** Datadog RUM or Vercel Analytics on every Next.js app
- **Dashboards:** Grafana dashboards committed under `infra/grafana/dashboards/`
- **SLOs:** Error budget burn alerts via Grafana OnCall or PagerDuty
- **Audit log:** every privileged action → ClickHouse `audit_events` table with immutable retention

### Testing
- **Unit:** **Vitest** with `c8` coverage. Min coverage 80% on `packages/`.
- **Integration:** Vitest + `testcontainers` (real Postgres + Redis) for service tests
- **E2E:** **Playwright** running against the full docker-compose stack
- **Contract:** **Pact** between frontend ↔ each backend
- **Load:** **k6** scenarios under `tests/load/`
- **Security:** OWASP ZAP automated scan in CI; `npm audit --production` blocking
- **A11y:** `@axe-core/playwright` in E2E
- **Visual regression:** Chromatic on Storybook
- **Mutation:** Stryker on critical packages (auth, billing, ai)

### Code Quality
- **ESLint** with `@typescript-eslint`, `eslint-plugin-security`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`
- **Prettier** with shared config under `packages/config-prettier`
- **Husky** + `lint-staged` for pre-commit
- **commitlint** with Conventional Commits
- **Turborepo** task pipeline with remote cache
- **Strict** `tsconfig` with `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes: true`

---

## EXECUTION PLAN — 8 PHASES

Each phase is a separate PR. Do not start phase N+1 until phase N is merged and green in CI.

### PHASE 0 — Repo bootstrap (foundation)
**Deliver:**
1. Convert root `package.json` to declare real `devDependencies` (TypeScript 5.5, Turborepo, Vitest, ESLint, Prettier, Husky, lint-staged, commitlint).
2. Add `pnpm-workspace.yaml`, switch from `npm` to `pnpm` (remote cache compatible).
3. Add `turbo.json` with `lint`, `typecheck`, `test`, `build`, `dev` pipelines.
4. Add `.editorconfig`, `.gitignore` (covering `node_modules`, `.turbo`, `.next`, `dist`, `coverage`, `.env*`).
5. Add `.nvmrc` pinned to Node 22 LTS.
6. Add `.github/workflows/ci.yml`: matrix Node 22 / Node 20, lint → typecheck → test → build, Turborepo cache, Trivy filesystem scan.
7. Add `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
8. Replace `scripts/test.js` with proper `vitest` config.
9. Add ESLint + Prettier configs as `packages/config-eslint` and `packages/config-prettier`.

**Acceptance:** `pnpm install && pnpm turbo lint typecheck test build` exits 0 on a fresh clone. CI is green.

---

### PHASE 1 — Real persistence layer (`packages/database`)
**Deliver:**
1. Choose **Prisma 5**. Delete the in-memory `BaseModel` and `_store: Map<>`.
2. Convert every TypeScript schema interface in `packages/database/src/schemas/*.ts` into a Prisma `schema.prisma` model with proper indexes, foreign keys, cascade rules, and check constraints.
3. Generate the initial migration via `prisma migrate dev --name init`. Delete `migrations/001-initial.ts`.
4. Add **pgvector** extension migration for embeddings on `users`, `messages`, `emails`, `posts`, `videos`, `photos`.
5. Add row-level security policies for multi-user tables (`messages`, `emails`, `posts`).
6. Implement repositories under `packages/database/src/repositories/` using the Prisma client. Each repository takes the client via constructor (DI).
7. Add a transaction helper `withTx<T>(client, fn)` so services can pass a `tx` instead of a client.
8. Add `packages/database/src/seed.ts` with realistic faker-generated data for local dev.
9. Add a `docker-compose.dev.yml` with Postgres 16 + pgvector + Redis 7 + Minio + MailHog + Meilisearch + NATS.

**Acceptance:** `docker compose up -d && pnpm db:migrate && pnpm db:seed` populates a real Postgres database. All previous in-memory `Map<>` references in services and packages are removed (grep returns nothing for `private _store: Map`).

---

### PHASE 2 — Real auth (`packages/auth` + identity service)
**Deliver:**
1. Add deps: `argon2`, `jose`, `otplib`, `@simplewebauthn/server`, `zod`, `cookie`.
2. Replace `TokenService.sign()` with `jose.SignJWT` HS256 (access tokens) and RS256 with JWKS rotation (federation tokens).
3. Replace `TokenService.encodeToken/decodeToken` with `jose.jwtVerify`.
4. Replace `OAuthService.hashPassword` with argon2id (`{ type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }`).
5. Replace `OAuthService.verifyTwoFactorCode` with `otplib.authenticator.verify`.
6. Replace `QuantMailProvider.sha256Base64Url` with `crypto.subtle.digest('SHA-256', ...)` + base64url encoding from `jose.base64url`.
7. Replace every `Math.random()` for codes / secrets / IDs with `crypto.randomBytes(32).toString('base64url')` (helper: `secureToken(bytes)`).
8. Move sessions, refresh-token families, revoked tokens, OTP storage, OAuth codes, rate-limit buckets to **Postgres** (durable) + **Redis** (hot path with TTL).
9. Implement refresh-token rotation with reuse detection in a **Postgres transaction** with `SELECT ... FOR UPDATE`.
10. Implement WebAuthn passkey registration & assertion endpoints.
11. Implement `/.well-known/jwks.json`, `/.well-known/openid-configuration` (OIDC discovery).
12. Add a **dedicated `services/identity/` Fastify service** running on its own port, exposing `/auth/*`, `/oauth/*`, `/2fa/*`, `/passkeys/*`, `/userinfo`, `/jwks.json`.
13. All other apps consume identity via a typed `IdentityClient` that ships in `@quant/auth`.
14. Replace the toy "E2EE" in `messaging-service.ts` with **Signal Protocol** (X3DH + Double Ratchet) via `@privacyresearch/libsignal-protocol-typescript`. Provide a key-server endpoint in identity service for prekey publishing.
15. Add `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` (Redis store), `@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/sensible`.

**Acceptance:**
- `grep -r "Math.random" packages/auth services/identity apps/*/api/services/oauth-service.ts apps/*/api/services/messaging-service.ts` returns zero.
- `grep -rn "((hash << 5) - hash + char)" packages/ apps/` returns zero.
- A real OAuth 2.1 + PKCE S256 flow completes against a curl client. PKCE verifier failure rejects the exchange.
- Tokens forged with the old toy hash are rejected by `jose.jwtVerify`.
- Argon2 verification regresses on weak passwords ≥ 10 ms (timing safe).

---

### PHASE 3 — Replace custom HTTP/WebSocket layer with Fastify
**Deliver:**
1. Delete every `apps/*/api/server.ts` custom `Router` and `require('http')` block.
2. Create a shared `@quant/server-core` package providing:
   - `createApp(config)` returning a Fastify instance preconfigured with helmet, cors, rate-limit (Redis), pino logger, OpenTelemetry, Sentry, request-id, error handler, schema-driven validation via `@fastify/type-provider-zod`.
   - `registerRoutes(app, routes)` with typed Zod schemas per route.
   - Auth plugin that validates the access token and binds `req.auth: AuthContext`.
   - Graceful shutdown (SIGTERM → drain → close DB/Redis pools).
3. Convert each app's controllers + routes to Fastify route definitions with Zod input/output schemas. Eliminate manual `req.body as RegisterRequest` casts; rely on Zod-typed `req.body`.
4. Replace `@fastify/websocket` for per-service realtime endpoints. Implement actual frame handling, ping/pong, backpressure (`socket.bufferedAmount`).
5. Add per-service `Dockerfile` (multi-stage, distroless final). Build via `pnpm turbo build && docker build -f services/<name>/Dockerfile`.

**Acceptance:**
- A Postman/curl request to any endpoint returns a Zod-validated 400 on bad input with field-level errors.
- `wscat` connects to `ws://localhost:3002/ws` and receives a real `presence:update` JSON frame after sending an auth token.
- Every service has a `/healthz` (liveness) and `/readyz` (readiness) endpoint that checks DB + Redis connectivity.

---

### PHASE 4 — Real AI (`packages/ai`)
**Deliver:**
1. Add deps: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `ai` (Vercel AI SDK), `langchain`, `@langchain/openai`, `@langchain/anthropic`, `@langchain/community`, `tiktoken`.
2. Delete `engine.ts:simulateResponse()`. Implement `AIEngine.infer()` and `AIEngine.stream()` using Vercel AI SDK's `generateText` / `streamText` with provider abstraction.
3. Implement real `ModelRouter`:
   - Capability-based routing (text, image, audio, embedding).
   - Cost-aware fallback chain (e.g. `gpt-4o → gpt-4o-mini → claude-haiku`).
   - Circuit breaker (`opossum`) per provider.
   - Retry-with-jitter on 429/5xx.
4. Replace `ContextManager` with **vector-backed memory**:
   - Store memories as `Memory(userId, embedding vector(1536), content, metadata, importance, ts)` in Postgres+pgvector.
   - Retrieve with cosine similarity + recency decay + importance weighting.
   - LangChain `VectorStoreRetriever` integration.
5. Implement **prompt registry**:
   - `packages/ai/prompts/<feature>/<version>.yaml` with `template`, `variables`, `examples`, `evals`.
   - `loadPrompt(feature, version)` returns a typed renderer.
6. Implement **safety pipeline**: pre-filter (PII redaction with `microsoft/presidio` rules + regex), pre-moderation (OpenAI Moderation API), post-moderation, profanity filter.
7. Implement **semantic cache** keyed by embedding similarity ≥ 0.97.
8. Implement **cost & token attribution**: every inference logs to ClickHouse via Kafka producer.
9. Per-user, per-feature, per-day budget enforcement read from Redis sliding-window.
10. Streaming endpoints: SSE at `/ai/stream` and WebSocket fan-out via Redis pub/sub.
11. Domain services (`chat-ai.ts`, `mail-ai.ts`, `content-ai.ts`, `recommendation-ai.ts`, `device-control-ai.ts`) re-implemented to call `AIEngine` with their feature-specific prompt + post-processing.
12. Implement `@quant/ai/agents`:
    - `MailComposeAgent` with tool calls for calendar lookup, contact lookup.
    - `DeviceControlAgent` with MCP-style tool registry and safety validator.
    - `RecommendationAgent` over user activity embeddings.
13. Add evals harness under `packages/ai/evals/` using `promptfoo`. Run as a CI job.

**Acceptance:**
- Setting `OPENAI_API_KEY=...` and calling `POST /ai/infer` returns a real GPT-4o response.
- Removing the key fails with a structured `AI_PROVIDER_UNAVAILABLE` error and engages the fallback chain.
- A cosine-similarity test confirms semantic cache hits across paraphrases.
- Cost ledger in ClickHouse shows row per call with `model`, `inputTokens`, `outputTokens`, `costUsd`.

---

### PHASE 5 — Real realtime (`packages/realtime`)
**Deliver:**
1. Replace the no-op `WebSocketServer.sendToClient` with a real Fastify-WebSocket integration. Each `ConnectedClient` holds a reference to the actual `socket.WebSocket`.
2. Implement Redis pub/sub fan-out so messages published in instance A reach subscribers connected to instance B.
3. Implement consistent hashing routing layer (`hash(userId) % shards`) so a user's connections stick to the same gateway during a session.
4. Implement **NATS JetStream** event bus for cross-app events (`message.created`, `post.created`, `user.online`, `ad.impression`, `ai.response.completed`). Each app subscribes to the streams it needs.
5. Implement DLQ topics and a janitor worker that retries with exponential backoff up to N times then alerts.
6. Implement WebRTC signaling for QuantChat / QuantMax via the WebSocket gateway. Provision **MediaSoup** SFU service under `services/sfu/`. Provision **Coturn** in docker-compose.
7. Implement Web Push (VAPID) using `web-push`. Implement APNs via `apn` and FCM via `firebase-admin`. Each push goes through a `PushOrchestrator` that picks the right transport per user device.
8. Replace the per-user `setInterval` heartbeat in `PresenceManager` with a single global cleanup loop driven by Redis ZSET TTL. Eliminate the O(N) timer leak.

**Acceptance:**
- Two `wscat` clients connected to two different Node instances exchange messages in real time.
- Killing instance A migrates the user's connections to instance B within 5 s without dropped messages (durability via NATS).
- WebRTC video call between two browser tabs succeeds end-to-end through the SFU.
- Sending a notification while user is offline delivers via Web Push + APNs + FCM after a single API call.

---

### PHASE 6 — Per-app domain completeness
For each of the 9 apps, complete the production behavior. Below are non-negotiables per app.

#### QuantChat
- E2EE via Signal Protocol (Phase 2 hookup).
- WebRTC SFU group video (≥ 50 participants) via MediaSoup.
- Disappearing messages enforced via durable `BullMQ` delayed job.
- Snap streak tracking with daily cron.
- Stories with 24 h TTL using Redis ZSET + S3 presigned URLs.
- Snap Map with privacy-preserving location (geohash precision opt-in).
- AR filters offloaded to MediaPipe via WebAssembly on client; backend only stores recipe metadata.
- Bitmoji avatars stored as glTF in S3.

#### QuantMail
- SMTP relay via **Postmark** primary, **Amazon SES** failover.
- Inbound mail via SES + S3 + Lambda → ingestion service.
- DKIM + SPF + DMARC enforced; `@quant/mail-auth` validator package.
- IMAP/SMTP gateway service (`services/mail-gateway/`) using `@nodemailer/imap`.
- S/MIME signing optional per user.
- Real OAuth 2.1 provider for ecosystem SSO (Phase 2).
- AI features (summarize, compose, categorize, priority, phishing) wired to real `MailAIService` (Phase 4).

#### QuantSync
- Timeline ranking via **two-tower** model (offline) producing user/post embeddings; online ranker reranks candidates from Postgres + Redis cache.
- Hashtag indexing with Meilisearch + trending detection via streaming aggregation in NATS.
- Communities with role-based access; moderator tools backed by content moderation pipeline.
- Polls with vote integrity (one vote per user, no client-side tampering).

#### QuantAds
- **Real-time auction** service (`services/ad-auction/`) with second-price sealed-bid + budget pacing.
- Targeting evaluator using boolean expression engine on user embeddings + segments stored in Redis.
- Brand-safety classifier (AI Phase 4) on every creative submission.
- Click-fraud detection via velocity + IP reputation (MaxMind GeoIP + Redis sliding window).
- Billing via **Stripe** with usage-based metering.
- ClickHouse `impressions` and `clicks` tables; nightly aggregation to BigQuery.

#### QuantTube
- HLS / DASH transcoding pipeline using **FFmpeg** workers in Kubernetes Jobs orchestrated by Temporal.
- CDN delivery via Cloudflare + signed URLs.
- Recommendation engine using user-watch embeddings + post-2-vec.
- Live streaming RTMP ingest via **Nginx-RTMP** sidecar; HLS output on CDN.
- Content ID (audio fingerprint via `chromaprint` Wasm) for copyright detection.
- Monetization: ad-break insertion via QuantAds API.

#### QuantNeon
- Image processing via **Sharp** in worker; output WebP/AVIF.
- Filters via WebGL on client; server stores recipe.
- ML labeling via AI service (CLIP embeddings → tags).
- Stories TTL via BullMQ delayed jobs.
- Shopping integration with Stripe.

#### QuantEdits
- Browser-side rendering via **WebAssembly FFmpeg** + `@ffmpeg/ffmpeg`.
- Server-side render farm for high-res exports (Kubernetes Job per render).
- Timeline state stored as **Yjs** CRDT in Postgres for real-time collaboration.
- Asset library backed by S3 with on-the-fly Sharp transforms.

#### QuantMax
- WebRTC random-match via signaling service (Phase 5).
- **Age verification** at signup (Persona API or Onfido).
- Safety AI: real-time NSFW classifier (NSFW.js Wasm on client + server backstop).
- Matching algorithm: Elo-style ranking + collaborative filtering.
- Live video chat with TURN.
- Reporting + ban pipeline integrated with trust-and-safety queue.

#### QuantAI
- Vercel AI SDK agents with tool calling (Phase 4).
- Device control via MCP (Model Context Protocol) bridge to Home Assistant or Matter devices.
- Skills marketplace (manifest schema + sandboxed execution via WebContainers in browser, Firecracker on server).
- Multi-modal: image (gpt-4o-vision), audio (Whisper), video (Gemini 1.5 Pro).

**Acceptance per app:** Each app has its own `services/<app>-api/` with Fastify, its own Dockerfile, its own integration tests against the real DB / Redis / NATS, and its Next.js frontend at `apps/<app>/` actually runs `pnpm dev` and talks to the real backend.

---

### PHASE 7 — Production infrastructure (`infra/`)
**Deliver:**
1. **Terraform** root modules under `infra/terraform/`:
   - `vpc/` (3-AZ private + public + isolated subnets)
   - `eks/` (managed node groups, Karpenter autoscaling)
   - `rds/` (Postgres Multi-AZ, automated backups, PITR, read replicas)
   - `elasticache/` (Redis cluster mode, auth token, encryption in transit + at rest)
   - `s3/` (per-app buckets with lifecycle rules, encryption, versioning, replication)
   - `cloudfront/` (per-app distribution, OAI, signed URLs)
   - `route53/` (per-environment hosted zones with health checks)
   - `acm/`, `kms/`, `secretsmanager/`, `cloudwatch/`, `wafv2/`
2. **Helm charts** under `infra/helm/quant-platform/` covering every microservice with HPA, PDB, NetworkPolicy, ServiceMonitor.
3. **ArgoCD** Application manifests under `infra/argocd/` for staging + prod environments.
4. **GitHub Actions** workflows:
   - `ci.yml` (Phase 0)
   - `release.yml` (semantic-release + Docker push to GHCR)
   - `deploy-staging.yml` (auto-merge → ArgoCD sync staging)
   - `deploy-prod.yml` (manual approval gate)
   - `nightly-security.yml` (Trivy + Snyk + ZAP)
5. **Observability stack** in `infra/observability/`:
   - Prometheus + Thanos (long-term)
   - Grafana with provisioned dashboards committed under `infra/grafana/dashboards/`
   - Loki for logs
   - Tempo for traces
   - Sentry self-hosted optional, hosted by default
   - Alertmanager → PagerDuty
6. **SLOs** defined under `infra/slo/`:
   - Identity service: 99.95% availability, p99 < 200 ms
   - Chat ingest: 99.9% availability, p99 < 150 ms
   - Mail send: 99.9% delivery within 60 s
   - AI inference: 99% availability, p95 < 4 s for streaming first-byte
7. **Cloudflare** Terraform module for WAF rules, rate limiting, bot management, page rules.
8. **Cost-control:** Karpenter consolidation, spot node pool for stateless workers, S3 Intelligent-Tiering, RDS reserved instances.

**Acceptance:** `terraform apply` provisions a staging environment from scratch in < 30 min. `argocd app sync` deploys the platform. Hitting any public domain returns 200 from the right service through Cloudflare.

---

### PHASE 8 — Compliance, privacy, legal
**Deliver:**
1. **GDPR**: data export endpoint (`POST /privacy/export` returning a signed URL to a zipped JSON), data delete endpoint with 30-day grace period, audit log retention 6 years.
2. **CCPA**: do-not-sell flag on user profile + downstream propagation through analytics pipeline.
3. **COPPA**: age gate on signup; under-13 path locked.
4. **DSAR workflow**: ticket queue + 30-day SLA enforced via Temporal workflow.
5. **PII map** under `docs/privacy/data-inventory.yaml` listing every PII field, where it is stored, retention, encryption.
6. **Encryption at rest**: enable RDS KMS, S3 SSE-KMS, EBS encryption, Redis in-transit + at-rest.
7. **PCI DSS**: ad billing flow uses Stripe Elements (PAN never touches our servers). Document SAQ-A compliance.
8. **SOC 2**: control matrix scaffold under `docs/compliance/soc2/`.
9. **Cookie consent**: TCF v2.2 banner via OneTrust or open-source `klaro`.
10. **Terms / Privacy / DPA**: legal docs under `docs/legal/` (placeholder, owner = legal).

**Acceptance:** `POST /privacy/export` for any user returns a complete dataset within 24 h. `POST /privacy/delete` schedules deletion across all 9 apps via NATS event consumed by every service.

---

## NON-NEGOTIABLE GLOBAL RULES

1. **Never** use `Math.random()` for anything that touches security, identity, billing, or content addressability. Use `crypto.randomBytes` / `crypto.randomUUID` / `crypto.randomInt`.
2. **Never** roll your own crypto. Use `argon2`, `jose`, `crypto.subtle`, `libsignal`. Custom `((hash << 5) - hash)` is a fireable offense.
3. **Never** store sensitive data in process memory. Use Postgres + Redis. Restarting any pod must not lose user state.
4. **Never** commit secrets. `.env` files are gitignored; `.env.example` is the contract.
5. **Never** trust a request header that crossed an untrusted boundary. Validate JWT signatures every hop.
6. **Always** validate input with Zod schemas at API boundaries.
7. **Always** use parameterized queries (Prisma handles this; raw SQL must use `Prisma.sql`).
8. **Always** redact PII from logs (`pino-noir` or pino redact paths).
9. **Always** include trace context in every log line (`traceId`, `spanId`, `userId` if authed).
10. **Always** wrap external calls in a circuit breaker + timeout + retry with jitter.
11. **Always** ship a service with healthz + readyz + Prometheus `/metrics`.
12. **Always** write tests before merge. Coverage gate ≥ 80% per package.
13. **Always** sign Docker images with cosign and verify in admission controller.
14. **Always** pin third-party dependencies (Renovate bot for updates).
15. **Always** measure twice — load test before launch.

---

## OUTPUT FORMAT FOR EACH PHASE

For every phase, produce:

1. **Plan**: bullet list of files to create/modify, deps to add.
2. **Diff**: complete file contents for every new/modified file. No `// ...rest unchanged` placeholders.
3. **Tests**: Vitest specs for every public function added.
4. **Migration notes**: for each phase that touches data, the exact `prisma migrate` command and any data backfill scripts.
5. **Operator runbook**: for each phase that adds infra, the runbook to deploy, rollback, and observe.
6. **Acceptance proof**: a self-contained shell snippet (curl/wscat/k6) demonstrating the acceptance criteria.

If you cannot deliver an entire phase in one response, deliver as much as fits and explicitly state `CONTINUED IN NEXT MESSAGE: <next-file-to-write>`. Never abandon a phase mid-flight.

---

## HARD STOP

You will not write a single line of code that:
- uses `Math.random()` for IDs or secrets,
- stores user data in a `Map<>` or `Set<>` outside of a request scope,
- catches an error and returns `null` without logging it,
- ships a fallback `JWT_SECRET` string in code,
- declares a route without Zod validation,
- declares a Fastify plugin without OpenTelemetry instrumentation,
- merges to `main` without CI green.

If you encounter ambiguity, ask exactly one clarifying question; otherwise pick the option that maximizes long-term security and operability and proceed.

Begin with **PHASE 0**.
