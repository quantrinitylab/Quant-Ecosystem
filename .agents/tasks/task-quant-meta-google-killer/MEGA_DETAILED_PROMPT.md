# 🚀 QUANT ECOSYSTEM — AUTONOMOUS KIRO MEGA DETAILED PROMPT

> **PASTE THIS ENTIRE FILE'S CONTENT INTO AUTONOMOUS KIRO**
> 
> This is the COMPLETE execution plan for transforming the Quant Ecosystem
> from a 299K-LOC scaffold into a 1.5M+ LOC launch-ready super-app that
> structurally outcompetes Meta, Google, Apple, OpenAI, and every Big Tech
> player. Every phase, every file, every feature is specified.

---

## 0. CONTEXT — READ THIS FIRST

You are an autonomous coding agent. Your job is to execute Phases 9 through 42
of the Quant Ecosystem build, in strict order, each as a separate feature
branch + pull request.

### Repository
- **GitHub:** `quantmailteamsupport-dev/Quant-Ecosystem`
- **Default branch:** `main`
- **Branch naming:** `feat/phase-NN-slug` (e.g. `feat/phase-09-data-plane`)

### Verified Current State (as of 2026-05-25)
- 1,433 TypeScript/TSX files
- 299,478 lines of code
- 9 apps: quantchat, quantmail, quantube, quantmax, quantneon, quantsync, quantedits, quantads, quantai
- 28 packages: admin, ai, analytics, api-client, auth, common, database, data-pipeline, developer-platform, ecosystem-bridge, gaming, i18n, media, ml-pipeline, moderation, notifications, observability, payments, performance, realtime, recommendations, search, security, server, server-core, shared-ui, social-graph, testing
- 41 test files (~3% coverage by file count — MUST INCREASE TO 80%)
- Phase 0-8 DONE. Phase 9-21 NOT STARTED. You start at Phase 9.

