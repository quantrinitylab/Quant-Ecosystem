---
doc_id: quant-execution-queue
doc_type: execution-queue
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-09-07
verified_at_commit: 09a0a22e9aa5fe288d22987b90a6119a70f7c467
review_by: 2026-10-07
supersedes: []
superseded_by: []
canonical_scope: execution-priority
execution_status: active
milestone_id: M11D-SHADOW-CANARY
---

# Execution Queue

This is the only canonical ordered work queue. Exactly one milestone may have `execution_status: active`; agents must finish or explicitly block its next evidence-producing unit before promoting backlog work.

## Active — M11D-SHADOW-CANARY

**Outcome:** make Memory V2 shadow mode deployable, durable, tenant-safe, and release-gated while legacy memory remains authoritative.

**Decision boundary:** this milestone may improve wiring, durability, observability, and proof. It must not tune retrieval behavior, change acceptance policy, or enable `new` authority.

### Ordered work units

| Order | Unit                                                          | State  | Required evidence                                                                                                                                      |
| ----- | ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Capture current canary wiring and failure-mode baseline       | done   | [2026-07-22 baseline](./baselines/m11d-shadow-canary-wiring-baseline-2026-07-22.md): inventory, failure matrix, command outcomes, HOLD                 |
| 2     | Fail closed for non-legacy modes without durable dependencies | done   | [Fail-closed contract](./baselines/m11d-fail-closed-contract-2026-07-22.md): structured errors and 15/15 focused tests                                 |
| 3     | Persist tenant-scoped shadow reports across restart           | done   | [Durable report proof](./baselines/m11d-durable-shadow-report-2026-07-23.md): PostgreSQL client-restart durability, tenant isolation, and final-SHA CI |
| 4     | Exercise representative QuantAI shadow traffic                | active | Versioned report artifact and divergence replay records                                                                                                |
| 5     | Prove rollback and release gate                               | queued | Mode-cycle test plus blocking CI/deploy check                                                                                                          |
| 6     | Update migration decision                                     | queued | Append-only scoreboard row: HOLD, ADVANCE, or ROLLBACK                                                                                                 |

A later work unit may exist as candidate code, but it cannot skip this order or advance state. Promote a unit only when its coherent implementation and evidence are tracked together and required checks pass.

### Exit gates

All [ADR-011](./adr/011-memory-facade-shadow-migration.md) gates must be evidenced: semantic agreement >99%, pending agreement >98%, latency delta <10%, zero critical divergences, zero infrastructure failures, restart survival, tenant isolation, and demonstrated rollback. Until then the [Migration Scoreboard](./MIGRATION_SCOREBOARD.md) decision remains **HOLD**.

### Operating evidence

Use the existing [M11d protocol](./M11D_PROTOCOL.md), [runbook](./M11D_RUNBOOK.md), [shadow deployment runbook](./SHADOW_DEPLOY_RUNBOOK.md), and [decision log](./M11D_DECISION_LOG.md). Record one behavioral variable per experiment; never rewrite prior rows.

## Owner-directed parallel feature work (recorded, not a milestone change)

On 2026-09-20 the owner explicitly authorized a parallel QuantMail product-feature workstream outside M11D. This is recorded here per the update rule; it does **not** change the active milestone, which remains M11D-SHADOW-CANARY work unit 4, and it does **not** promote any backlog item.

- **QM-SMART-INBOX** — populate the `aiCategory` column that the inbox category tabs already read but nothing wrote. The rules-based `SmartInboxService` (already built and unit-tested) is now invoked by `InboundIngestAdapter` for non-quarantined inbound mail, and the category is persisted via `EmailService.receive`. Scope is additive and fail-open: a categorization fault cannot block delivery, and quarantined mail is never categorized. This closes a real Gmail-parity gap (Primary/Social/Promotions/Updates/Forums were permanently empty). Evidence: backend typecheck clean on touched files plus `smart-inbox.service.test.ts` and inbound-ingest tests.
- **QM-SMART-INBOX-LEARN** — durable, per-user learned categorization (beyond fixed Gmail tabs). New shared memory channel `UserInboxCategoryMemory` (`@quant/ai`) records sender→category corrections in user-owned memory; `PATCH /emails/:id/category` reassigns an owned email and best-effort records the correction; `InboundIngestAdapter` consults the learned store before built-in heuristics so a user's own past decision for a sender wins and survives restart. Fail-open throughout. Also fixed a stale `packages/auth/dist` build artifact that was breaking the QuantMail backend PAT typecheck (rebuilt `@quant/auth` and `@quant/common`; not a source change). Evidence: `@quant/ai` + backend typecheck clean; `user-inbox-category-memory.test.ts` (5/5), ingest learned-override test, PAT service tests (5/5).

On 2026-09-20/21 the owner additionally authorized standing up the missing per-app backends on **staging**. Also recorded here, also not a milestone change, and explicitly not a production step — the production gates in [Current State](./CURRENT_STATE.md) are untouched.

