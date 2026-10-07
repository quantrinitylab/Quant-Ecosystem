# System Mathematics — Quant Ecosystem

> **CEO Order #0004.** Not guesses. Calculations.
> Every number below is either (a) derived from a formula stated on this page,
> (b) taken from a measured artifact in this repo (SLOs, eval harness), or
> (c) an explicit stated assumption, marked `ASSUMPTION`.
> When an assumption is invalidated by measurement (M11d baselines), update the
> assumption and recompute — never patch the conclusion.

**Companion documents:** `QUANT_FOUNDATION.md` (laws), `ENGINEERING_BIBLE.md`
(engineering), `slos.md` (measured targets), `M11D_PROTOCOL.md` (how numbers get verified).

---

## 0. Notation & Global Assumptions

| Symbol | Meaning | Value / Source |
|--------|---------|----------------|
| `U` | Registered users | scale-stage variable |
| `DAU` | Daily active users | `ASSUMPTION: DAU = 0.25 × U` |
| `CCU` | Peak concurrent users | `ASSUMPTION: CCU = 0.10 × DAU` (peak-hour concentration) |
| `R_u` | Requests per DAU per day | `ASSUMPTION: 120` (mail + chat + AI + sync combined) |
| `A_u` | AI inferences per DAU per day | `ASSUMPTION: 12` (10% of requests touch the AI engine) |
| `T_in` | Mean input tokens per inference | `ASSUMPTION: 1,800` (prompt + memory context + system) |
| `T_out` | Mean output tokens per inference | `ASSUMPTION: 350` |
| `λ` | Arrival rate (req/s) | derived |
| `μ` | Service rate per worker (req/s) | derived from latency |
| `ρ` | Utilization = λ/(c·μ) | keep < 0.7 (see §8) |

Peak factor: `λ_peak = 3 × λ_avg` (`ASSUMPTION`, standard diurnal concentration for IN/US mixed traffic).

```
λ_avg = (DAU × R_u) / 86,400
λ_peak = 3 × λ_avg
```

---

## 1. Latency Budget

Global SLO (from `docs/slos.md`): **P95 < 200 ms, P99 < 500 ms** for non-AI routes.

### 1.1 Non-AI request budget (P95 = 200 ms)

```
TLS + edge routing            15 ms
API gateway (rate limit, WAF) 10 ms
Auth (JWT verify, local)       2 ms
Permission check (cached)      3 ms
Handler logic                 20 ms
Database (1–2 queries)        40 ms
Serialization + egress        10 ms
------------------------------------
Budget consumed              100 ms
Headroom (GC, retries, tail) 100 ms
```

**Rule:** any single component that consumes > 40% of the remaining budget
requires an ADR. Headroom is not free money; it absorbs P99 tail, not features.

### 1.2 AI request budget

AI routes get a separate SLO class. Decomposition of one inference:

```
T_ai = T_route + T_memory_recall + T_prompt_build + T_provider + T_stream_first_token
```

| Stage | Budget | Source |
|-------|--------|--------|
| Model routing decision | 5 ms | in-process table (`routing-table.ts`) |
| Memory recall (hybrid vector) | 50 ms | measured ~22 ms in eval harness; 2× margin |
| Prompt build + safety | 10 ms | in-process |
| Provider TTFT (time to first token) | 400–1,200 ms | provider-dependent; circuit breaker at 5 s |
| Full completion (350 tok @ ~60 tok/s) | ~5.8 s | streamed, not blocking |

**AI SLO:** P95 time-to-first-token < 1.5 s; full completion is streamed so
perceived latency = TTFT. Semantic cache hits (`semantic-cache.ts`) short-circuit
the provider stage entirely: cache-hit path P95 < 100 ms.

### 1.3 Latency ↔ throughput identity (Little's Law)

```
L = λ × W        (in-flight requests = arrival rate × mean latency)
```

At 1,000 req/s and W = 100 ms → 100 requests in flight → sizes connection pools,
worker counts, and memory-per-request budgets. Use this identity before every
capacity change; it is the cheapest load test that exists.

---

## 2. Memory Growth Formula (AI Memory Subsystem)

Per user per day:

```
M_day = A_u × E × S_m
```