### Critical Tech Debt (CONFIRMED via code inspection)
1. `apps/quantmail/api/` — 41+ files use in-memory `Map<string, Email>` storage. **DELETE.**
2. `apps/quantmail/api-v2/` — duplicate parallel implementation. **MERGE into `apps/quantmail/backend/`.**
3. Same parallel pattern exists in ALL 9 apps. Eliminate.
4. `services/*` — only Dockerfiles, no real service code.
5. `packages/social-graph/src/core/graph-store.ts` — uses `new Map()` 7 times. **REPLACE with Prisma + Redis.**
6. `packages/moderation/src/services/text-moderator.ts` — has regex with literal `profanity_severe_1` placeholder strings. **REPLACE with ML.**
7. `packages/payments/src/services/gateway-service.ts` — references Stripe in config but never imports `stripe` SDK. **ADD real Stripe.**
8. `packages/media/src/services/video-transcoder.ts` — has FFmpeg profiles but never spawns ffmpeg. **ADD real `fluent-ffmpeg`.**
9. `packages/notifications/src/services/push-service.ts` — references FCM/APNs but never imports `firebase-admin`. **ADD real SDK.**
10. `packages/search` — MeiliSearch in docker-compose but no client code. **ADD real client.**
11. `packages/recommendations` — types only, no algorithms.
12. `apps/quantads/api/services/auction-service.ts` — campaigns in `Map<>`. **REPLACE with Redis sorted sets.**
13. `apps/quantmax/api/services/matching-algorithm-service.ts` — profiles in memory. **REPLACE with pgvector.**
14. No `@quant/data-plane`, `@quant/queue`, `@quant/storage`, `@quant/federation`, `@quant/sync-engine`, `@quant/compliance`, `@quant/ml-runtime`, `@quant/agent-runtime` packages exist.
15. No real SMTP/IMAP server (QuantMail can't actually send/receive email!).
16. No real git hosting (QuantMail Git is fake).
17. No agent swarm code.
18. No on-device AI integration.
19. No federation (ActivityPub/Matrix).
20. No quality gates (coverage, mutation, e2e, load).

---

## 1. THE 13 UNCOPYABLE STRATEGIC MOATS

These are competitive advantages Meta, Google, OpenAI, Apple **cannot copy
without destroying their own business model**. Every architectural decision
you make MUST preserve these moats.

| # | Moat | Why competitors can't copy |
|---|------|----------------------------|
| M1 | E2E encryption by default (Signal Protocol + MLS + ZK email) | Meta's ad revenue requires server-side content access |
| M2 | 90/10 creator revenue split with transparent ledger | YouTube's 55/45 split is baked into their P&L |
| M3 | Universal AI agent spanning all 19 apps with long-term memory | Meta DMA-walled across FB/IG/WhatsApp; Google would ad-target |
| M4 | ActivityPub + Matrix federation | X/Threads strategy is walled-garden lock-in |
| M5 | On-device ML ranking via ONNX Runtime Web | Meta's ad funnel requires centralized targeting |
| M6 | Stable open public API with third-party clients encouraged | X destroyed trust with $42k/mo paywall |
| M7 | Anti-rage-engagement ranking optimizing week-30 retention | Meta quarterly DAU targets reward outrage |
| M8 | One-click cross-post: record once → publish to 4+ surfaces | No competitor owns all surfaces simultaneously |
| M9 | Offline-first CRDT sync | Meta/Google apps are server-dependent by architecture |
| M10 | Portable DID identity: export account + social graph in 5 min | Their business IS the lock-in |
| M11 | User-choosable ranking algorithm (chrono/AI/community/BYO) | Their ad revenue depends on algorithm control |
| M12 | $4.99/mo subscription removes ALL ads across ALL 19 apps | YouTube Premium is $13.99 for ONE app |
| M13 | AI transparency: every AI decision has "Explain This" button | Their black-box models hide exploitative patterns |

---

## 2. AI STRATEGY — NO OWN MODELS, USE CLOUD APIs

**You will NOT train your own foundation models.** Apna model banana
$100M-$1B + 2-3 years lagega. Instead:

### 2.1 Multi-Provider Cloud API Routing
Add ALL these providers via Vercel AI SDK to `packages/ai`:

```bash
pnpm add @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google \
         @ai-sdk/deepseek @ai-sdk/groq @ai-sdk/mistral \
         @ai-sdk/fireworks @ai-sdk/togetherai @ai-sdk/deepinfra \
         @ai-sdk/cohere ollama-ai-provider
```

### 2.2 Smart Routing Table (route by task, not by user choice)

| Task | Provider/Model | Reason |
|------|---------------|--------|
| Autocomplete | `groq/llama-3.3-70b-versatile` | Fastest (500+ tok/s), cheap |
| Code generation | `deepseek/deepseek-coder-v3` | 98% cheaper than GPT-4o, similar quality on code |
| Complex reasoning | `anthropic/claude-sonnet-4` | Best reasoning |
| Cheap reasoning | `deepseek/deepseek-r1` | 90% of Claude quality at 5% cost |
| Summarization | `google/gemini-2.5-flash` | Cheapest quality option |
| Voice STT | `groq/whisper-large-v3` | Fastest Whisper |
| Voice TTS | `openai/tts-1-hd` | Best quality voices |
| Image gen | `openai/dall-e-3` | Best general image gen |
| Embeddings (bulk) | `deepinfra/bge-large-en-v1.5` | Cheapest at scale |
| Reranking | `cohere/rerank-v3` | Best dedicated reranker |
| Moderation | `openai/omni-moderation-latest` | Free, multimodal |
| Translation | `deepseek/deepseek-v3` | 100+ languages, cheap |
| Web search | `perplexity/sonar-pro` | Real-time web with citations |
| Vision (screenshots) | `openai/gpt-4o` | Best UI element detection for device control |

### 2.3 Cost Target
**$0.02 per user per day average** by intelligent routing. (Compare: GPT-4o
for everything = $0.50/user/day. Smart routing = 96% savings.)

### 2.4 On-Device AI (Privacy Layer)
Use these libraries in browser/mobile for privacy-critical tasks:

```bash
pnpm add @mlc-ai/web-llm onnxruntime-web @huggingface/transformers
```

Tasks that run on-device:
- Email autocomplete (Phi-3 Mini 4-bit, 1.8GB, <100ms)
- Feed ranking (custom ONNX, 50MB, <20ms)
- Spam detection (DistilBERT fine-tuned, 60MB, <15ms)
- Smart reply (Gemma 2B 4-bit, 1.4GB, <200ms)
- Content warning (NSFW classifier, 25MB, <30ms)
- Face detection (MediaPipe, 5MB, <10ms)

### 2.5 Future (Month 12+)
Fine-tune open-source models (Llama 3.3 8B, Mistral Small) on user
interaction logs (with consent) for domain-specific tasks. NOT in scope
for current phases.

---

## 3. EXECUTION RULES — FOLLOW STRICTLY

1. **Phases 9-42 in STRICT ORDER.** Do not start phase N+1 until phase N
   acceptance gate passes.
2. **Each phase = ONE feature branch + ONE pull request.**
   - Branch: `feat/phase-NN-<slug>`
   - PR title: `feat(phase-NN): <slug>`
3. **Before starting each phase:**
   ```bash
   git checkout main && git pull
   pnpm install --frozen-lockfile
   pnpm turbo typecheck   # MUST be green
   pnpm turbo test        # MUST be green
   ```
4. **Each phase MUST end with:**
   - `pnpm turbo typecheck` ✅
   - `pnpm turbo lint` ✅
   - `pnpm turbo test` ✅
   - `pnpm turbo build` ✅
   - All acceptance criteria verified
5. **Conventional Commits format:** `feat(scope): description`,
   `fix(scope): description`, `refactor(scope): description`.
6. **PR body MUST include:**
   - Phase summary (1 paragraph)
   - Files changed grouped by package
   - Acceptance checklist with ✅/❌
   - curl examples for new APIs
   - Screenshots for new UIs
   - Follow-ups list
7. **When file/path exists:** READ first with `read_file` tool, then
   refactor in-place. NEVER create parallel duplicates.
8. **Prefer extending existing packages** over creating new ones unless
   functional boundary is genuinely orthogonal.
9. **Type safety:**
   - TypeScript strict mode, no `any`, no `// @ts-ignore` without
     justification comment
   - All cross-package imports use `@quant/<pkg-name>`
   - All validation uses Zod
   - All errors are typed from `@quant/common/errors`
10. **Security:**
    - Never `Math.random` for security paths — use `crypto.randomBytes`,
      `crypto.randomUUID`
    - Never store PII in plaintext — use `@quant/data-plane` field
      encryption
    - All passwords via Argon2id (already done in `@quant/auth`)
11. **Testing:**
    - Every new service file gets a co-located `.test.ts`
    - Critical packages (auth, payments, ai, security, data-plane) MUST
      reach 80% line coverage
    - Add integration tests for any cross-package interaction
12. **Time budget:** If a phase exceeds 6 hours of agent time, STOP, write
    `.agents/tasks/task-quant-meta-google-killer/PHASE-NN-status.md`
    with progress + blockers, return control to user.
13. **Verification grep gates after each phase:**
    - `grep -r "new Map" packages/<modified-pkg>/src` should show ZERO
      hits (unless legitimate runtime cache with TTL — annotate why)
    - `grep -r "Math.random" packages/<modified-pkg>/src` should show ZERO
      hits in security paths
    - `grep -r "TODO\|FIXME\|placeholder" packages/<modified-pkg>/src`
      should show <5 hits per package


---

## 4. PHASES 9-42 — DETAILED EXECUTION

### 🟢 PHASE 9 — Unified Data Plane + Kill Legacy Code

**Branch:** `feat/phase-09-data-plane`
**Estimated time:** 4-6 hours

#### What to do

**Step 1: Delete all legacy in-memory `api/` folders**
```bash
rm -rf apps/quantmail/api/
rm -rf apps/quantmail/api-v2/
rm -rf apps/quantchat/api/
rm -rf apps/quantube/api/
rm -rf apps/quantmax/api/
rm -rf apps/quantneon/api/
rm -rf apps/quantsync/api/
rm -rf apps/quantedits/api/
rm -rf apps/quantads/api/
rm -rf apps/quantai/api/
```

**Step 2: For each app, ensure `apps/<app>/backend/` is the single canonical Fastify server.** Apps that don't have `backend/` yet (quantube, quantmax, quantneon, quantsync, quantedits, quantads, quantai) — port the essential business logic from the deleted `api/services/` files into `backend/services/`, but use Prisma instead of `Map<>`.

**Step 3: Create `@quant/data-plane` package**

Files to create:
```
packages/data-plane/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                          # Barrel exports
    ├── base-repository.ts                # Generic repository with all features
    ├── outbox.ts                         # Outbox pattern publisher
    ├── replica-router.ts                 # Read-replica routing
    ├── field-encryption.ts               # AES-256-GCM field encryption
    ├── audit-log.ts                      # Mutation audit trail
    ├── soft-delete.ts                    # Soft delete with deletedAt
    ├── optimistic-locking.ts             # Version field-based locking
    └── __tests__/
        ├── base-repository.test.ts
        ├── outbox.test.ts
        ├── replica-router.test.ts
        ├── field-encryption.test.ts
        └── audit-log.test.ts
```

**Step 4: `BaseRepository<T>` class — full feature set**

```typescript
// packages/data-plane/src/base-repository.ts
export abstract class BaseRepository<T extends { id: string; version: number; deletedAt?: Date }> {
  constructor(
    protected primary: PrismaClient,
    protected replica: PrismaClient,           // for reads
    protected outbox: OutboxPublisher,
    protected auditLog: AuditLogger,
    protected encryption: FieldEncryption,
  ) {}

  // Reads route to replica
  async findById(id: string, opts?: { includeSoftDeleted?: boolean }): Promise<T | null> { /* ... */ }
  async findMany(where: any): Promise<T[]> { /* ... */ }

  // Writes route to primary, in transaction with outbox + audit
  async create(data: Partial<T>, actor: { userId: string }): Promise<T> { /* ... */ }
  async update(id: string, data: Partial<T>, actor: { userId: string }): Promise<T> {
    // 1. SELECT ... FOR UPDATE on primary
    // 2. Verify version matches (optimistic locking)
    // 3. Encrypt PII fields
    // 4. UPDATE with version++
    // 5. Insert OutboxEvent
    // 6. Insert AuditLog with diff
    // 7. Commit transaction
  }
  async softDelete(id: string, actor: { userId: string }): Promise<void> { /* sets deletedAt */ }
  async hardDelete(id: string, actor: { userId: string }): Promise<void> { /* GDPR */ }
}
```

**Step 5: Add Prisma models to `packages/database/prisma/schema.prisma`**

```prisma
model OutboxEvent {
  id            String    @id @default(cuid())
  aggregateType String
  aggregateId   String
  eventType     String
  payload       Json
  createdAt     DateTime  @default(now())
  publishedAt   DateTime?

  @@index([publishedAt, createdAt])
  @@index([aggregateType, aggregateId])
}

model AuditLog {
  id           String   @id @default(cuid())
  actorId      String
  action       String
  resourceType String
  resourceId   String
  diff         Json
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([resourceType, resourceId, createdAt])
}

model EncryptionKey {
  id            String   @id @default(cuid())
  userId        String   @unique
  encryptedKey  Bytes    // master key encrypted by KMS
  algorithm     String   @default("AES-256-GCM")
  rotatedAt     DateTime?
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
}
```

Run `pnpm prisma generate && pnpm prisma migrate dev --name add_data_plane_tables`.

**Step 6: Add Redpanda to `docker-compose.dev.yml`**

```yaml
  redpanda:
    image: redpandadata/redpanda:latest
    command:
      - redpanda
      - start
      - --kafka-addr=0.0.0.0:9092
      - --advertise-kafka-addr=redpanda:9092
      - --schema-registry-addr=0.0.0.0:8081
    ports:
      - "9092:9092"
      - "8081:8081"
    volumes:
      - redpanda_data:/var/lib/redpanda/data
```

**Step 7: Create `services/cdc-relay/`** — polls outbox, publishes to Redpanda

```
services/cdc-relay/
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts          # Entry point with graceful shutdown
    ├── poller.ts        # SELECT * FROM OutboxEvent WHERE publishedAt IS NULL ORDER BY createdAt LIMIT 100
    ├── publisher.ts     # KafkaJS client publishing to topic per aggregate type
    └── health.ts        # /health endpoint for Kubernetes
```

**Step 8: Create `@quant/queue` package** (BullMQ wrapper)

```
packages/queue/
├── package.json         # depends on bullmq, ioredis
└── src/
    ├── index.ts
    ├── client.ts        # createQueue<TJob>(), getQueue(), enqueue()
    ├── worker.ts        # createWorker<TJob>(processor), with retry policy
    ├── jobs/
    │   ├── transcode-job.ts
    │   ├── email-send-job.ts
    │   ├── push-job.ts
    │   ├── moderation-job.ts
    │   ├── embedding-job.ts
    │   └── ai-inference-job.ts
    └── dashboard.ts     # BullBoard mounted at /admin/queues
```

**Step 9: Create `@quant/storage` package** (S3/MinIO abstraction)

```
packages/storage/
├── package.json         # depends on @aws-sdk/client-s3
└── src/
    ├── index.ts
    ├── client.ts        # presignedUploadUrl(), presignedDownloadUrl(), delete(), list(), copy()
    ├── lifecycle.ts     # cold storage transitions, expiration
    └── cdn.ts           # Cloudfront integration for cache invalidation
```

**Step 10: Migrate existing repositories to extend `BaseRepository`**

Modify `packages/database/src/repositories/*.ts`:
- `user.repository.ts`
- `email.repository.ts`
- `message.repository.ts`
- `media.repository.ts`
- `notification.repository.ts`
- `post.repository.ts`
- `ai-session.repository.ts`

Each should `extends BaseRepository<User>`, `BaseRepository<Email>`, etc. with proper typing.

#### Acceptance Criteria

```bash
# 1. No legacy api/ folders
test "$(find apps -path '*/api/*' -name '*.ts' 2>/dev/null | wc -l)" -eq 0

# 2. No in-memory Maps in app code
! grep -r "new Map<" apps/ --include="*.ts" | grep -v "test\|spec\|cache"

# 3. Typecheck passes
pnpm turbo typecheck

# 4. All tests pass
pnpm turbo test

# 5. New packages compile
pnpm --filter @quant/data-plane build
pnpm --filter @quant/queue build
pnpm --filter @quant/storage build

# 6. Outbox integration test
# Write to DB → OutboxEvent created → CDC relay publishes to Redpanda within 5s

# 7. Prisma migration applied
pnpm prisma migrate status  # shows up-to-date

# 8. Read replica routing
# Set DATABASE_REPLICA_URL → repository.findById uses replica connection (verified by query log)
```



---

### 🟢 PHASE 10 — Replace ALL Stubs With Real SDK Integrations

**Branch:** `feat/phase-10-real-integrations`
**Estimated time:** 4-6 hours

#### What to do

**Step 1: Real Stripe in `packages/payments`**

```bash
pnpm --filter @quant/payments add stripe
```

Replace `packages/payments/src/services/gateway-service.ts` entirely:

```typescript
import Stripe from 'stripe';

export class StripeGateway {
  private stripe: Stripe;
  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, { apiVersion: '2025-08-27.basil' });
  }

  async createPaymentIntent(opts: { amount: number; currency: string; customerId: string; metadata: Record<string,string>; idempotencyKey: string }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: opts.amount,
      currency: opts.currency,
      customer: opts.customerId,
      metadata: opts.metadata,
      automatic_payment_methods: { enabled: true },
    }, { idempotencyKey: opts.idempotencyKey });
  }

  async createCustomer(email: string, name: string): Promise<Stripe.Customer> { /* ... */ }
  async refund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> { /* ... */ }
  async createSubscription(customerId: string, priceId: string): Promise<Stripe.Subscription> { /* ... */ }
  verifyWebhook(payload: string, signature: string, secret: string): Stripe.Event { /* ... */ }
}
```

Add webhook route in `apps/quantmail/backend/routes/webhooks.ts`:
```typescript
fastify.post('/webhooks/stripe', async (req, reply) => {
  const sig = req.headers['stripe-signature'] as string;
  const event = gateway.verifyWebhook(req.rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  // Handle: payment_intent.succeeded, customer.subscription.updated, etc.
});
```

**Step 2: Real FFmpeg in `packages/media`**

```bash
pnpm --filter @quant/media add fluent-ffmpeg @ffmpeg-installer/ffmpeg
pnpm --filter @quant/media add -D @types/fluent-ffmpeg
```

Replace `packages/media/src/services/video-transcoder.ts`:

```typescript
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
ffmpeg.setFfmpegPath(ffmpegPath.path);

export class VideoTranscoder {
  async transcodeToHLS(input: { sourceUrl: string; outputDir: string; profiles: TranscodeProfile[] }): Promise<{ manifestUrl: string; variants: StreamVariant[] }> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(input.sourceUrl);
      for (const profile of input.profiles) {
        command.output(`${input.outputDir}/${profile.id}.m3u8`)
          .outputOptions([
            `-vf scale=${profile.width}:${profile.height}`,
            `-c:v ${profile.videoCodec}`,
            `-b:v ${profile.videoBitrate}k`,
            `-c:a ${profile.audioCodec}`,
            `-b:a ${profile.audioBitrate}k`,
            '-hls_time 4',
            '-hls_playlist_type vod',
            `-hls_segment_filename ${input.outputDir}/${profile.id}-%03d.ts`,
          ]);
      }
      command.on('end', () => { /* generate master m3u8, upload to S3 */ resolve({ manifestUrl, variants }); });
      command.on('error', reject);
      command.run();
    });
  }
}
```

Wire through `@quant/queue` as `TranscodeJob` so heavy work runs in BullMQ workers.

**Step 3: Real FCM in `packages/notifications`**

```bash
pnpm --filter @quant/notifications add firebase-admin @parse/node-apn
```

Replace `packages/notifications/src/services/push-service.ts`:

```typescript
import admin from 'firebase-admin';
import apn from '@parse/node-apn';

export class PushService {
  private fcm: admin.messaging.Messaging;
  private apns: apn.Provider;

  constructor(opts: { fcmCredentials: admin.ServiceAccount; apnsKey: string; apnsKeyId: string; apnsTeamId: string; apnsBundleId: string }) {
    admin.initializeApp({ credential: admin.credential.cert(opts.fcmCredentials) });
    this.fcm = admin.messaging();
    this.apns = new apn.Provider({
      token: { key: opts.apnsKey, keyId: opts.apnsKeyId, teamId: opts.apnsTeamId },
      production: process.env.NODE_ENV === 'production',
    });
  }

  async sendPush(opts: { token: string; platform: 'ios'|'android'|'web'; title: string; body: string; data?: Record<string,string> }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (opts.platform === 'android' || opts.platform === 'web') {
      const response = await this.fcm.send({ token: opts.token, notification: { title: opts.title, body: opts.body }, data: opts.data });
      return { success: true, messageId: response };
    }
    if (opts.platform === 'ios') {
      const note = new apn.Notification({ alert: { title: opts.title, body: opts.body }, payload: opts.data, topic: this.apnsBundleId });
      const result = await this.apns.send(note, opts.token);
      return result.sent.length > 0 ? { success: true } : { success: false, error: result.failed[0]?.response?.reason };
    }
    throw new Error(`Unsupported platform: ${opts.platform}`);
  }
}
```

**Step 4: Replace social-graph in-memory `Map<>` with Prisma + Redis**

Delete the entire `packages/social-graph/src/core/graph-store.ts` Map-based implementation. Replace with:

```typescript
// packages/social-graph/src/services/social-graph.service.ts
export class SocialGraphService {
  constructor(private prisma: PrismaClient, private redis: Redis) {}

  async follow(followerId: string, followeeId: string): Promise<void> {
    await this.prisma.userRelationship.create({
      data: { followerId, followeeId, type: 'FOLLOW', createdAt: new Date() }
    });
    // Update Redis adjacency cache
    await this.redis.sadd(`following:${followerId}`, followeeId);
    await this.redis.sadd(`followers:${followeeId}`, followerId);
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> { /* ... */ }
  async getFollowers(userId: string, limit = 100, cursor?: string): Promise<User[]> { /* paginated */ }
  async getFollowing(userId: string, limit = 100, cursor?: string): Promise<User[]> { /* paginated */ }
  async getMutualFollowers(userIdA: string, userIdB: string): Promise<User[]> {
    // SINTER on Redis sets
    const mutualIds = await this.redis.sinter(`followers:${userIdA}`, `followers:${userIdB}`);
    return this.prisma.user.findMany({ where: { id: { in: mutualIds } } });
  }
  async suggestFriendsOfFriends(userId: string, limit = 10): Promise<User[]> { /* graph traversal */ }
  async block(blockerId: string, blockeeId: string): Promise<void> { /* ... */ }
  async mute(muterId: string, muteeId: string): Promise<void> { /* ... */ }
}
```

Add `UserRelationship` model fields if not already comprehensive:
```prisma
model UserRelationship {
  id         String   @id @default(cuid())
  followerId String
  followeeId String
  type       RelationshipType  // FOLLOW, BLOCK, MUTE, FRIEND
  createdAt  DateTime @default(now())

  @@unique([followerId, followeeId, type])
  @@index([followerId, type])
  @@index([followeeId, type])
}

enum RelationshipType {
  FOLLOW
  BLOCK
  MUTE
  FRIEND
  CLOSE_FRIEND
}
```

**Step 5: Real MeiliSearch client in `packages/search`**

```bash
pnpm --filter @quant/search add meilisearch
```

```typescript
// packages/search/src/client.ts
import { MeiliSearch } from 'meilisearch';

export class SearchClient {
  private client: MeiliSearch;
  constructor(host: string, apiKey: string) {
    this.client = new MeiliSearch({ host, apiKey });
  }

  async ensureIndex(name: string, schema: { primaryKey: string; searchable: string[]; filterable: string[]; sortable: string[] }): Promise<void> { /* ... */ }
  async indexDocument<T>(indexName: string, doc: T): Promise<void> { /* ... */ }
  async indexBatch<T>(indexName: string, docs: T[]): Promise<void> { /* ... */ }
  async search<T>(indexName: string, query: string, opts?: { filter?: string; sort?: string[]; limit?: number; offset?: number }): Promise<{ hits: T[]; total: number; processingTimeMs: number }> { /* ... */ }
  async deleteDocument(indexName: string, id: string): Promise<void> { /* ... */ }
}
```

Create indexes:
- `emails` (subject, body, from, to, attachments)
- `messages` (content, conversationId, senderId)
- `posts` (title, body, authorId, hashtags)
- `videos` (title, description, transcript)
- `users` (displayName, username, bio)
- `files` (filename, mimeType, content for indexable types)

**Step 6: Real SMTP server for QuantMail**

```bash
pnpm --filter @quant/quantmail-server add smtp-server mailparser nodemailer
```

Create `services/smtp-inbound/src/main.ts`:
```typescript
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const server = new SMTPServer({
  authOptional: true,
  onData(stream, session, callback) {
    simpleParser(stream, async (err, parsed) => {
      if (err) return callback(err);
      // Determine recipient → user mapping
      // Store via @quant/data-plane EmailRepository
      // Run AI triage
      // Trigger push notification
      callback();
    });
  },
});
server.listen(2525); // dev port; production uses MX records → port 25
```

For sending, use nodemailer in `apps/quantmail/backend/services/email-send.service.ts`:
- Dev: nodemailer to Mailhog (localhost:1025)
- Prod: AWS SES via `@aws-sdk/client-sesv2`

**Step 7: Replace QuantAds in-memory auction with Redis**

```typescript
// apps/quantads/backend/services/auction.service.ts
export class AuctionService {
  constructor(private redis: Redis) {}

  async submitBid(opts: { auctionId: string; campaignId: string; bid: number; qualityScore: number }): Promise<void> {
    // Effective score = bid × qualityScore (Vickrey-style with quality)
    const effectiveScore = opts.bid * opts.qualityScore;
    await this.redis.zadd(`auction:${opts.auctionId}:bids`, effectiveScore, opts.campaignId);
    await this.redis.expire(`auction:${opts.auctionId}:bids`, 60); // 1-min TTL
  }

  async resolveAuction(auctionId: string): Promise<{ winnerId: string; clearingPrice: number }> {
    const top2 = await this.redis.zrevrange(`auction:${auctionId}:bids`, 0, 1, 'WITHSCORES');
    // Second-price: winner pays #2's bid + €0.01
    return { winnerId: top2[0], clearingPrice: parseFloat(top2[3]) + 0.01 };
  }
}
```

**Step 8: Replace QuantMax matching with pgvector**

Add Prisma pgvector extension:
```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector]
}

model DatingProfile {
  // existing fields
  embedding  Unsupported("vector(384)")?  // sentence-transformers/all-MiniLM-L6-v2
}
```

```typescript
// apps/quantmax/backend/services/matching.service.ts
export class MatchingService {
  async generateEmbedding(profile: DatingProfile): Promise<number[]> {
    // Use @ai-sdk/openai embedding endpoint or local sentence-transformers via ONNX
  }

  async findMatches(userId: string, limit = 20): Promise<DatingProfile[]> {
    const user = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!user?.embedding) throw new Error('User has no embedding');

    return this.prisma.$queryRaw<DatingProfile[]>`
      SELECT *, 1 - (embedding <=> ${user.embedding}::vector) as similarity
      FROM "DatingProfile"
      WHERE "userId" != ${userId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${user.embedding}::vector
      LIMIT ${limit};
    `;
  }
}
```

**Step 9: Real CloudFront in `packages/media/src/services/cdn-service.ts`**

```bash
pnpm --filter @quant/media add @aws-sdk/client-cloudfront @aws-sdk/cloudfront-signer
```

```typescript
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

export class CDNService {
  presignedDownloadUrl(path: string, expiresInSec = 3600): string {
    return getSignedUrl({
      url: `https://${this.distributionDomain}/${path}`,
      keyPairId: this.keyPairId,
      privateKey: this.privateKey,
      dateLessThan: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    });
  }

  async invalidate(paths: string[]): Promise<void> {
    await this.client.send(new CreateInvalidationCommand({
      DistributionId: this.distributionId,
      InvalidationBatch: { CallerReference: Date.now().toString(), Paths: { Quantity: paths.length, Items: paths } },
    }));
  }
}
```

#### Acceptance Criteria

```bash
# Stripe test mode end-to-end
curl -X POST http://localhost:3001/payments/intent -d '{"amount":1000,"currency":"usd"}' # → returns clientSecret
# Webhook verification works (test with stripe CLI: stripe listen --forward-to localhost:3001/webhooks/stripe)