- **APP-BACKENDS-STAGING** — five apps shipped a Fastify `backend/app.ts` but nothing that could run it: no server entry, no image, no ECR repository, no Kubernetes objects, and no deploy target. Their frontends proxied `/api` to a nonexistent `localhost`, which is the "Unexpected end of JSON input" the UIs showed. quantube was taken end-to-end first (#274–#278) and the pattern then replicated to quantmax, quantneon, quantsync, and quantedits (#279): per app a `backend/server.ts`, a `Dockerfile.backend`, a `staging-<app>-backend.yaml` (Deployment + Service + `/api` ingress with `rewrite-target`), a `deploy-staging.yml` target, and the frontend backend-URL env(s).

  Four distinct runtime defects surfaced on the quantube pilot and were fixed once, at the root, rather than per app. Three were the same shape: the esbuild bundle keeps native/generated packages external, but pnpm only links them into the package that *declares* them, so Node could not resolve `@prisma/client`, then `onnxruntime-node`, walking up from `apps/<app>/backend/dist/`. The fourth was a double `listen()`: `app.ts`'s dev self-start was guarded by `import.meta.url.endsWith(process.argv[1])`, which is **true** once esbuild inlines `app.ts` into `server.mjs`, so the process bound port twice and crash-looped with `EADDRINUSE`. Separately, `@quant/media` read `@ffmpeg-installer/ffmpeg`'s throwing `.path` getter at module scope, so a missing ffmpeg binary took the whole API down instead of degrading transcoding; it now prefers `FFMPEG_PATH` and falls back inside `try`/`catch`.

  The four later apps were checked against that fix set *before* deploying — each bundle grepped for real `from`/`require` references to every external, then `require.resolve` run from its `dist` directory (0 missing; `argon2` for quantsync and `onnxruntime-node` for quantmax/quantneon were caught this way). All four deployed on the first attempt with no crash-loop. Three wrong hardcoded proxy ports were also corrected via env: quantmax pointed at 3007 (backend is 3008), quantsync at 3003 (is 3004), quantedits at 3008 (that is quantmax's port, not 3013).

  Evidence: six backends `1/1` with zero restarts in `quant-staging`; every `/readyz` `200` with `database`/`redis` ok; every app host `GET /api/healthz` `200 application/json`; `GET /api/feed` on all five hosts returns JSON `401 UNAUTHORIZED` rather than HTML. Every probe was unauthenticated, so authenticated data paths remain unproven.

- **APP-BACKENDS-STAGING-SWEEP** — a follow-up audit of *every* app in the namespace, rather than assuming the five already-wired ones were the whole set. It found three more things.

  quantads was the last app with a `backend/app.ts` and no way to run it, and got the same treatment as the others (#281). quantai and quantchat turned out to already run their backends as a **sidecar container inside the frontend pod** (`tsx backend/server.ts` over `localhost`), both `2/2` ready — so they deliberately got no separate Deployment; adding one would have duplicated working infrastructure. Their pre-existing `Dockerfile.backend` files were still fixed, because both lacked `openssl` and both pointed `HEALTHCHECK` at `/health`, which is not a route.

  `staging-remaining-apps.yaml` was quietly destructive. It pinned every frontend to commit tag `652ac616`, never pushed for most of them, under a comment claiming the tag "only matters for the very first apply". It does not: every later `kubectl apply -f` — including one whose only intent was adding an env var — rewrote the pod template to a nonexistent image and left a ReplicaSet in `ImagePullBackOff`. The Deployments still reported `Available` because the prior good ReplicaSet kept serving under `maxUnavailable: 25%`, so it was invisible in `kubectl get deploy`. Each image now pins the live digest and the comment states the real constraint.

  quanttrinity was the one app with `0/1` available, restarting ~300 times over 18h while reporting `reason=Completed` / `exitCode=0` — no error, no OOM, no `137`. Its image and build were fine (`turbo build` 18/18). Two independent defects: the image shipped no `openssl`, so Prisma could not detect libssl and guessed an engine (#282); and the owner API gate matched `/api/:path*`, so it also gated `/api/health` — the exact liveness-probe path — returning `401` until Kubernetes SIGTERMed the container, which Next.js then handled gracefully, making a probe failure indistinguishable from a clean shutdown (#283). The second fix exempts only that one static path and ships the middleware's first 11 tests, pinning that every other `/api/*` route still fails closed.

  Evidence: **18/18 Deployments `1/1` with no not-ready pod**; nine `/readyz` probes `200` with `database`/`redis` ok (seven standalone backends plus the quantai and quantchat sidecars); ten app hosts `200` at `/` (quantmail `301` to its apex); six `/api/healthz` `200 application/json`; quanttrinity serving for the first time. Still all unauthenticated probes.

- **EVENT-SPINE** — Law 3 ("everything is an event") had a write side and no carrier. `OutboxEvent`, `OutboxPublisher` and an emitting `base-repository` were all shipped; `services/cdc-relay` was written, tested, and had never run anywhere, so not one event had ever moved. Five independent defects kept it down, and each is a property of the monorepo rather than of the relay: it required a Kafka cluster that does not exist (hardcoded `localhost:9092`); its image could not build because a declared workspace dependency was never copied; raw `tsc` output does not run here at all, since `moduleResolution: bundler` leaves specifiers extensionless and Node's ESM resolver rejects them; pnpm links a dependency only into whatever declares it, so copying `dist/` alone stranded the one external; and pnpm had resolved **two** `@prisma/client` store variants, with `prisma generate` populating one and the relay resolving the other.

  The first fix was architectural: the poller now depends on an `EventTransport` protocol instead of a concrete Kafka client, which is what Law 4 and Law 5 required anyway. Redis Streams is the staging implementation — streams rather than pub/sub, because pub/sub drops events for a restarting consumer and would make the spine lossy against Law 2 — and Kafka remains available for production behind one env var. The last fix removed a failure class instead of patching it: the relay touches one table with two statements, so it dropped the ORM for `pg`, which also let claiming become `SELECT ... FOR UPDATE SKIP LOCKED` and lifted the single-replica constraint. Two correctness bugs surfaced on the way: the relay had been publishing a bare payload into a topic named only for the aggregate type, so `User.created` and `User.deleted` were indistinguishable, and a batch slower than the poll interval was overtaken by the next tick and republished.

  Evidence: pod `1/1` with transport `redis-streams`; an inserted `outbox_events` row drained within 5s, marked `publishedAt`, and read back off stream `outbox.SpineCheck` with the full envelope; 16/16 tests covering the transaction shape (`BEGIN → claim → publish → mark → COMMIT`, `ROLLBACK` with no mark on transport failure, connection released on failure, overlapping tick skipped).

  Honest limits at that point: the spine carried events but nothing produced them. Postgres TLS is on but the server certificate is unverified until `DATABASE_CA_CERT` is set — fine in-VPC on staging, not for production.

- **EVENT-SPINE-FIRST-PRODUCER** — a grep for `BaseRepository` across `apps/` and `services/` returns nothing, so the outbox had never held an application event: the spine was plumbing with no source. `VideoService.likeVideo` is now the first producer, and it emits inside the same transaction as the state change, which is the only version of the outbox pattern that means anything — an event that can commit without its state change, or a state change without its event, is a lie either way.

  The same change fixed a pre-existing race: the read, the insert/delete, the recount and the counter update were four independent statements, so two concurrent likes could both count rows before either wrote `likeCount` and the stored counter would settle on a stale number.

  The payload carries the actor, the creator, the channel and the category deliberately. A consumer building a cross-app interest signal needs all of them, and an event that forces a callback into the emitting app to be useful is not an event, it is a notification.

  Evidence is live, not a test double: against the deployed staging backend, an authenticated `POST /interactions/like` returned `{"liked":true,"likeCount":1}`; the row landed in `video_likes`; an `outbox_events` row `Video.liked` was written and drained (`publishedAt` set); and Redis Stream `outbox.Video` carried the full envelope, with `userId` (the liker) distinct from `creatorId` (the owner). Suite: 388/388 across 30 files, typecheck and lint clean.

  Honest limits: this is one producer on one action. Every other write in every app still emits nothing, and **no consumer reads the streams**, so there is no signal graph and no cross-app personalisation yet. The consumer needs a durable signal model, which means a migration, so it ships as its own unit.

## Parallel operational-readiness boundary

The 2026-08-07 security/provider/infrastructure hardening stack is merged, but it did not replace the active milestone. External administrators may work on reversible prerequisites—GitHub OIDC, read-authorized EKS verification, real secret provisioning, private-endpoint access, plan review, immutable images, and staging evidence—without marking production ready or advancing this queue.

## Ordered backlog

1. **M11E-STABILIZATION** — fix defects exposed by the canary; no new capability.
2. **M12-RETRIEVAL-QUALITY** — semantic retrieval/reranking measured with MRR, Recall@k, and nDCG.
3. **M13-HUMAN-FEEDBACK** — confirmation, rejection, correction, recalibration, and explainability.
4. **S-01-IDENTITY-REVOCATION** — production verification and residual session/key-lifecycle work after the merged #125/#132 foundation; it may not displace M11d without an explicit queue change.
5. **RELEASE-GOVERNANCE** — prove full-repository health, staging, rollback, and successful CI/deployment prerequisites before production activation.

## Update rule

Change this queue only with linked evidence. If blocked by credentials or infrastructure, record the blocker and continue with the next work unit inside the active milestone that can produce evidence; do not silently promote backlog work.