| Term | Meaning | Value |
|------|---------|-------|
| `A_u` | inferences/DAU/day | 12 |
| `E` | accepted memories per inference | `ASSUMPTION: 0.4` (extraction yield × acceptance policy pass rate; verify in M11d Baseline v1) |
| `S_m` | bytes per memory row (text + metadata + provenance) | ~1.2 KB |

→ `M_day ≈ 5.8 KB/DAU/day` of memory rows.

Embeddings dominate:

```
S_e = d × 4 bytes = 1536 × 4 = 6,144 bytes ≈ 6 KB per memory (fp32)
S_e(fp16) = 3 KB   S_e(int8) = 1.5 KB
```

Total memory-subsystem growth:

```
G_mem = DAU × A_u × E × (S_m + S_e)
      = DAU × 12 × 0.4 × 7.2 KB ≈ DAU × 34.6 KB/day
```

| DAU | Growth/day | Growth/year |
|-----|-----------|-------------|
| 250 (U=1k) | 8.6 MB | 3.2 GB |
| 25k (U=100k) | 865 MB | 316 GB |
| 250k (U=1M) | 8.6 GB | 3.2 TB |
| 25M (U=100M) | 865 GB | 316 TB |

**Consequences (not opinions):**
- Below U = 1M, pgvector on Postgres is mathematically sufficient (< 4 TB vectors).
- At U = 1M+, quantize embeddings (int8 → 4× reduction) and move to a dedicated
  vector store (Qdrant adapter already exists: `qdrant-vector-backend.ts`).
- Forgetting/supersession policy (ADR-009 state machine) is not optional at
  scale — without decay, memory grows linearly forever. Law 2 says append-first;
  it does not say index-everything-forever. Archive superseded rows to cold storage.

---

## 3. Storage Growth (Full Platform)

```
G_total = G_db + G_media + G_mail + G_logs + G_mem
```

Per-DAU daily assumptions (`ASSUMPTION`, verify against production telemetry):

| Stream | Formula | Per-DAU/day |
|--------|---------|-------------|
| Relational rows (mail meta, chat, events) | 200 rows × 0.5 KB | 100 KB |
| Mail bodies (MIME) | 25 msgs × 75 KB | 1.9 MB |
| Media (photos/video, amortized) | 0.15 uploads × 8 MB | 1.2 MB |
| Logs + traces (sampled 10%) | 120 req × 2 KB × 0.1 | 24 KB |
| AI memory (§2) | — | 35 KB |
| **Total** | | **≈ 3.3 MB/DAU/day** |

| U | DAU | Storage/day | Storage/year |
|---|-----|-------------|--------------|
| 100 | 25 | 82 MB | 30 GB |
| 1,000 | 250 | 825 MB | 300 GB |
| 10,000 | 2,500 | 8.2 GB | 3 TB |
| 100,000 | 25,000 | 82 GB | 30 TB |
| 1M | 250,000 | 825 GB | 300 TB |
| 100M | 25M | 82 TB | 30 PB |

**Consequences:**
- Media is ~60% of all bytes at every stage → object storage + CDN from day one
  (already the design: `@quant/storage`, `@quant/cdn`).
- Postgres holds < 5% of bytes but 95% of query value. Protect it: TTL + outbox
  compaction + partitioning by month at U ≥ 100k.
- At 100M users, storage is a petabyte problem — tiering (hot/warm/cold) must be
  in the schema (`storage_class` column) long before it is needed operationally.

---

## 4. Token Economics

Daily platform token volume:

```
Tok_day = DAU × A_u × (T_in + T_out) = DAU × 12 × 2,150 = DAU × 25,800 tokens/day
```

Blended cost model (routing table sends ~80% of traffic to cheap/fast models,
~20% to frontier models — `ASSUMPTION` pending router telemetry):

```
C_blend = 0.8 × C_cheap + 0.2 × C_frontier
C_cheap    ≈ $0.15 / 1M input, $0.60 / 1M output
C_frontier ≈ $3.00 / 1M input, $15.00 / 1M output
→ C_in ≈ $0.72 / 1M tok    C_out ≈ $3.48 / 1M tok
```

Cost per inference:

```
C_inf = (1,800 × 0.72 + 350 × 3.48) / 1,000,000 ≈ $0.0025
```