# FFmpeg
node -e "require('@quant/media').VideoTranscoder.transcode('test.mp4')" # → produces HLS m3u8

# FCM (will fail with test token but proves SDK works)
curl -X POST http://localhost:3001/notifications/push -d '{"token":"test","title":"hi"}' # → 200 with delivery error (not 500)

# Social graph migrated
grep -r "new Map" packages/social-graph/src/ # → 0 hits

# MeiliSearch
curl -X POST http://localhost:7700/indexes/emails/search -d '{"q":"meeting"}' # → returns hits

# SMTP receive
swaks --to test@quant.local --server localhost:2525 # → email stored in DB

# Auction
redis-cli ZADD auction:test:bids 50 campaign1 30 campaign2 # → ZRANGE returns campaign1 first

# pgvector
psql -c "SELECT embedding <=> embedding FROM \"DatingProfile\" LIMIT 1" # → returns numeric

# All typecheck/test/lint/build pass
pnpm turbo typecheck && pnpm turbo test && pnpm turbo lint && pnpm turbo build
```



---

### 🟢 PHASE 11 — Multi-Provider AI Router (15+ Providers)

**Branch:** `feat/phase-11-ai-router`
**Estimated time:** 3-4 hours

#### What to do

```bash
pnpm --filter @quant/ai add @ai-sdk/google @ai-sdk/deepseek @ai-sdk/groq @ai-sdk/mistral @ai-sdk/fireworks @ai-sdk/togetherai @ai-sdk/deepinfra @ai-sdk/cohere ollama-ai-provider
```

**Step 1: Refactor `packages/ai/src/core/model-router.ts`**

Add ALL provider initializations and complete model registry. The current file has only 4 OpenAI/Anthropic models — expand to 50+ models across providers.

```typescript
private registerDefaultModels(): void {
  const models: AIModelConfig[] = [
    // OpenAI
    { id: 'gpt-4o', provider: 'openai', maxContextLength: 128000, costPerInputToken: 0.000005, costPerOutputToken: 0.000015, latencyMs: 400, qualityScore: 0.95, capabilities: [...] },
    { id: 'gpt-4o-mini', provider: 'openai', maxContextLength: 128000, costPerInputToken: 0.00000015, costPerOutputToken: 0.0000006, latencyMs: 200, qualityScore: 0.85, capabilities: [...] },
    { id: 'o3-mini', provider: 'openai', maxContextLength: 200000, costPerInputToken: 0.0000011, costPerOutputToken: 0.0000044, latencyMs: 2000, qualityScore: 0.93, capabilities: ['reasoning'] },

    // Anthropic
    { id: 'claude-sonnet-4', provider: 'anthropic', maxContextLength: 200000, costPerInputToken: 0.000003, costPerOutputToken: 0.000015, latencyMs: 500, qualityScore: 0.97 },
    { id: 'claude-haiku-4', provider: 'anthropic', maxContextLength: 200000, costPerInputToken: 0.0000008, costPerOutputToken: 0.000004, latencyMs: 250, qualityScore: 0.88 },

    // Google
    { id: 'gemini-2.5-pro', provider: 'google', maxContextLength: 2000000, costPerInputToken: 0.00000125, costPerOutputToken: 0.000005, latencyMs: 600, qualityScore: 0.94 },
    { id: 'gemini-2.5-flash', provider: 'google', maxContextLength: 1000000, costPerInputToken: 0.000000075, costPerOutputToken: 0.0000003, latencyMs: 200, qualityScore: 0.86 },

    // DeepSeek (cheapest reasoning)
    { id: 'deepseek-v3', provider: 'deepseek', maxContextLength: 64000, costPerInputToken: 0.00000027, costPerOutputToken: 0.0000011, latencyMs: 800, qualityScore: 0.91 },
    { id: 'deepseek-r1', provider: 'deepseek', maxContextLength: 64000, costPerInputToken: 0.00000055, costPerOutputToken: 0.0000022, latencyMs: 3000, qualityScore: 0.93, capabilities: ['reasoning'] },
    { id: 'deepseek-coder-v3', provider: 'deepseek', costPerInputToken: 0.00000027, costPerOutputToken: 0.0000011, latencyMs: 600, qualityScore: 0.94, capabilities: ['code'] },

    // Groq (fastest)
    { id: 'llama-3.3-70b-versatile', provider: 'groq', costPerInputToken: 0.00000059, costPerOutputToken: 0.00000079, latencyMs: 80, qualityScore: 0.86 }, // 500+ tok/s
    { id: 'llama-3.1-8b-instant', provider: 'groq', costPerInputToken: 0.00000005, costPerOutputToken: 0.00000008, latencyMs: 50, qualityScore: 0.78 },
    { id: 'whisper-large-v3', provider: 'groq', costPerSecondAudio: 0.00009, capabilities: ['stt'] },

    // Mistral
    { id: 'mistral-large-2', provider: 'mistral', costPerInputToken: 0.000002, costPerOutputToken: 0.000006, latencyMs: 500, qualityScore: 0.90 },
    { id: 'codestral-2', provider: 'mistral', costPerInputToken: 0.0000003, costPerOutputToken: 0.0000009, latencyMs: 400, qualityScore: 0.92, capabilities: ['code'] },

    // Cohere
    { id: 'rerank-v3', provider: 'cohere', costPerSearch: 0.002, capabilities: ['rerank'] },
    { id: 'embed-multilingual-v3', provider: 'cohere', costPerInputToken: 0.0000001, capabilities: ['embedding'] },

    // DeepInfra (cheapest open-source serving)
    { id: 'bge-large-en-v1.5', provider: 'deepinfra', costPerInputToken: 0.00000001, capabilities: ['embedding'] },
    { id: 'qwen-2.5-72b', provider: 'deepinfra', costPerInputToken: 0.00000035, costPerOutputToken: 0.0000004, latencyMs: 700, qualityScore: 0.89 },

    // Perplexity (web search)
    { id: 'sonar-pro', provider: 'perplexity', costPerInputToken: 0.000003, costPerOutputToken: 0.000015, latencyMs: 2500, qualityScore: 0.92, capabilities: ['web_search'] },
  ];
  for (const m of models) this.registerModel(m);
}
```

**Step 2: Smart Routing Table**

```typescript
// packages/ai/src/core/routing-table.ts
export const ROUTING_TABLE: Record<TaskType, RoutingDecision> = {
  autocomplete:        { primary: 'llama-3.1-8b-instant',     fallbacks: ['gpt-4o-mini', 'claude-haiku-4'] },
  code_generation:     { primary: 'deepseek-coder-v3',         fallbacks: ['claude-sonnet-4', 'gpt-4o'] },
  complex_reasoning:   { primary: 'claude-sonnet-4',           fallbacks: ['gpt-4o', 'deepseek-r1'] },
  cheap_reasoning:     { primary: 'deepseek-r1',               fallbacks: ['o3-mini', 'gemini-2.5-flash'] },
  summarization:       { primary: 'gemini-2.5-flash',          fallbacks: ['gpt-4o-mini', 'claude-haiku-4'] },
  translation:         { primary: 'deepseek-v3',               fallbacks: ['gemini-2.5-flash', 'gpt-4o-mini'] },
  voice_stt:           { primary: 'whisper-large-v3',          fallbacks: ['whisper-1'] },
  voice_tts:           { primary: 'tts-1-hd',                  fallbacks: [] },
  image_generation:    { primary: 'dall-e-3',                  fallbacks: [] },
  embedding_bulk:      { primary: 'bge-large-en-v1.5',         fallbacks: ['embed-multilingual-v3'] },
  embedding_quality:   { primary: 'embed-multilingual-v3',     fallbacks: ['text-embedding-3-large'] },
  reranking:           { primary: 'rerank-v3',                 fallbacks: [] },
  moderation:          { primary: 'omni-moderation-latest',    fallbacks: [] },
  web_search:          { primary: 'sonar-pro',                 fallbacks: [] },
  vision_screenshot:   { primary: 'gpt-4o',                    fallbacks: ['claude-sonnet-4'] },
  long_context:        { primary: 'gemini-2.5-pro',            fallbacks: ['claude-sonnet-4'] },
};
```

**Step 3: Provider Health Monitoring**

```typescript
// packages/ai/src/core/provider-health.ts
export class ProviderHealthMonitor {
  private windowMs = 5 * 60 * 1000; // 5min sliding window
  private metrics: Map<string, { latencies: number[]; errors: number; successes: number }> = new Map();

  recordSuccess(provider: string, latencyMs: number): void { /* ... */ }
  recordError(provider: string, error: Error): void { /* ... */ }
  isHealthy(provider: string): boolean {
    const m = this.metrics.get(provider);
    if (!m) return true;
    const errorRate = m.errors / (m.errors + m.successes);
    return errorRate < 0.05; // <5% error rate
  }
  getP95Latency(provider: string): number { /* ... */ }
}
```

When a provider's `errorRate >= 5%`, circuit-break it for 60s. When circuit-broken, router automatically falls back to the next provider in the chain.

**Step 4: Cost-Aware Routing**

```typescript
selectModel(req: AIInferenceRequest): AIModelConfig {
  const taskType = this.inferTaskType(req);
  const routing = ROUTING_TABLE[taskType];
  const userTier = req.userTier ?? 'free';

  // Free tier: use cheapest model
  // Paid tier: use primary
  // Enterprise: use best quality

  let candidates = [routing.primary, ...routing.fallbacks];
  if (userTier === 'free') candidates = candidates.sort(byPriceAsc);
  else if (userTier === 'enterprise') candidates = candidates.sort(byQualityDesc);

  for (const modelId of candidates) {
    const model = this.models.get(modelId);
    if (!model) continue;
    if (!this.health.isHealthy(model.provider)) continue;
    return model;
  }
  throw new Error('No healthy provider available');
}
```

#### Acceptance Criteria

- All 15 providers initialize without errors when API keys are present
- Router selects `llama-3.1-8b-instant` for `autocomplete` task
- Router selects `deepseek-coder-v3` for `code_generation` task
- Router selects `claude-sonnet-4` for `complex_reasoning` task
- Circuit breaker test: simulate 10 consecutive errors → provider marked unhealthy → router falls back
- A/B test: 10% of summarization traffic routed to alternative provider for quality measurement
- Cost tracker logs accurate `tokens × pricePerToken` per model
- `pnpm turbo typecheck && pnpm turbo test` pass



---

### 🟢 PHASE 12 — QuantMail Gmail Killer (AI Email Features)

**Branch:** `feat/phase-12-gmail-killer`
**Estimated time:** 5-7 hours

#### What to do

**Step 1: AI Email Services in `apps/quantmail/backend/services/`**

Create these files (each is a real production-ready service):

```
ai-triage.service.ts          # Classifies into act-now/delegate/read-later/ignore
ai-reply.service.ts           # Drafts reply in user's writing style
ai-summarize.service.ts       # 47-email thread → 3-sentence summary
ai-compose.service.ts         # Bullets → professional email
ai-unsubscribe.service.ts     # Detects newsletters never opened, batch unsubscribe
ai-followup.service.ts        # "I'll send X by Friday" → reminder Thursday
ai-meeting-extract.service.ts # Detects meeting requests → creates calendar event
ai-tone-shift.service.ts      # Rewrite tone (formal/casual/diplomatic/urgent)
ai-attachment-summary.service.ts # PDF/DOCX preview without opening
ai-contact-context.service.ts # Hover sender → all interaction history
smart-send-time.service.ts    # Optimal send time per recipient
ai-style-learner.service.ts   # Learn user's writing style from sent items
```

**Service implementation pattern:**

```typescript
// apps/quantmail/backend/services/ai-triage.service.ts
import { z } from 'zod';
import type { Email, PrismaClient } from '@prisma/client';
import { AIEngine } from '@quant/ai';

const TriageResultSchema = z.object({
  category: z.enum(['act_now', 'delegate', 'read_later', 'ignore']),
  reason: z.string(),
  urgency: z.number().min(0).max(1),
  suggestedAction: z.string().optional(),
});
type TriageResult = z.infer<typeof TriageResultSchema>;

export class AITriageService {
  constructor(private prisma: PrismaClient, private ai: AIEngine) {}

  async triage(email: Email, userId: string): Promise<TriageResult> {
    const userContext = await this.getUserContext(userId);
    const prompt = this.buildPrompt(email, userContext);

    const response = await this.ai.infer({
      userId,
      app: 'quantmail',
      feature: 'ai_triage',
      task: 'classification',  // routes to llama-3.1-8b-instant (fast+cheap)
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
      maxTokens: 200,
      responseFormat: 'json',
    });

    const result = TriageResultSchema.parse(JSON.parse(response.content));

    // Store triage in DB
    await this.prisma.emailTriage.create({
      data: { emailId: email.id, userId, ...result, modelUsed: response.model, costUsd: response.usage.estimatedCost },
    });

    return result;
  }