Semantic cache at hit-rate `h` reduces provider spend: `C_eff = C_inf × (1 − h)`.
At `h = 0.30` (target for `semantic-cache.ts`): **C_eff ≈ $0.00175/inference**.

| U | DAU | Inferences/day | AI cost/day (h=0.3) | AI cost/month |
|---|-----|----------------|---------------------|---------------|
| 100 | 25 | 300 | $0.53 | $16 |
| 1,000 | 250 | 3,000 | $5.25 | $158 |
| 10,000 | 2,500 | 30,000 | $53 | $1.6k |
| 100,000 | 25,000 | 300,000 | $525 | $16k |
| 1M | 250,000 | 3M | $5.3k | $158k |
| 100M | 25M | 300M | $525k | $15.8M/mo |

**Consequences:**
- Below 10k users, AI cost is noise. Do NOT optimize cost before then; optimize
  quality (this is why M11 froze architecture and built evaluation first).
- At 100k+, the router's cheap-model share and cache hit-rate are the two levers
  worth a full-time engineer: `∂C/∂h = −C_inf × Inferences` — at 1M users each
  +1% cache hit-rate saves ~$1.6k/month.
- At 1M+, self-hosted inference for the cheap tier crosses breakeven
  (see §5 cost equations) — this is why Law 6 (models are temporary) and the
  provider-adapter port design pay off literally in dollars.

---

## 5. Cost Equations (Infra)

```
C_total = C_compute + C_db + C_vector + C_storage + C_egress + C_ai
```

Unit prices (`ASSUMPTION`: on-demand cloud list prices, 2026):

| Resource | Unit price |
|----------|-----------|
| vCPU-hour (compute) | $0.04 |
| Postgres (managed, per vCPU-hour) | $0.08 |
| Object storage | $0.023 / GB-month |
| Egress | $0.09 / GB |
| Vector DB node (16 GB) | $0.30 / hour |

Compute sizing from §8 concurrency math: 1 vCPU sustains ~250 req/s of 20 ms-CPU
work at ρ=0.7 → `vCPU = λ_peak / 250` (API tier) + fixed overhead per service.

Self-host AI breakeven (cheap tier): one A10-class GPU ($1.10/hr) serves ~15
req/s of small-model inference → $0.000020/inference vs $0.0008 API →
breakeven when GPU is > ~4% utilized. **At U ≥ 100k (3.5 inf/s avg) one GPU is
~25% utilized → self-hosting the cheap tier is justified.** Before that, API-only.

---

## 6. Concurrency

```
CCU = 0.10 × DAU          (peak concurrent)
λ_peak = 3 × (DAU × R_u)/86,400
```

| U | DAU | CCU | λ_avg (req/s) | λ_peak (req/s) |
|---|-----|-----|----------------|-----------------|
| 100 | 25 | 3 | 0.03 | 0.1 |
| 1,000 | 250 | 25 | 0.35 | 1 |
| 10,000 | 2,500 | 250 | 3.5 | 10 |
| 100,000 | 25,000 | 2,500 | 35 | 104 |
| 1M | 250,000 | 25,000 | 347 | 1,042 |
| 100M | 25M | 2.5M | 34,722 | 104,167 |

---

## 7. Connection Limits

**WebSockets (realtime / ws-gateway):** every CCU holds ~1.2 sockets
(`ASSUMPTION`: chat + presence multiplexed on one, some users on 2 devices).

```
Sockets = 1.2 × CCU        Node ceiling ≈ 64k sockets/process (fd + heap)
Gateway processes = ceil(Sockets / 50,000)   (78% of ceiling for headroom)
```

| U | Sockets | ws-gateway processes |
|---|---------|----------------------|
| ≤100k | ≤3,000 | 1 (+1 for HA) |
| 1M | 30,000 | 1–2 (+HA) |
| 100M | 3M | 60 (+HA) → needs a connection-sharding layer keyed by userId |

**Postgres:** hard practical ceiling ~500 direct connections.

```
Needed = Σ services × pool_size = L_db = λ_peak × W_db
At 1M users: 1,042 req/s × 0.04 s = ~42 concurrent queries → pool of 100 suffices.
At 100M: 4,200 concurrent → REQUIRES pgBouncer/transaction pooling + read replicas + sharding.
```

**Consequence:** connection pooling middleware becomes mandatory between U=1M
and U=100M — schedule it at 1M, not at the outage.