  // Triage all unread emails on schedule (via @quant/queue cron)
  async triageBatch(userId: string): Promise<{ triaged: number; cost: number }> { /* ... */ }
}
```

**Step 2: Email Infrastructure Services**

```
email-aliases.service.ts            # user+anything@quant.email → user@quant.email
disposable-email.service.ts         # random@quant.email, expires 24h
tracking-pixel-stripper.service.ts  # Strip all tracking pixels from incoming HTML
pgp-encryption.service.ts           # Built-in PGP via openpgp package
undo-send.service.ts                # 30s undo window via @quant/queue delayed job
custom-domain.service.ts            # User brings their own domain, DKIM/SPF/DMARC auto-config
imap-server.service.ts              # imapflow-based IMAP for third-party clients
```

**Step 3: UI Pages in `apps/quantmail/app/`**

```
app/inbox/page.tsx                  # AI-triaged inbox with priority sections
app/compose/page.tsx                # AI composer with tone/style/send-time
app/thread/[id]/page.tsx            # Thread view with AI summary header
app/contacts/page.tsx               # Contact list with AI relationship insights
app/settings/ai/page.tsx            # Configure AI features (auto-reply confidence, etc.)
app/settings/aliases/page.tsx       # Manage aliases + disposable
app/settings/domains/page.tsx       # Add custom domains
app/admin/triage/page.tsx           # See triage decisions, retrain
```

**Inbox UI (production-grade):**

```tsx
// apps/quantmail/app/inbox/page.tsx
'use client';
export default function InboxPage() {
  const { data: emails } = useEmails(); // groups by triage category
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Section title="🚨 Act Now" emails={emails.act_now} />
        <Section title="📋 Delegate" emails={emails.delegate} />
        <Section title="📖 Read Later" emails={emails.read_later} />
        <Section title="🗄 FYI" emails={emails.ignore} collapsed />
      </main>
      <RightPanel>
        <AIInsights /> {/* "You have 3 follow-ups due tomorrow" */}
        <AgentPanel /> {/* Email Pilot status */}
      </RightPanel>
    </div>
  );
}
```

**Step 4: Routes in `apps/quantmail/backend/routes/ai.ts`**

```typescript
fastify.post('/ai/triage', { schema: { body: TriageRequestSchema } }, async (req) => triageService.triage(req.body.emailId, req.user.id));
fastify.post('/ai/reply', async (req) => replyService.draft(req.body.emailId, req.user.id, req.body.intent));
fastify.post('/ai/summarize/:threadId', async (req) => summarizeService.summarize(req.params.threadId, req.user.id));
fastify.post('/ai/compose', async (req) => composeService.fromBullets(req.body.bullets, req.body.tone, req.user.id));
fastify.post('/ai/unsubscribe-batch', async (req) => unsubscribeService.batchUnsubscribe(req.user.id));
fastify.get('/ai/followups', async (req) => followupService.getDue(req.user.id));
// ... etc
```

#### Acceptance Criteria

- AI triage classifies 10 hand-labeled test emails with >80% accuracy
- AI reply generates contextually appropriate response in <3s
- Thread summarization on 20-email test thread produces coherent 3-sentence summary
- Bullet-to-email: input 3 bullets → output is grammatically correct, tonally appropriate
- Tracking pixel stripper removes pixels from Mailchimp, Hubspot, GMass test fixtures
- PGP: encrypt with public key → decrypt with private key → original recovered
- Undo send: send → cancel within 30s → email NOT delivered (verify Mailhog empty)
- Inbox UI loads in <500ms with 100 test emails
- AgentPanel shows live AI Email Pilot status
- All TypeScript strict, all routes have Zod schemas, all errors are typed



---

### 🟢 PHASE 13 — QuantMail GitHub Killer (Real Git Hosting + AI DevTools)

**Branch:** `feat/phase-13-github-killer`
**Estimated time:** 6-8 hours

#### What to do

**Step 1: Real Git Hosting Backend**

Create `services/git-server/`:

```
services/git-server/
├── Dockerfile
├── package.json   # depends on simple-git, isomorphic-git, fastify, dockerode
└── src/
    ├── main.ts                 # Fastify server
    ├── routes/
    │   ├── git-http.ts         # /:owner/:repo.git/info/refs, /git-upload-pack, /git-receive-pack
    │   ├── ssh.ts              # SSH protocol via node-ssh-server (optional)
    │   └── api.ts              # REST API for repo CRUD
    ├── services/
    │   ├── repo-storage.ts     # Bare repos on disk; path = /var/git/<owner>/<repo>.git
    │   ├── git-receive-pack.ts # Validates + executes git-receive-pack via child_process
    │   ├── git-upload-pack.ts  # Read-only clone/fetch
    │   ├── hooks.ts            # pre-receive: branch protection check; post-receive: trigger CI
    │   └── auth.ts             # HTTP Basic with personal access tokens
    └── utils/
        └── pack-protocol.ts    # Smart HTTP pack protocol helpers
```

Key implementation:
```typescript
// services/git-server/src/services/git-receive-pack.ts
import { spawn } from 'child_process';

export async function gitReceivePack(repoPath: string, request: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
  // 1. Run pre-receive hook (validate refs against branch protection rules)
  // 2. Spawn git-receive-pack
  const proc = spawn('git', ['receive-pack', '--stateless-rpc', repoPath]);
  request.pipe(proc.stdin);
  // 3. After successful receive, run post-receive hook (trigger CI via @quant/queue)
  proc.on('close', async (code) => {
    if (code === 0) await triggerCI(repoPath, getPushedRefs());
  });
  return proc.stdout;
}
```

**Step 2: Prisma models for Git**

```prisma
model Repository {
  id            String   @id @default(cuid())
  ownerId       String
  name          String
  description   String?
  visibility    RepoVisibility @default(PRIVATE)
  defaultBranch String   @default("main")
  isTemplate    Boolean  @default(false)
  license       String?
  topics        String[]
  storagePathUrl String  // s3://quant-git/owner/repo.git or /var/git/owner/repo.git
  createdAt     DateTime @default(now())

  owner         User     @relation(fields: [ownerId], references: [id])
  branches      Branch[]
  pullRequests  PullRequest[]
  issues        Issue[]
  collaborators RepoCollaborator[]
  webhooks      Webhook[]
  protections   BranchProtection[]
  ciRuns        CIRun[]

  @@unique([ownerId, name])
  @@index([visibility])
}

model Branch {
  id           String   @id @default(cuid())
  repoId       String
  name         String
  commitSha    String
  isProtected  Boolean  @default(false)
  createdAt    DateTime @default(now())
  repo         Repository @relation(fields: [repoId], references: [id])
  @@unique([repoId, name])
}

model PullRequest {
  id            String   @id @default(cuid())
  repoId        String
  number        Int
  title         String
  body          String?
  authorId      String
  status        PRStatus @default(OPEN)
  sourceBranch  String
  targetBranch  String
  sourceSha     String
  targetSha     String
  mergedAt      DateTime?
  mergedBy      String?
  mergeStrategy MergeStrategy?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  reviews       Review[]
  comments      ReviewComment[]
  checks        CIRun[]

  @@unique([repoId, number])
  @@index([repoId, status])
}

model Review {
  id        String   @id @default(cuid())
  prId      String
  reviewerId String
  status    ReviewStatus
  body      String?
  createdAt DateTime @default(now())
  pullRequest PullRequest @relation(fields: [prId], references: [id])
}

model ReviewComment {
  id        String   @id @default(cuid())
  prId      String
  authorId  String
  filePath  String?
  line      Int?
  body      String
  createdAt DateTime @default(now())
  pullRequest PullRequest @relation(fields: [prId], references: [id])
}

model Issue {
  id        String   @id @default(cuid())
  repoId    String
  number    Int
  title     String
  body      String?
  authorId  String
  status    IssueStatus @default(OPEN)
  labels    String[]
  assignees String[]
  milestone String?
  createdAt DateTime @default(now())

  @@unique([repoId, number])
}

model BranchProtection {
  id                    String   @id @default(cuid())
  repoId                String
  branchPattern         String   // glob: main, release/*
  requiredApprovals     Int      @default(1)
  requireUpToDate       Boolean  @default(true)
  requireStatusChecks   String[] // CI job names
  enforceForAdmins      Boolean  @default(false)
  repo                  Repository @relation(fields: [repoId], references: [id])
}

model CIRun {
  id          String   @id @default(cuid())
  repoId      String
  prId        String?
  branch      String
  commitSha   String
  status      CIStatus @default(PENDING)
  startedAt   DateTime?
  finishedAt  DateTime?
  jobs        CIJob[]
  triggeredBy String

  @@index([repoId, status])
}

model CIJob {
  id        String   @id @default(cuid())
  runId     String
  name      String
  status    CIStatus @default(PENDING)
  logs      String?
  artifacts Json?
  startedAt DateTime?
  finishedAt DateTime?
  run       CIRun @relation(fields: [runId], references: [id])
}

enum RepoVisibility { PUBLIC PRIVATE INTERNAL }
enum PRStatus { OPEN MERGED CLOSED DRAFT }
enum ReviewStatus { APPROVED CHANGES_REQUESTED COMMENTED }
enum IssueStatus { OPEN CLOSED }
enum MergeStrategy { MERGE SQUASH REBASE }
enum CIStatus { PENDING RUNNING SUCCESS FAILED CANCELLED }
```

**Step 3: PR + Issue + Review services in `apps/quantmail/backend/services/`**

```typescript
pr.service.ts                # createPR, listPRs, mergePR (squash/rebase/merge), close
review.service.ts            # submitReview, addComment, requestChanges
issue.service.ts             # createIssue, list, label, assign, close, reopen
branch-protection.service.ts # CRUD for protection rules, enforce on push
```

**Step 4: CI Runner Service**

```
services/ci-runner/
├── Dockerfile  # has docker-in-docker
└── src/
    ├── main.ts            # Worker that pulls jobs from @quant/queue
    ├── parser.ts          # Parses .quant-ci.yml
    ├── executor.ts        # docker run per job, isolated container per step
    ├── log-streamer.ts    # Streams stdout/stderr to DB + WebSocket
    └── artifact-uploader.ts # Uploads build artifacts to @quant/storage
```

`.quant-ci.yml` schema (example):
```yaml
on: [push, pull_request]
jobs:
  test:
    image: node:22
    steps:
      - run: pnpm install
      - run: pnpm test
  build:
    image: node:22
    needs: [test]
    steps:
      - run: pnpm build
    artifacts:
      paths: [dist/]
  deploy:
    image: hashicorp/terraform:latest
    needs: [build]
    if: branch == 'main'
    steps:
      - run: terraform apply -auto-approve
```

**Step 5: AI DevTools Services**

```
ai-code-review.service.ts     # On PR create → review diff with Claude Sonnet
ai-commit-message.service.ts  # From staged diff → conventional commit message
ai-pr-description.service.ts  # From all commits → structured PR description
ai-ci-fix.service.ts          # On CI failure → reads logs → suggests fix → optional auto-PR
ai-code-search.service.ts     # Semantic code search via embeddings
ai-code-complete.service.ts   # Streaming completion via Groq Codestral
ai-docs-gen.service.ts        # From code → JSDoc/TSDoc/README
ai-dependency-update.service.ts # Weekly: check outdated, AI evaluates breaking changes, opens PR
ai-security-scan.service.ts   # Scans diff for secrets, SQL injection, XSS
```

Example - AI Code Review service:

```typescript
export class AICodeReviewService {
  async reviewPR(prId: string): Promise<void> {
    const pr = await this.prService.get(prId);
    const diff = await this.gitService.getDiff(pr.targetSha, pr.sourceSha);

    // Split diff into chunks if too large
    const chunks = splitDiffByFile(diff, MAX_TOKENS_PER_CHUNK);
    const reviews: ReviewComment[] = [];

    for (const chunk of chunks) {
      const response = await this.ai.infer({
        userId: 'system',
        task: 'code_review',  // routes to claude-sonnet-4
        systemPrompt: CODE_REVIEW_SYSTEM_PROMPT,
        prompt: `Review this diff for ${pr.repoId}/${pr.title}:\n\n${chunk}`,
        responseFormat: 'json',
      });

      const parsed = CodeReviewResponseSchema.parse(JSON.parse(response.content));
      for (const comment of parsed.comments) {
        reviews.push({
          prId, authorId: 'quantai-bot', filePath: comment.file, line: comment.line,
          body: comment.message, severity: comment.severity,
        });
      }
    }

    await this.reviewService.submitBotReview(prId, reviews);
  }
}
```

**Step 6: UI pages in `apps/quantmail/app/`**

```
app/repos/page.tsx                                    # Repository list, create, import
app/repos/[owner]/[repo]/page.tsx                     # Repo overview, README, stats
app/repos/[owner]/[repo]/tree/[...path]/page.tsx      # File tree, folder view
app/repos/[owner]/[repo]/blob/[...path]/page.tsx      # File view (Monaco)
app/repos/[owner]/[repo]/edit/[...path]/page.tsx      # File edit (Monaco + AI completion)
app/repos/[owner]/[repo]/commits/page.tsx             # Commit history with diff preview
app/repos/[owner]/[repo]/pulls/page.tsx               # PR list (kanban + table)
app/repos/[owner]/[repo]/pulls/[id]/page.tsx          # PR detail: diff, reviews, checks, merge
app/repos/[owner]/[repo]/issues/page.tsx              # Issue list
app/repos/[owner]/[repo]/issues/[id]/page.tsx         # Issue detail
app/repos/[owner]/[repo]/pipelines/page.tsx           # CI runs
app/repos/[owner]/[repo]/pipelines/[id]/page.tsx      # Run detail with live logs
app/repos/[owner]/[repo]/settings/branches/page.tsx   # Branch protection
app/repos/[owner]/[repo]/settings/webhooks/page.tsx   # Webhooks
app/repos/[owner]/[repo]/import/page.tsx              # Import from GitHub (one-click)
```

**Killer integration:** Because QuantMail owns email, every git push notification arrives as a real email — searchable, threaded, AI-summarized. Every PR comment is a thread. Every CI failure is an email with AI-generated fix suggestion.

#### Acceptance Criteria

- `git clone https://quant.local/user/repo.git` succeeds (with valid token)
- `git push` triggers CI pipeline execution; pipeline runs in isolated Docker container
- PR creation enforces branch protection (test: try to merge without approval → blocked)
- AI code review on test PR generates 3+ meaningful comments
- AI commit message from `git diff --cached` produces valid conventional commit
- Monaco editor shows AI autocomplete suggestions while typing
- CI runner executes 3-step pipeline (install → test → build) successfully
- GitHub import: import a small public repo → all branches, commits, issues, PRs preserved
- All TS/lint/test/build pass



---

### 🟢 PHASE 14 — Universal Search (Hybrid BM25 + Vector, Cross-App)

**Branch:** `feat/phase-14-universal-search`
**Estimated time:** 3-4 hours

#### What to do

**Step 1: Add Qdrant to docker-compose**

```yaml
  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333", "6334:6334"]
    volumes: [qdrant_data:/qdrant/storage]
```

**Step 2: Refactor `packages/search`**

```
packages/search/src/
├── client.ts                  # MeiliSearch wrapper (BM25)
├── vector-client.ts           # Qdrant wrapper (vector)
├── hybrid-search.ts           # Fusion: 0.7×BM25 + 0.3×cosine, normalized
├── indexer.ts                 # Consumes Redpanda CDC events, indexes to both stores
├── permission-filter.ts       # Per-user/per-app permission filter
├── query-parser.ts            # Natural language → structured (uses llama-3.1-8b)
├── reranker.ts                # Cohere rerank-v3 for top-50 → top-10
├── facets.ts                  # Per-app facet aggregation
└── __tests__/
    ├── hybrid-search.test.ts
    ├── permission-filter.test.ts
    └── query-parser.test.ts
```

**Step 3: Indexer Service**

```
services/search-indexer/
├── Dockerfile
└── src/
    ├── main.ts                # Kafka consumer for outbox events
    ├── handlers/
    │   ├── email.handler.ts   # On email.created → embed body → index in MeiliSearch + Qdrant
    │   ├── message.handler.ts
    │   ├── post.handler.ts
    │   ├── video.handler.ts   # Wait for transcript → index
    │   ├── photo.handler.ts   # Use vision API for description → index
    │   ├── file.handler.ts    # Extract text (pdf/docx) → index
    │   └── user.handler.ts
    └── embedder.ts            # Batches embeddings, calls @quant/ai
```

**Step 4: Search API Route**

```typescript
// apps/quantai/backend/routes/search.ts
fastify.post('/search', { schema: { body: SearchRequestSchema } }, async (req, reply) => {
  const { query, scope = 'all', limit = 20 } = req.body;
  const userId = req.user.id;

  // Parse natural language → structured query
  const parsed = await queryParser.parse(query); // "emails from John last month" → { type: 'email', filters: { from: 'John', dateRange: '2026-04' } }

  // Hybrid search across requested scopes
  const indexes = scope === 'all' ? ['emails','messages','posts','videos','photos','files'] : [scope];
  const candidates = await Promise.all(indexes.map(idx => hybridSearch.search(idx, parsed, { userId, limit: 50 })));

  // Rerank with Cohere
  const merged = candidates.flat();
  const reranked = await reranker.rerank(query, merged, limit);

  // Apply permission filter (defense in depth)
  const filtered = await permissionFilter.filter(reranked, userId);

  reply.send({ results: filtered, total: filtered.length });
});
```

**Step 5: PROACTIVE SEARCH (the killer feature)**

```typescript
// packages/search/src/proactive.ts
export class ProactiveSearchService {
  // Called when user opens any context (email, doc, calendar event)
  async surfaceRelevant(context: { type: string; id: string; userId: string }): Promise<RelevantItem[]> {
    if (context.type === 'email') {
      const email = await this.emailRepo.findById(context.id);
      // Surface: related docs from QuantDrive, related code from QuantMail Git, calendar events about same topic
      return this.searchRelated(email.subject + ' ' + email.body, context.userId);
    }
    // ... other context types
  }
}
```

UI: when reading email about a meeting, sidebar shows "📎 Related: 3 docs, 1 calendar event, 2 chat threads".

#### Acceptance Criteria

- Indexer consumes Redpanda CDC events → documents in MeiliSearch + Qdrant within 2s
- Hybrid search returns combined ranked results
- Natural language query "emails from John last month" → parsed correctly → relevant emails returned
- Permission filter test: user A cannot see user B's private emails (verify by query)
- Reranking improves relevance on labeled test set (NDCG@10)
- Proactive search: opening an email → returns 3+ related items
- p95 search latency <150ms on 100k indexed docs (load test)

---

### 🟢 PHASE 15 — ML Recommendations (Two-Tower + On-Device + Anti-Rage)

**Branch:** `feat/phase-15-ml-recommendations`
**Estimated time:** 4-6 hours

#### What to do

**Step 1: Create `@quant/ml-runtime`**

```bash
pnpm add onnxruntime-node onnxruntime-web @mlc-ai/web-llm
```

```
packages/ml-runtime/src/
├── index.ts
├── onnx-server.ts        # Server-side ONNX inference
├── onnx-browser.ts       # Browser-side via WebGPU
├── webllm-runtime.ts     # WebLLM for Phi-3/Gemma in browser
├── model-loader.ts       # Download + cache models
└── __tests__/
```

**Step 2: Feature Store**

```
packages/ml-pipeline/src/feature-store/
├── online-store.ts       # Redis: user features, item features, recent interactions (10ms reads)
├── offline-store.ts      # S3 Parquet: full history for training
├── feature-definitions.ts # Typed feature schemas
└── pipeline.ts           # Materialize features from raw events
```

**Step 3: Recommendation Models**

```
packages/recommendations/src/
├── retrieval/
│   ├── two-tower.ts            # User tower + Item tower → ANN retrieval via Qdrant
│   ├── collaborative.ts        # Item-item similarity
│   └── trending.ts             # Time-decayed popularity
├── ranking/
│   ├── mmoe.ts                 # Multi-task: engagement + retention + wellbeing
│   └── score-fusion.ts         # Weighted ensemble
├── diversify/
│   └── dpp.ts                  # Determinantal Point Process for diversity
├── pipeline.ts                 # Full pipeline: candidates → ranking → diversification
└── on-device-ranker.ts         # ONNX model that runs in browser
```

**Step 4: Training Scripts (Python)**

```
scripts/ml/
├── train_two_tower.py    # PyTorch → ONNX export
├── train_mmoe.py
├── train_text_moderator.py
├── export_to_onnx.py
├── requirements.txt
└── README.md
```

These scripts can run in CI for nightly model updates.

**Step 5: Anti-Rage Ranking**

```typescript
// packages/recommendations/src/ranking/anti-rage.ts
export class AntiRageScorer {
  // Penalize content with high outrage signals
  computeOutragePenalty(item: ContentItem): number {
    let penalty = 0;
    penalty += this.outrageWordDensity(item.text);          // 0-0.3
    penalty += this.inflammatoryQuoteRetweetRatio(item);     // 0-0.3
    penalty += this.allCapsRatio(item.text);                 // 0-0.1
    penalty += this.exclamationDensity(item.text);           // 0-0.1
    penalty += this.angryReplyRatio(item);                   // 0-0.2
    return Math.min(penalty, 0.6); // max 60% score reduction
  }

  // Boost high-quality replies
  computeReplyQualityBoost(item: ContentItem): number {
    return item.replyCount > 0 && item.avgReplyLength > 100 ? 0.15 : 0;
  }
}
```

**Step 6: On-Device Ranking (privacy moat)**

```typescript
// packages/recommendations/src/on-device-ranker.ts
export class OnDeviceRanker {
  private session: ort.InferenceSession;

  async loadModel(): Promise<void> {
    this.session = await ort.InferenceSession.create('/models/feed-ranker-v1.onnx', {
      executionProviders: ['webgpu', 'wasm'],
    });
  }

  // Server sends 200 candidates. Browser ranks top 20 locally.
  async rankLocally(candidates: ContentItem[], userPrefs: UserPrefs): Promise<ContentItem[]> {
    const features = this.extractFeatures(candidates, userPrefs);
    const scores = await this.session.run({ input: features });
    return candidates.map((c, i) => ({ ...c, score: scores.output.data[i] })).sort(byScoreDesc).slice(0, 20);
  }
}
```

**Step 7: A/B Testing Framework**

```typescript
// packages/ml-pipeline/src/experiments.ts
export class ExperimentService {
  async assignBucket(userId: string, experimentId: string): Promise<string> {
    // Deterministic hash: sha256(userId + experimentId) → bucket
  }
  async logExposure(userId: string, experimentId: string, bucket: string, context: any): Promise<void> { }
  async computeResult(experimentId: string): Promise<{ pValue: number; lift: number; significant: boolean }> { }
}
```

#### Acceptance Criteria

- Two-tower model trains on synthetic data → exports valid ONNX
- ONNX model loads and infers in Node + browser (WebGPU)
- ML inference service returns 200 candidates in <50ms p95
- On-device ranker in browser <80ms p95 on Pixel-class device
- Anti-rage: rage-bait test content ranks LOWER despite higher click-through rate
- A/B framework: deterministic bucket assignment, p-value calculation correct on test data

---

### 🟢 PHASE 16 — Trust & Safety (Real ML Moderation)

**Branch:** `feat/phase-16-trust-safety`
**Estimated time:** 4-5 hours

#### What to do

**Step 1: DELETE all placeholder regex moderation**

Search and remove:
```bash
grep -rl "profanity_severe_1\|hate_group_placeholder" packages/moderation/ | xargs rm
```

**Step 2: Real moderation via cloud API + on-device**

```
packages/moderation/src/
├── text-classifier.ts        # OpenAI omni-moderation API (free, multimodal)
├── image-classifier.ts       # OpenAI Vision moderation
├── perceptual-hash.ts        # pHash for image dedup, SimHash for text
├── csam-matcher.ts           # NCMEC PhotoDNA-compatible (plug-in point)
├── policy-engine.ts          # Rule + ML hybrid; per-app policies
├── appeal-workflow.ts        # Every action → AppealRecord; human review queue
├── transparency-report.ts    # Auto monthly stats
└── __tests__/
```

**Step 3: Abuse Graph + Reputation**

```
packages/security/src/
├── abuse-graph.ts            # Build graph of reports; Louvain community detection for sybils
├── reputation.ts             # Trust score per user (account age, reports ratio, verification)
├── anti-spam.ts              # Bayesian + features for QuantMail
├── rate-limiter.ts           # Per-user, per-IP, per-action rate limits
├── captcha-challenger.ts     # Trigger captcha when reputation low + suspicious activity
└── __tests__/
```

**Step 4: Moderation Worker Service**

```
services/moderation-worker/src/
├── main.ts                   # Consumes ModerationJob from @quant/queue
├── handlers/
│   ├── text-handler.ts       # Calls text-classifier, applies policy, takes action
│   ├── image-handler.ts
│   ├── video-handler.ts      # Sample frames, classify each
│   └── audio-handler.ts      # Transcribe → text classify
└── action-executor.ts        # Hide/remove/warn/ban based on severity
```

**Step 5: Appeal UI in admin**

```
apps/quantai/app/admin/moderation/page.tsx       # Queue of appeals
apps/quantai/app/admin/moderation/[id]/page.tsx  # Single case review with full context
```

#### Acceptance Criteria

- omni-moderation API integration works: hate speech test → flagged
- Image moderation: NSFW test image → flagged
- pHash detects re-uploaded image at 95% accuracy
- Abuse graph detects synthetic 20-account sybil cluster in test
- Reputation system: spammer score decreases over time as reports accumulate
- Anti-spam: 95% precision on labeled email test set
- Every moderation action creates AuditLog (Phase 9 integration)
- Appeal workflow: user appeals → moderator UI shows context → decision recorded



---

### 🟢 PHASE 17 — E2E Encryption (Signal Protocol + MLS + ZK Email)

**Branch:** `feat/phase-17-e2e-encryption`
**Estimated time:** 5-7 hours

#### What to do

```bash
pnpm --filter @quant/auth add @signalapp/libsignal-client openpgp
```

**Step 1: Identity & Key Management**

```
packages/auth/src/e2e/
├── identity-key.ts           # Long-term identity keypair per user (Ed25519)
├── prekey-bundle.ts          # Server-stored prekeys for offline message initiation
├── device-keys.ts            # Per-device keys + linking
├── safety-numbers.ts         # Verifiable fingerprint between two users
├── signal-session.ts         # Double Ratchet 1:1 sessions
├── mls-group.ts              # MLS for groups (up to 1000 members)
├── sealed-sender.ts          # Hide sender identity from server
├── encrypted-backup.ts       # Argon2id-derived backup key
├── device-linking.ts         # QR code + secure channel
└── __tests__/
```

**Step 2: QuantChat E2E Integration**

```typescript
// apps/quantchat/backend/services/message.service.ts
async sendMessage(input: SendMessageRequest): Promise<Message> {
  if (input.conversation.encryption === 'e2e') {
    // Encrypt per-recipient using their session
    const encrypted = await this.signalSession.encrypt(input.body, input.recipientId);
    return this.messageRepo.create({ ...input, body: encrypted, encrypted: true });
  }
  // ... fallback to non-E2E for legacy contacts
}
```

**Step 3: ZK Email for QuantMail**

```
packages/auth/src/e2e/zk-email/
├── keypair.ts          # OpenPGP keypair generation, stored client-side
├── encrypted-storage.ts # Server stores ciphertext only
├── client-search.ts    # Encrypted searchable index (client-side decryption + filter)
└── key-discovery.ts    # WKD lookup for recipient public keys
```

**Step 4: Encrypted Backup**

```typescript
// User passphrase → Argon2id → backup key
// Backup contains: identity keys, conversation history, contacts
// Stored encrypted on server; server cannot read
```

**Step 5: UI Components**

```tsx
// apps/quantchat/src/components/E2EBadge.tsx
// Shows lock icon + "End-to-End Encrypted" or "Verify Safety Number"

// apps/quantchat/src/components/SafetyNumber.tsx
// QR code + 60-digit number for in-person verification

// apps/quantmail/src/components/ZKMailboxOnboarding.tsx
// Walks user through enabling ZK encrypted mailbox
```

#### Acceptance Criteria