---

## 8. Scaling Formula & Queue Theory

Model each service as **M/M/c** with utilization `ρ = λ / (c·μ)`.

Queueing delay explodes non-linearly (Erlang-C behavior):

```
W_q ≈ (ρ^√(2(c+1)) / (c·μ)) × 1/(1−ρ)      (Sakasegawa approximation)
```

| ρ | Relative wait | Verdict |
|---|---------------|---------|
| 0.5 | 1× | comfortable |
| 0.7 | 2.3× | **target ceiling** |
| 0.8 | 4× | alert |
| 0.9 | 9× | page on-call |
| 0.95 | 19× | outage in progress |

**Scaling rule (the only autoscaling formula we use):**

```
c = ceil( λ_peak / (μ × 0.7) )
```

Workers needed = peak arrival rate over per-worker service rate at 70% target
utilization. Everything else (HPA settings, replica counts) derives from this.

**Queue depth (BullMQ / outbox):** by Little's law, steady-state depth
`D = λ_jobs × W_process`. Alert when `D > 60 s × λ_jobs` (one minute of backlog);
that threshold self-scales with traffic and never needs retuning.

---

## 9. Rate Limits

Principled derivation — limits protect the 99% from the 1%, so set them at
**P99.9 of legitimate per-user behavior**, not round numbers:

```
Limit_user = P99.9(legit usage) ≈ 20 × mean usage       (heavy-tail assumption)
```

| Resource | Mean/user/min | Limit/user/min |
|----------|---------------|----------------|
| API (general) | 5 | 100 |
| AI inference | 0.5 | 10 |
| Mail send | 0.02 | 2 (60/day, anti-spam) |
| Auth attempts | 0.01 | 5 (then backoff) |
| WS messages | 10 | 200 |

Global (platform-protection) limit per service = `2 × λ_peak` — beyond that,
shed load rather than melt (circuit breaker `circuit-breaker.ts` pattern applies
at the edge too).

---

## 10. Scale Stages — the Master Table

| Stage | U=100 | 1k | 10k | 100k | 1M | 100M |
|---|---|---|---|---|---|---|
| DAU | 25 | 250 | 2.5k | 25k | 250k | 25M |
| Peak req/s | 0.1 | 1 | 10 | 104 | 1,042 | 104k |
| API vCPUs (ρ=0.7) | shared | shared | 1 | 2 | 6 | 600 |
| Postgres | 1 small | 1 small | 1 medium | 1 large + replica | HA + pooling | sharded + regional |
| Vector store | pgvector | pgvector | pgvector | pgvector | Qdrant cluster | Qdrant sharded, int8 |
| WS gateways | 1 | 1 | 1 | 1+HA | 2+HA | 60 sharded |
| Storage/year | 30 GB | 300 GB | 3 TB | 30 TB | 300 TB | 30 PB |
| AI $/month | $16 | $158 | $1.6k | $16k | $158k | $15.8M |
| Infra $/month (est.) | $50 | $150 | $500 | $3k | $25k | $2M+ |
| Dominant cost | fixed infra | fixed infra | infra | AI ≈ infra | AI | AI |
| Structural change required | — | — | — | GPU cheap-tier | pooling, Qdrant, int8 | sharding everything |

**The single most important row is the last one.** Each stage transition has
exactly one or two structural changes. Doing them earlier is waste (violates
M11 restraint discipline); doing them later is an outage. The math above tells
us *when* — telemetry tells us *that we've arrived*.

---

## 11. Verification Protocol

Every `ASSUMPTION` on this page is a hypothesis. The M11d baseline and
production telemetry replace assumptions with measurements in this order:

1. `E` (memory acceptance yield) — from Baseline v1 (`M11D_PROTOCOL.md`).
2. Cache hit-rate `h` — from `semantic-cache` metrics.
3. `A_u`, `R_u` — from gateway telemetry after beta.
4. Router cheap/frontier split — from `cost-tracker.ts` logs.

When a measured value diverges > 25% from its assumption, recompute every table
that uses it and record the delta in `M11D_DECISION_LOG.md`.

---

**Status:** v1.0 — all assumptions marked, all formulas explicit.
**Owner:** Engineering (Kiro) · **Approved by:** CEO · **Date:** 2026-07-09