- Alice → Bob → Alice 1:1 message round-trip via full Signal handshake passes
- MLS group of 10 members: add member, remove member, post-compromise security verified
- Server cannot decrypt any E2E payload (penetration test in CI)
- Encrypted backup: encrypt → upload → restore on new device with passphrase only → original recovered
- Safety number verification works: out-of-band fingerprint matches between two devices

---

### 🟢 PHASE 18 — AI Agent Swarm + Autonomous Device Control

**Branch:** `feat/phase-18-agent-swarm`
**Estimated time:** 8-10 hours (largest phase)

This is the killer feature. User says "do X" and a swarm of AI agents executes across all 19 apps + their device.

#### What to do

**Step 1: Create `@quant/agent-runtime` package**

```
packages/agent-runtime/
├── package.json
└── src/
    ├── index.ts
    ├── orchestrator.ts        # Supervisor agent that decomposes and dispatches
    ├── worker-agent.ts        # Base class for worker agents
    ├── task-decomposer.ts     # Uses Claude to break "prepare for interview" into 8 sub-tasks
    ├── state-machine.ts       # Per-agent: idle → planning → executing → waiting_approval → done/failed
    ├── conflict-resolver.ts   # Two agents modifying same resource
    ├── approval-queue.ts      # High-risk actions await user tap-to-approve
    ├── audit-trail.ts         # Every action logged with reversibility flag
    ├── undo-engine.ts         # Reversible actions can be undone within 5 min
    ├── trust-score.ts         # Agents earn trust over time (30-day graduation to FULL_AUTO)
    ├── kill-switch.ts         # Voice 'STOP ALL' or button → halt all in <500ms
    ├── spending-limit.ts      # Daily/weekly/monthly caps
    ├── permissions.ts         # 5-level model: OBSERVE / SUGGEST / ACT_LOW / ACT_HIGH / FULL_AUTO
    ├── sandbox.ts             # New agents run in sandbox (logged but not executed)
    └── __tests__/
```

**Step 2: 3-Tier Device Control in `@quant/agent-runtime`**

```
packages/agent-runtime/src/device/
├── tier1-api.ts          # Direct calls to Quant internal APIs (instant, perfect)
├── tier2-os.ts           # Native OS via platform bridges (fast, perfect)
├── tier3-vision.ts       # Screenshot → GPT-4o vision → click coords (slow, for external apps)
├── screen-capture.ts     # Diff-based capture (only changed regions sent to vision)
├── action-executor.ts    # Tap, swipe, type, scroll dispatcher
└── app-launcher.ts       # Open apps by name/package via deep link or OS launcher
```

**Tier 1 (Quant API direct):**
```typescript
async sendEmail(opts: { to: string; subject: string; body: string }): Promise<void> {
  // Direct call to QuantMail API — no UI interaction
  await this.quantMailClient.send(opts);
}
```

**Tier 2 (OS native):**
```typescript
// Mobile (Android via AccessibilityService bridge)
async setDoNotDisturb(enabled: boolean): Promise<void> {
  await this.accessibilityBridge.performAction('SET_DND', { enabled });
}

// Mobile (iOS via Shortcuts + App Intents)
async setBrightness(level: number): Promise<void> {
  await this.shortcutsBridge.run('SetBrightness', { level });
}

// Desktop (macOS via AppleScript)
async openApp(name: string): Promise<void> {
  await execa('osascript', ['-e', `tell application "${name}" to activate`]);
}

// Desktop (Windows via UI Automation)
// Desktop (Linux via xdotool)
```

**Tier 3 (vision-based):**
```typescript
async controlExternalApp(opts: { intent: string; appName: string }): Promise<void> {
  await this.appLauncher.open(opts.appName);
  let done = false;
  let stepCount = 0;

  while (!done && stepCount < 50) {
    const screenshot = await this.screenCapture.capture();
    const compressed = await this.diffWithPrevious(screenshot);

    const response = await this.ai.infer({
      task: 'vision_screenshot',
      prompt: `Goal: ${opts.intent}. Current screen: [image]. Return next action.`,
      image: compressed,
      responseFormat: 'json',
    });

    const action = ActionSchema.parse(JSON.parse(response.content));
    // action = { type: 'tap', x: 234, y: 567 } | { type: 'type', text: '...' } | { type: 'done' }

    if (action.type === 'done') { done = true; break; }
    await this.actionExecutor.execute(action);
    stepCount++;
  }
}
```

**Step 3: 12 Pre-Built Pilot Agents**

Each in `packages/agent-runtime/src/agents/`:

```typescript
// email-pilot.ts
export class EmailPilot extends WorkerAgent {
  name = 'Email Pilot';
  icon = '📧';
  defaultPermission = 'ACT_LOW';

  async run(input: { userId: string; mode: 'triage' | 'reply_routine' | 'unsubscribe_junk' }): Promise<AgentResult> {
    switch (input.mode) {
      case 'triage':
        const emails = await this.tier1.quantMail.getUnreadEmails(input.userId);
        for (const email of emails) {
          const triage = await this.tier1.quantMail.aiTriage(email.id);
          this.reportProgress(`Triaged: ${triage.category}`);
          if (triage.category === 'ignore') {
            await this.tier1.quantMail.archive(email.id); // ACT_LOW: reversible
          }
        }
        return { success: true, summary: `Triaged ${emails.length} emails` };

      case 'reply_routine':
        // Find emails with confidence >0.9 → auto-draft → request approval if ACT_HIGH
        // ...
    }
  }
}
```

All 12 agents:

| Agent | Tier | Permission Default |
|-------|------|-------------------|
| EmailPilot | 1 | ACT_LOW |
| CodePilot | 1 | ACT_LOW |
| SchedulePilot | 1 | ACT_LOW |
| ShoppingPilot | 3 | ACT_HIGH (needs approval per purchase) |
| FinancePilot | 1+3 | OBSERVE → upgradeable |
| SocialPilot | 1 | SUGGEST → ACT_LOW |
| ContentPilot | 1 | ACT_LOW |
| TravelPilot | 3 | ACT_HIGH |
| ResearchPilot | 1 (web) | ACT_LOW |
| HealthPilot | 1+2 | OBSERVE |
| MeetingPilot | 1 | ACT_LOW |
| LearningPilot | 1+3 | ACT_LOW |

**Step 4: Agent Dock UI**

```
packages/shared-ui/src/agent/
├── AgentDock.tsx            # Bottom sheet (mobile) / side panel (desktop)
├── AgentCard.tsx            # Per-agent: icon, name, status, progress %, current action, pause/stop
├── ApprovalDialog.tsx       # Modal popup when agent needs permission
├── AgentTimeline.tsx        # Full-day audit timeline with undo per action
├── AgentCreator.tsx         # Natural language → custom agent config
├── AgentMarketplace.tsx     # Browse/install community agents
├── VoiceCommand.tsx         # Always-on voice 'Hey Quant'
├── AgentMiniWidget.tsx      # Floating draggable widget showing agent count
└── styles.css
```

**AgentDock implementation (mobile):**
```tsx
// Floating drag-handle at bottom edge of every Quant app
// Swipe up → expands to full bottom sheet
// Shows live progress for each running agent
// Tap agent → expand to full detail view
// Tap [+] → AgentCreator
// Long-press [⏹ Stop All] → emergency kill switch

export function AgentDock() {
  const { agents, runningCount } = useAgents();
  const [expanded, setExpanded] = useState(false);

  return (
    <BottomSheet open={expanded} onClose={() => setExpanded(false)}>
      <Handle onSwipeUp={() => setExpanded(true)}>
        <span>🤖 {runningCount} agents running</span>
      </Handle>
      <ScrollArea>
        {agents.map(a => <AgentCard key={a.id} agent={a} />)}
      </ScrollArea>
      <Footer>
        <Button onClick={createAgent}>+ New Agent</Button>
        <Button onClick={showHistory}>📊 History</Button>
        <Button onClick={emergencyStop} variant="danger">⏹ Stop All</Button>
      </Footer>
    </BottomSheet>
  );
}
```

**Step 5: Mobile Native Bridges**

```
apps-mobile/quantai/src/services/
├── accessibility-bridge.ts   # Android AccessibilityService wrapper
├── shortcuts-bridge.ts       # iOS Shortcuts + App Intents
├── overlay-service.ts        # Floating dock overlay (Android: SYSTEM_ALERT_WINDOW; iOS: PiP)
├── background-runner.ts      # Continue agent execution when app backgrounded
└── voice-trigger.ts          # 'Hey Quant' wake-word detection
```

**Step 6: Desktop Native Bridges**

```
apps-desktop/quantai/src/services/
├── applescript-bridge.ts     # macOS automation
├── uiautomation-bridge.ts    # Windows UI Automation
├── xdotool-bridge.ts         # Linux X11 automation
├── tray-agent.ts             # System tray with mini agent status
└── hotkey-listener.ts        # Global hotkey for 'STOP ALL' (Ctrl+Shift+Q)
```

**Step 7: Agent Marketplace (community-built agents)**

```
packages/agent-runtime/src/marketplace/
├── agent-spec.ts             # Schema for shareable agent definitions
├── publisher.ts              # Publish your agent to marketplace
├── installer.ts              # Install community agent (runs in sandbox first)
└── reviewer.ts               # Community ratings + AI safety review
```

#### Acceptance Criteria

- EmailPilot processes 10 test emails in <30s: archives spam, drafts replies, flags urgent
- Multi-agent test: "Prepare for interview tomorrow at 2pm" spawns 5+ parallel agents, all complete within 3 min
- Tier 3 vision control: successfully completes a test e-commerce purchase via screenshot pipeline (e.g. on a local test web app)
- AgentDock UI renders on mobile Expo app with live progress bars updating
- AgentDock UI renders on desktop with system tray integration
- Kill switch halts all agents within 500ms (verified by test)
- Audit trail shows full agent history; undo any action within 5 min
- Permission test: agent cannot send email without ACT_HIGH approval
- Spending limit test: agent stops attempting purchases when daily ₹500 cap reached
- Trust score: new agent starts at SUGGEST, after 30 days of correct actions can graduate to ACT_LOW
- Sandbox: new community agent runs in sandbox (actions logged but not executed) until reviewed



---

### 🟢 PHASE 19 — Creator Economy (90/10 Split + Wallet + Subscriptions + Tips)

**Branch:** `feat/phase-19-creator-economy`
**Estimated time:** 4-5 hours

#### What to do

**Step 1: Real Stripe Connect (express accounts for creators)**

```typescript
// packages/payments/src/services/stripe-connect.service.ts
export class StripeConnectService {
  async createCreatorAccount(userId: string, country: string): Promise<{ accountId: string; onboardingUrl: string }> { /* ... */ }
  async getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> { /* ... */ }
  async transferToCreator(opts: { accountId: string; amount: number; currency: string; metadata: object }): Promise<Stripe.Transfer> { /* ... */ }
  async createPayout(accountId: string, amount: number): Promise<Stripe.Payout> { /* ... */ }
}
```

**Step 2: Revenue Share Engine**

```typescript
// packages/payments/src/services/revshare.service.ts
export class RevShareService {
  async distributeAdRevenue(opts: { adImpression: AdImpression; revenue: number }): Promise<RevenueShare[]> {
    // 90% creator, 10% platform
    const creatorAmount = opts.revenue * 0.90;
    const platformAmount = opts.revenue * 0.10;

    // Create ledger entries (immutable)
    const creatorEntry = await this.prisma.revenueShare.create({ data: { type: 'AD_REVENUE', recipientId: opts.adImpression.creatorId, amount: creatorAmount, sourceId: opts.adImpression.id } });
    const platformEntry = await this.prisma.revenueShare.create({ data: { type: 'PLATFORM_FEE', recipientId: 'platform', amount: platformAmount, sourceId: opts.adImpression.id } });

    // Credit creator wallet
    await this.walletService.credit(opts.adImpression.creatorId, creatorAmount, opts.adImpression.id);

    return [creatorEntry, platformEntry];
  }

  async distributeTip(opts: { from: string; to: string; amount: number }): Promise<RevenueShare[]> {
    // 95% creator, 5% platform on tips
  }
}
```

**Step 3: Wallet + Subscriptions + Tips**

```
packages/payments/src/services/
├── wallet.service.ts          # Custodial wallet per user/creator
├── subscription.service.ts    # Per-creator subscription tiers
├── tip.service.ts             # One-tap tip with preset amounts
├── tax-forms.service.ts       # Auto-generate 1099 (US), W-8BEN (non-US)
├── cashout.service.ts         # Bank transfer / instant debit / crypto
└── ledger.service.ts          # Immutable transaction ledger
```

**Step 4: Prisma models**

```prisma
model Wallet {
  id        String   @id @default(cuid())
  userId    String   @unique
  balance   Decimal  @db.Decimal(15, 4)
  currency  String   @default("USD")
  stripeConnectId String?
  user      User     @relation(fields: [userId], references: [id])
}

model WalletTransaction {
  id          String   @id @default(cuid())
  walletId    String
  type        TransactionType  // CREDIT, DEBIT, PAYOUT, REFUND
  amount      Decimal  @db.Decimal(15, 4)
  balanceAfter Decimal @db.Decimal(15, 4)
  sourceType  String   // AD_REVENUE, TIP, SUBSCRIPTION, PAYOUT
  sourceId    String
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([walletId, createdAt])
}

model Subscription {
  id              String   @id @default(cuid())
  subscriberId    String
  creatorId       String
  tierId          String
  amount          Decimal  @db.Decimal(15,4)
  currency        String
  status          SubscriptionStatus
  stripeSubId     String   @unique
  currentPeriodEnd DateTime
  cancelAtPeriodEnd Boolean @default(false)

  @@index([subscriberId, status])
  @@index([creatorId, status])
}

model Tip {
  id          String   @id @default(cuid())
  fromUserId  String
  toUserId    String
  amount      Decimal  @db.Decimal(15,4)
  currency    String
  contextType String?  // POST, VIDEO, etc
  contextId   String?
  message     String?
  createdAt   DateTime @default(now())

  @@index([toUserId, createdAt])
}

model AdImpression {
  id           String   @id @default(cuid())
  campaignId   String
  creativeId   String
  publisherId  String   // Creator who owns the ad surface
  viewerId     String?
  revenue      Decimal  @db.Decimal(15,6)
  currency     String
  createdAt    DateTime @default(now())

  @@index([publisherId, createdAt])
}

model RevenueShare {
  id          String   @id @default(cuid())
  type        RevShareType
  recipientId String
  amount      Decimal  @db.Decimal(15,4)
  currency    String
  sourceType  String
  sourceId    String
  createdAt   DateTime @default(now())

  @@index([recipientId, createdAt])
}

model Payout {
  id            String   @id @default(cuid())
  walletId      String
  amount        Decimal  @db.Decimal(15,4)
  currency      String
  destination   String   // BANK, CRYPTO_WALLET, INSTANT_DEBIT
  destinationDetails Json
  stripePayoutId String?
  status        PayoutStatus
  initiatedAt   DateTime @default(now())
  completedAt   DateTime?
}

enum TransactionType { CREDIT DEBIT PAYOUT REFUND HOLD RELEASE }
enum SubscriptionStatus { ACTIVE PAST_DUE CANCELLED }
enum RevShareType { AD_REVENUE TIP SUBSCRIPTION SALE PLATFORM_FEE }
enum PayoutStatus { PENDING IN_TRANSIT PAID FAILED }
```

**Step 5: Creator Tools (AI-powered)**

```
apps/quantube/backend/services/creator-tools/
├── ai-thumbnail.service.ts     # Generate 5 thumbnail options from video keyframes (DALL-E 3)
├── ai-title-ab.service.ts      # Generate 10 titles, A/B test, pick winner
├── ai-clip-maker.service.ts    # Auto-cut best 15s/30s/60s clips (scene detection + audio)
├── ai-caption.service.ts       # Whisper transcription + 50-language translation
├── ai-trend-alert.service.ts   # Notify when trending topic matches creator niche
├── ai-post-timing.service.ts   # Optimal posting time per audience
├── ai-engagement-reply.service.ts # Draft replies to top comments
└── ai-sponsorship-match.service.ts # Match creator to brand campaigns
```

**Step 6: Creator Dashboard UI**

```
apps/quantube/app/creator/
├── dashboard/page.tsx       # Earnings, views, subscribers chart
├── earnings/page.tsx        # Detailed ledger: every impression, every tip, every sub
├── content/page.tsx         # All videos with performance
├── audience/page.tsx        # Demographics, retention curves, top fans
├── sponsorships/page.tsx    # Brand deal opportunities (AI-matched)
├── payouts/page.tsx         # Cashout, tax forms, payment methods
└── settings/page.tsx        # Subscription tiers, channel customization
```

#### Acceptance Criteria

- $100 ad spend test: $90 → creator wallet, $10 → platform (verified in ledger)
- End-to-end Stripe Connect test mode: creator onboards → earns → requests payout → receives
- Tax form generator produces valid 1099 PDF for synthetic creator
- Subscription creates Stripe subscription, recurring billing works
- Tip flow: $5 tip → 95% to creator wallet, 5% platform fee, ledger entries correct
- AI thumbnail: video → 5 options in <60s
- AI title A/B: 10 options generated, system picks based on test metric
- All TS/lint/test/build pass

---

### 🟢 PHASE 20 — Federation (ActivityPub + Matrix)

**Branch:** `feat/phase-20-federation`
**Estimated time:** 5-6 hours

```
packages/federation/src/
├── activitypub/
│   ├── server.ts             # Mounts /users/:username/{inbox,outbox,followers,following}
│   ├── actor.ts              # Actor object with publicKey
│   ├── inbox.ts              # Receive Follow/Like/Create/Announce/Delete activities
│   ├── outbox.ts             # Publish activities (with HTTP signatures)
│   ├── http-signatures.ts    # Sign + verify (per RFC 9421)
│   ├── webfinger.ts          # /.well-known/webfinger
│   ├── nodeinfo.ts           # /.well-known/nodeinfo
│   └── delivery-queue.ts     # Outbound delivery via @quant/queue with retry
├── matrix/
│   ├── bridge-bot.ts         # Quant DM ↔ Matrix room
│   ├── homeserver-config.ts  # Synapse config for our domain
│   └── room-mapper.ts        # 1:1 conv ↔ Matrix DM, group ↔ Matrix room
├── moderation.ts             # Instance blocklist, allowlist
├── search-federated.ts       # Federated search (opt-in, public posts only)
└── __tests__/
```

#### Acceptance Criteria

- Mastodon test instance can follow Quant user, see posts, like, reply
- WebFinger endpoint passes Mastodon's compatibility validator
- HTTP signatures verify correctly on inbound activities
- Matrix bridge: Quant DM delivered to Matrix room → reply routes back to QuantChat
- Federation moderation: blocked instance's activities are rejected

---

### 🟢 PHASE 21 — Offline-First CRDT Sync Engine

**Branch:** `feat/phase-21-sync-engine`
**Estimated time:** 4-5 hours

```bash
pnpm add yjs y-websocket y-indexeddb @automerge/automerge
```

```
packages/sync-engine/src/
├── index.ts
├── crdt-document.ts          # Yjs Doc wrapper for QuantDocs
├── crdt-list.ts              # Yjs Array for ordered lists
├── automerge-state.ts        # Automerge for structured state
├── sync-protocol.ts          # WebSocket primary + HTTP fallback
├── conflict-resolution.ts    # CRDT merge (automatic for these structures)
├── local-store.ts            # IndexedDB persistence
├── service-worker.ts         # Background sync registration
├── sync-status.ts            # Status indicator: synced / syncing / offline / conflict
└── __tests__/
```

#### Acceptance Criteria

- Create post offline → reconnect → post appears within 3s
- Two devices edit same Yjs doc → merge without conflict
- 100 offline actions replay correctly after reconnect
- Service worker registered, intercepts API requests when offline → queues



---

### 🟢 PHASE 22 — QuantMeet (Zoom/Google Meet Killer)

**Branch:** `feat/phase-22-quantmeet`
**Estimated time:** 6-8 hours

```bash
pnpm add mediasoup mediasoup-client
```

**Create `apps/quantmeet/` (full new app)**

```
apps/quantmeet/
├── backend/
│   ├── app.ts                       # Fastify + WebSocket
│   ├── services/
│   │   ├── room.service.ts          # Create/join/leave rooms
│   │   ├── sfu.service.ts           # Mediasoup SFU
│   │   ├── recording.service.ts     # Record to QuantDrive
│   │   ├── transcript.service.ts    # Live transcription via Groq Whisper streaming
│   │   ├── summary.service.ts       # Post-meeting summary via Claude
│   │   ├── action-items.service.ts  # Extract todos
│   │   └── breakout.service.ts      # Breakout rooms
│   ├── routes/
│   │   ├── rooms.ts
│   │   ├── recordings.ts
│   │   └── ws.ts                    # SFU signaling WebSocket
│   └── __tests__/
├── src/
│   ├── components/
│   │   ├── VideoTile.tsx
│   │   ├── ParticipantGrid.tsx
│   │   ├── ScreenShare.tsx
│   │   ├── ControlBar.tsx           # Mute/unmute, camera, share, raise hand, end
│   │   ├── ChatPanel.tsx            # In-meeting chat
│   │   ├── PollPanel.tsx
│   │   ├── WhiteboardPanel.tsx      # Tldraw integration
│   │   ├── TranscriptPanel.tsx      # Live captions
│   │   ├── BreakoutManager.tsx
│   │   ├── BackgroundBlur.tsx       # ONNX segmentation model
│   │   ├── AISummaryCard.tsx        # Post-meeting summary display
│   │   └── ReactionEmoji.tsx
│   ├── pages/
│   │   ├── index.tsx                # Dashboard: upcoming, past meetings
│   │   ├── new.tsx                  # Schedule/start meeting
│   │   ├── room/[id].tsx            # Live meeting room
│   │   └── recordings/[id].tsx      # Recording playback with chapters
│   └── hooks/
│       ├── useMediaSoup.ts
│       ├── useTranscript.ts
│       └── useBackgroundBlur.ts
├── package.json
└── tsconfig.json
```

#### AI Features

- **Live transcript** via Groq Whisper streaming, 50+ languages
- **Background blur/replace** via ONNX segmentation (on-device, no server upload)
- **AI summary**: post-meeting Claude generates 1-paragraph summary + key decisions
- **Action items extraction**: identifies todos, assigns to attendees, creates QuantDocs/QuantMail follow-ups
- **Smart mute**: AccessibilityService detects background noise → auto-mute prompt
- **Filler removal**: post-recording, removes "um", "uh" from final
- **AI meeting prep**: before joining, sidebar shows: agenda, related docs, last meeting notes, attendee context cards
- **AI follow-up email**: drafts and sends summary email after call ends
- **Speaker identification**: separate speakers in transcript even without video

#### Acceptance Criteria

- 3-person video call establishes in <2s
- Screen share works across Chrome/Firefox/Safari
- Live transcript appears with <500ms delay, accurate enough to follow
- AI summary generated within 30s of call end
- Recording stored in QuantDrive (E2E encrypted)
- Background blur runs at 30fps on Pixel-class device

---

### 🟢 PHASE 23 — QuantDocs (Google Docs Killer)

**Branch:** `feat/phase-23-quantdocs`
**Estimated time:** 6-8 hours

**Create `apps/quantdocs/`**

```
apps/quantdocs/
├── backend/
│   ├── services/
│   │   ├── doc.service.ts            # CRUD, version history
│   │   ├── yjs-server.ts             # Yjs WebSocket server
│   │   ├── presence.service.ts       # Live cursors
│   │   ├── comment.service.ts        # Comments + suggestions
│   │   ├── ai-write.service.ts       # AI writing assistant
│   │   ├── ai-grammar.service.ts     # Real-time grammar (better than Grammarly)
│   │   ├── ai-cite.service.ts        # Find sources for claims
│   │   ├── ai-translate.service.ts   # Translate preserving formatting
│   │   ├── ai-diagram.service.ts     # Text → Mermaid/draw.io
│   │   ├── export.service.ts         # PDF/DOCX/Markdown/HTML/LaTeX
│   │   └── template.service.ts
│   └── routes/
│       ├── docs.ts
│       ├── ws.ts
│       └── ai.ts
├── src/
│   ├── components/
│   │   ├── Editor.tsx                # Tiptap or ProseMirror with Yjs binding
│   │   ├── Toolbar.tsx               # Formatting controls
│   │   ├── Outline.tsx               # Heading-based outline
│   │   ├── CommentSidebar.tsx
│   │   ├── PresenceLayer.tsx         # Live cursors of others
│   │   ├── AIPanel.tsx               # AI write/expand/simplify/translate
│   │   ├── HistoryPanel.tsx          # Version history with diff
│   │   ├── ExportMenu.tsx
│   │   └── TemplateGallery.tsx
│   └── pages/
│       ├── index.tsx                 # Document list
│       ├── new.tsx                   # New doc / from template
│       ├── doc/[id].tsx              # Document editor
│       └── templates/page.tsx
└── package.json
```

#### Killer AI Features

- **AI_WRITE_FROM_OUTLINE**: bullet points → full document
- **AI_EXPAND_SECTION**: select paragraph → AI adds detail
- **AI_SIMPLIFY**: rewrite for 5th grader / executive / technical
- **AI_TRANSLATE_DOC**: translate full doc preserving formatting (using DeepSeek)
- **AI_GRAMMAR_REALTIME**: better than Grammarly, fixes as you type via Groq streaming
- **AI_CITATION_FINDER**: claims → AI finds sources via Perplexity, adds footnotes
- **AI_TABLE_FROM_TEXT**: "revenue was 100 in Q1, 150 in Q2..." → auto-generates table
- **AI_DIAGRAM_FROM_TEXT**: describe a flow → generates Mermaid/draw.io diagram
- **AI_VERSION_DIFF**: shows what changed between versions in natural language

#### Acceptance Criteria

- Two users type simultaneously → both see changes in <200ms
- Export to PDF preserves formatting (tables, images, code blocks)
- AI rewrite replaces selected text with chosen tone
- AI table generation parses sample text and produces valid table
- AI translate preserves headings, lists, formatting
- Comments thread per anchored text, resolvable
- Yjs sync works offline (Phase 21 integration)

---

### 🟢 PHASE 24 — QuantDrive (Google Drive Killer with E2E)

**Branch:** `feat/phase-24-quantdrive`
**Estimated time:** 5-6 hours

**Create `apps/quantdrive/`**

Storage tiers:
- 15 GB free
- 100 GB / $1.99/mo
- 2 TB / $9.99/mo

```
apps/quantdrive/
├── backend/
│   ├── services/
│   │   ├── file.service.ts            # CRUD with encryption
│   │   ├── folder.service.ts
│   │   ├── share.service.ts           # Share folder = key exchange
│   │   ├── version.service.ts         # 30-day version history
│   │   ├── trash.service.ts           # 30-day soft delete
│   │   ├── ai-organize.service.ts     # Auto-sort uploads into folders
│   │   ├── ai-duplicate.service.ts    # pHash-based duplicate finder
│   │   ├── ai-search-content.service.ts # OCR + transcript + content search
│   │   ├── ai-summarize-file.service.ts # File preview without opening
│   │   ├── ai-extract-data.service.ts # Receipt/invoice → structured
│   │   ├── webdav-server.ts           # WebDAV for OS mounting
│   │   └── photo-backup.service.ts    # Auto-backup from QuantNeon
│   └── routes/
├── src/
│   ├── components/
│   │   ├── FileGrid.tsx
│   │   ├── FileList.tsx
│   │   ├── Breadcrumbs.tsx
│   │   ├── UploadZone.tsx             # Drag-drop with E2E encrypt before upload
│   │   ├── FilePreview.tsx
│   │   ├── ShareDialog.tsx
│   │   ├── AIOrganizePrompt.tsx
│   │   └── StorageBar.tsx
│   └── pages/
│       ├── index.tsx
│       ├── folder/[id].tsx
│       ├── shared/page.tsx
│       ├── trash/page.tsx
│       └── photos/page.tsx
```

#### Acceptance Criteria

- Upload → download → checksum identical (E2E encrypted both ways)
- Shared folder: both users can read after key exchange
- Storage quota enforced (test: try to exceed → error)
- AI auto-organize: 20 test files → sorted into appropriate folders
- AI duplicate finder: 95% accuracy on test set
- WebDAV: mount as network drive on macOS Finder, browse files

---

### 🟢 PHASE 25 — QuantCalendar (Standalone with AI Scheduling)

**Branch:** `feat/phase-25-quantcalendar`
**Estimated time:** 4-5 hours

**Create `apps/quantcalendar/`** (currently only a controller in QuantMail — make it standalone)

```
apps/quantcalendar/
├── backend/
│   ├── services/
│   │   ├── event.service.ts
│   │   ├── recurring.service.ts        # RRULE handling
│   │   ├── caldav-server.ts            # CalDAV server for Apple Calendar/Thunderbird sync
│   │   ├── ai-schedule.service.ts      # "Find time with John and Sarah" → suggests options
│   │   ├── ai-buffer.service.ts        # Auto-add 15min buffer between meetings
│   │   ├── ai-travel-time.service.ts   # Add travel time using QuantMaps
│   │   ├── ai-cancel-detector.service.ts # Reads email "I can't make it" → asks to reschedule
│   │   ├── ai-prep-time.service.ts     # 10min prep block before important meetings
│   │   ├── ai-weekly-digest.service.ts # Monday morning week summary
│   │   ├── ai-reschedule.service.ts    # "Move my Thursday meetings to Friday"
│   │   ├── ai-focus-blocks.service.ts  # Auto-reserve deep work blocks
│   │   ├── ai-double-book-alert.service.ts
│   │   ├── ai-timezone-magic.service.ts
│   │   └── booking-link.service.ts     # Calendly-like booking pages
│   └── routes/
├── src/
│   ├── components/
│   │   ├── CalendarView.tsx            # Day/week/month/agenda views
│   │   ├── EventCard.tsx
│   │   ├── EventForm.tsx
│   │   ├── AIScheduleAssistant.tsx     # Natural language scheduling
│   │   ├── AvailabilityFinder.tsx      # See team availability
│   │   ├── BookingLinkSettings.tsx
│   │   └── WeeklyDigestCard.tsx
│   └── pages/
│       ├── index.tsx
│       ├── event/[id].tsx
│       ├── new.tsx
│       ├── booking/[link].tsx          # Public booking page
│       └── settings/page.tsx
```

#### Acceptance Criteria

- "Find a time with John and Sarah next week" → AI checks all 3 calendars → returns 3 options
- Buffer time: book 2 back-to-back meetings → 15min buffer auto-added
- Travel time: in-person meetings have travel time blocked from QuantMaps
- Booking link: share URL → booker sees only available slots → confirm books in both calendars
- CalDAV sync: Apple Calendar can connect and sync bidirectionally
- Recurring events with complex RRULE work correctly

---

### 🟢 PHASES 26-32 — Continue Building

For brevity, the following phases follow the same detailed pattern. Each phase is one branch + PR with full deliverables, files to create, and acceptance criteria.

**PHASE 26 — One-Click Cross-App Publishing** (`feat/phase-26-cross-post`)
- Capture surface in QuantNeon
- AI auto-cut: long → short via scene detection + face tracking
- Vertical/horizontal reframe
- Auto title/description per platform
- PublishIntent fans out to 4+ apps
- Scheduling + unified analytics

**PHASE 27 — Algorithmic Choice + Anti-Rage Ranking** (`feat/phase-27-ranking-choice`)
- User picks ranking mode (chrono/AI/community/custom plugin)
- Anti-rage ranker (built in Phase 15) integrated into all feeds
- Plugin system: WASM sandbox for community-built rankers
- A/B test default vs community vs custom

**PHASE 28 — Observability (OTel everywhere + SLOs + Chaos + Runbooks)** (`feat/phase-28-observability`)
- @quant/observability instrument() decorator
- 100% public methods emit OTel spans
- Fastify + Prisma OTel auto-tracing
- SLO definitions in `infra/slo/<service>.yaml`
- Sloth-style burn-rate alerts
- Litmus chaos experiments per service
- Runbook per service in `docs/runbooks/`
- Synthetic monitoring scripts
- PagerDuty integration

**PHASE 29 — Quality Gates (80% coverage + mutation + e2e + load + security)** (`feat/phase-29-quality-gates`)
- Vitest coverage 80% on critical paths (gate in CI)
- Stryker mutation 60% on auth/payments/security
- Playwright e2e: 30 user journeys
- k6 load tests: chat fanout, feed ranking, search
- OWASP ZAP scans
- Snyk + npm audit
- `.github/workflows/quality-gates.yml`

**PHASE 30 — Native Mobile Apps (Expo)** (`feat/phase-30-mobile-native`)
- `apps-mobile/quantchat/`, `apps-mobile/quantmax/`, `apps-mobile/quantneon/`, `apps-mobile/quantmail/`, `apps-mobile/quantai/`
- Reuse `@quant/*` packages for business logic
- Push notifications (FCM + APNs)
- Biometric auth + secure enclave for E2E keys
- AccessibilityService bridge for Phase 18 device control
- Background sync (Phase 21 sync engine)
- EAS Build pipeline
- AppStore/PlayStore submission ready

**PHASE 31 — Desktop Apps (Tauri)** (`feat/phase-31-desktop-native`)
- `apps-desktop/quantmail/`, `apps-desktop/quantchat/`, `apps-desktop/quantdocs/`, `apps-desktop/quantai/`
- Native notifications, system tray, auto-update
- Keyboard shortcuts (Gmail-level for mail, Slack-level for chat)
- File system integration with QuantDrive
- Hotkey listener for "STOP ALL" agents
- macOS notarization, Windows code signing

**PHASE 32 — Multi-Region + DR + Compliance** (`feat/phase-32-launch-prep`)
- Terraform multi-region: us-east-1 + eu-west-1 EKS
- Cloudflare for global CDN + DDoS
- DB cross-region read replicas + automated failover
- Automated snapshots, 30-day PITR
- Region failover runbook
- GDPR data export (full archive in <5min)
- GDPR data deletion (hard delete <72h)
- COPPA age gate
- CCPA opt-out
- DMA portability docs
- DSA risk assessment
- DPIA template



---

### 🟢 PHASES 33-37 — New Apps (Music, Pay, Maps, News, Health)

**PHASE 33 — QuantMusic** (Spotify killer with 90/10 split) (`feat/phase-33-quantmusic`)
- `apps/quantmusic/`
- Music upload for indie artists, 90/10 revenue split
- HLS streaming with adaptive bitrate
- Library: playlists, liked songs, albums, AI radio
- AI DJ: personalized radio based on mood/activity/time (ONNX on-device)
- Lyrics with karaoke mode for QuantMax
- Podcasts with chapters + transcripts
- Offline playback (Phase 21 CRDT)
- Integrate with QuantEdits (licensed track usage)

**PHASE 34 — QuantPay** (P2P + Merchant QR) (`feat/phase-34-quantpay`)
- `apps/quantpay/`
- P2P transfers (instant)
- Bill splitting via OCR receipt
- Merchant QR generate/scan
- Payment requests via QuantChat/QuantMail
- Multi-currency with real-time FX
- Savings goals + round-ups
- KYC/AML integration
- NFC tap-to-pay (mobile)

**PHASE 35 — QuantMaps** (Privacy-first navigation) (`feat/phase-35-quantmaps`)
- `apps/quantmaps/`
- OpenStreetMap + MapLibre GL
- Turn-by-turn nav (computed on-device, no location to server)
- Privacy-respecting business search
- Save places, share location with time-limit
- Offline maps download
- Community traffic (privacy-preserving)
- ZERO location data sent to server (verified by network inspection test)

**PHASE 36 — QuantNews** (AI-curated, anti-misinfo) (`feat/phase-36-quantnews`)
- `apps/quantnews/`
- AI aggregator from 1000+ sources
- Anti-misinformation: cross-reference claims against fact-check databases
- Personalized but with diversity (not echo chamber)
- "Show me the other side" button
- Source credibility scores

**PHASE 37 — QuantHealth** (Apple Health competitor, on-device) (`feat/phase-37-quanthealth`)
- `apps/quanthealth/`
- Steps, sleep, heart rate (from phone sensors)
- Mental health: mood logging
- Habit tracker
- AI insights (entirely on-device, NEVER uploaded)
- Connect with QuantPay for "exercise discount" (insurance partnerships future)

---

### 🟢 PHASES 38-42 — Internet-Changing Micro-Features

These are the features that make users PHYSICALLY UNABLE to use other platforms.

**PHASE 38 — AI Digital Twin** (`feat/phase-38-digital-twin`)
- AI learns your communication style from ALL your messages/emails/posts
- When you're busy/sleeping, your Twin can respond to routine messages (per-contact permission)
- Twin is clearly labeled in conversations: "[Twin reply]"
- You see all Twin replies in audit log; can override before sending (configurable delay)
- DOUBLES your effective availability without doubling your time

**PHASE 39 — AI Life Search** (`feat/phase-39-life-search`)
- Natural language search across your entire digital life
- "When did I last talk to Mom?" → checks QuantChat + QuantMail + QuantMeet calls
- "How much did I spend on food last month?" → QuantPay
- "What was that restaurant John recommended?" → searches all conversations
- "Find that document about Q2 strategy" → QuantDocs + QuantDrive
- "What did I do exactly 1 year ago today?" → full timeline view

**PHASE 40 — Universal Clipboard + Cross-App Drag-and-Drop** (`feat/phase-40-universal-clipboard`)
- Copy ANYTHING in any Quant app → paste in any other
- Cross-device sync (e.g. copy on phone → paste on laptop within 1s)
- AI-enhanced: copying chart from QuantDocs → paste in QuantMail email auto-formats as inline image
- Address copied from QuantMail → pasted in QuantMaps auto-resolves location
- Drag email to QuantDocs → creates new doc with email content
- Drag video to QuantSync → creates post with video
- Drag receipt to QuantPay → adds expense

**PHASE 41 — AI Context Cards + Predictive Preload** (`feat/phase-41-context-cards`)
- Hover over any person/company/place in any app → popup shows everything
  - For person: last chat, upcoming meeting, mutual connections, recent posts, payment history
  - For company: your emails with them, contracts in QuantDrive, your role
  - For place: visits, photos, reviews, friends nearby
- Predictive preload: AI predicts what you need next, pre-loads it
  - Opening calendar? Pre-loads docs for next meeting
  - Opening email? Drafts replies to top 3 urgent
  - Opening QuantSync? Feed already personalized

**PHASE 42 — AI Relationship Health + Quiet Mode + One-Tap Context Switch** (`feat/phase-42-relationships`)
- "You haven't talked to Mom in 2 weeks" → suggest calling
- "Sarah's birthday is tomorrow" → drafts message
- "You and John used to talk daily but haven't in a month" → asks if everything OK (private, never shared with John)
- AI Quiet Mode: not just DND. AI UNDERSTANDS urgency. Family emergency comes through. Boss deadline comes through. Newsletter blocked.
- One-Tap Context Switch: work ↔ personal mode across all apps
  - Calendar shows different events
  - Email shows different inbox
  - Chat shows different conversations
  - QuantSync feed: friends not colleagues

---

## 5. LAUNCH READINESS GATE

After Phase 42, verify ALL of these PASS before declaring mission complete:

1. ✅ All 34 phases (9-42) merged to main with all gates green
2. ✅ CI green on main for 7 consecutive days
3. ✅ All SLO budgets unburned for 30 days in staging
4. ✅ External penetration test report: zero high/critical findings
5. ✅ DPIA (Data Protection Impact Assessment) signed
6. ✅ Founders use the production system end-to-end for 14 days with zero rollbacks
7. ✅ Marketing comparison pages reviewed by legal
8. ✅ All 13 strategic moats verifiably enabled
9. ✅ Test coverage 80%+ on critical paths
10. ✅ p95 cold-start TTI <2.5s on every app shell on 4G
11. ✅ Cost per user per day <$0.05 average
12. ✅ Zero third-party trackers (verified by network inspection)
13. ✅ All 19 apps + 50+ packages building, deploying, monitored

---

## 6. CRITICAL ANTI-PATTERNS — DO NOT DO THESE

- ❌ Do NOT recreate `apps/*/api/` legacy folders (they were intentionally deleted in Phase 9)
- ❌ Do NOT add a new package without justifying functional orthogonality in PR description
- ❌ Do NOT add a third-party service that requires sending PII off-platform without DPA review
- ❌ Do NOT introduce another parallel auth flow; extend `@quant/auth`
- ❌ Do NOT use `Math.random` in security paths; use `crypto.randomBytes` / `crypto.randomUUID`
- ❌ Do NOT bypass the outbox pattern for cross-aggregate events
- ❌ Do NOT use `any` type; if absolutely needed, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with reason comment
- ❌ Do NOT skip writing tests; every new service file must have a co-located `.test.ts`
- ❌ Do NOT implement own AI models; use cloud APIs via Vercel AI SDK multi-provider routing
- ❌ Do NOT hard-code API keys; use environment variables with validation
- ❌ Do NOT commit secrets to repository; use `.env.example` for templates
- ❌ Do NOT skip the acceptance gate before opening PR
- ❌ Do NOT merge a phase if any of: typecheck/lint/test/build fail
- ❌ Do NOT forget to update `state.json` after each phase completion

---

## 7. STATE TRACKING

Maintain `.agents/tasks/task-quant-meta-google-killer/state.json`:

```json
{
  "phases": {
    "phase09": { "status": "in_progress", "branch": "feat/phase-09-data-plane", "pr": null, "startedAt": "...", "completedAt": null },
    "phase10": { "status": "pending" }
  },
  "totalPhases": 34,
  "completedPhases": 0,
  "currentPhase": "phase09"
}
```

After each phase: update status to `done`, record PR URL, set `currentPhase` to next.

---

## 8. WHEN TO STOP AND ASK FOR HELP

You should STOP and write a status report when:

- A phase has been running >6 hours without completion
- An acceptance gate fails 3+ times despite fix attempts
- You encounter a decision that requires user input (e.g. "should we use Stripe or Razorpay for the Indian market?")
- An external dependency is broken (e.g. provider API down, package deprecated)
- A security concern arises that wasn't anticipated in the plan

Write the status to `.agents/tasks/task-quant-meta-google-killer/PHASE-NN-status.md` with:
- What was completed
- What is blocked
- Specific question or decision needed
- Recommended next step

---

## 9. COMPLETION SIGNAL

The mission is complete when:

1. `.agents/tasks/task-quant-meta-google-killer/state.json` shows all phases 9-42 as `done`
2. The Launch Readiness Gate (Section 5) passes all 13 checks
3. A final PR is opened with title "feat: launch-ready Quant Ecosystem v1.0" referencing all phase PRs
4. `apps/marketing/` (created in Phase 32) has comparison pages live for /compare/meta, /compare/google, /compare/openai

**Then return control to the user with a launch checklist.**

---

# END OF MEGA DETAILED PROMPT

You now have everything needed to execute this end-to-end. Start with Phase 9. Go.
