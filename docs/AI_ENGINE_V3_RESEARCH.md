# AI Engine V3 — Research Paper

> **CEO Order #0009.** Not an audit of the current engine. A research paper for
> the next one. V2 is the baseline; V3 is the thesis.
>
> **Status:** v1.0 (living document). Each chapter carries an evidence level:
> `[MEASURED]` backed by repo artifacts · `[DESIGNED]` specified but unbuilt ·
> `[RESEARCH]` literature-informed direction requiring experiments.
>
> **Prime constraint (Law 6):** every model is temporary; architecture is
> permanent. V3 is therefore a paper about *orchestration*, not about models.
> **Second constraint (Law 7):** trust before intelligence. No capability ships
> without an evaluation and a safety boundary.

---

## Abstract

Quant's AI Engine V2 (`packages/ai`) is a model-agnostic inference orchestrator:
routing table → provider adapters → circuit breakers → semantic cache → cost
tracking, plus a frozen memory subsystem (ports, acceptance policy, hybrid
vector retrieval, replayable evaluation — ADRs 005–011). V2's thesis was
**"model-agnostic inference with trustworthy memory."** It is implemented and
under validation (M11d).

V3's thesis is one sentence:

> **From a stateless inference pipe with memory, to a stateful, self-evaluating
> organism of agents — where every decision (route, plan, tool call, memory
> write) is measured, replayable, and reversible.**

Three pillars: (1) **Decision intelligence** — routing/planning as learned,
evaluated policies rather than static tables. (2) **Compound memory** — episodic
+ semantic + procedural memory with supersession and confidence propagation.
(3) **Coordinated agency** — multi-agent execution over open protocols (MCP,
A2A) inside hard trust boundaries.

The paper specifies each pillar, its benchmarks, its cost/latency envelope
(tied to `SYSTEM_MATHEMATICS.md`), its failure modes, and its migration path —
under the same discipline that governed M11: contracts first, evaluation before
tuning, one change per experiment, rollback always proven.

---

## Part I — Foundations

### 1. Where V2 actually is `[MEASURED]`

Honest inventory (from repo, main @ `aa1fc92`):

| Capability | V2 state | Evidence |
|---|---|---|
| Multi-provider inference | ✅ 10+ providers via adapters | `providers/`, `provider-adapter.ts` |
| Routing | ✅ static task→model table + fallback chains | `routing-table.ts`, `model-router.ts` |
| Resilience | ✅ circuit breaker, retry, provider health | `circuit-breaker.ts`, `retry.ts`, `provider-health.ts` |
| Cost control | ✅ token counting, per-request cost logs | `token-counter.ts`, `cost-tracker.ts` |
| Caching | ✅ semantic cache | `semantic-cache.ts` |
| Memory | ✅ frozen v1: ports, policy, hybrid retrieval, traces | ADR-005…011, `memory-*.ts` |
| Evaluation | ✅ extraction eval, policy replay, shadow replay | `eval/` (10 modules) |
| Migration safety | ✅ facade, 4 modes, cutover gates | `memory-facade.ts`, ADR-011 |
| Planning | ❌ none — single-shot inference | — |
| Reflection/learning | ❌ none | — |
| Multi-agent | ⚠️ scaffolding only (`agent-runtime`, `agent-swarm` — LOW/DEAD in heatmap) | `DEPENDENCY_HEATMAP.md` |
| Knowledge graph | ❌ deliberately deferred (correct call — see §8) | CEO review of M06 |

**V2's genuine achievements:** hexagonal purity (engine depends on ports only),
replayability (policy replay + shadow replay = fair A/B forever), and restraint
(evaluation before tuning). V3 must not sacrifice any of these.

### 2. Design axioms for V3

1. **Every decision is a datapoint.** Route choices, plan steps, tool calls,
   memory accepts — each emits a structured event with enough context to replay it.
2. **Policies over rules, but rules before policies.** Every learned component
   ships with a deterministic fallback (the V2 static behavior) and a kill switch.
3. **The evaluation harness is the constitution.** A change without a benchmark
   delta is a refactor; a behavior change without a benchmark is forbidden.
4. **Facade-gated evolution.** V3 components arrive behind the same
   legacy→dual_write→shadow→new progression that ADR-011 proved for memory.
5. **Budget-bounded intelligence.** Every request carries a budget vector
   (tokens, $, ms, tool-calls); planners must plan within it (§10, §11).

---

## Part II — Decision Intelligence

### 3. Routing `[DESIGNED → RESEARCH]`

**V2:** static table `task_type → (primary, fallbacks)`. Correct first step;
cannot express difficulty, user tier, budget pressure, or provider drift.

**V3 routing = a policy with four inputs and one learned component:**

```
route(request) = argmax_m  E[quality(m, x)] − λ_c·cost(m, x) − λ_l·latency(m)
subject to: budget(x), provider_health(m), data_policy(x)
```

- **Difficulty estimation:** a small classifier (or logprob-based heuristic)
  bins requests into {trivial, standard, hard, frontier}. Trivial → cheap tier
  (80%+ of traffic per `SYSTEM_MATHEMATICS.md §4`); frontier → expensive tier.
- **Quality priors** come from the benchmark suite (§13) per (task, model),
  refreshed on every model onboarding — not from vibes.
- **Bandit layer:** ε-greedy per (task, difficulty) cell over live feedback
  (§14 reflection signals) to track provider drift without redeploys.
  `[RESEARCH: needs offline replay before any live traffic]`
- **Escalation:** cheap-model self-check ("are you confident?") → escalate on
  low confidence. Cascade routing cuts cost 40–70% in literature; our target:
  **≥ 40% cost reduction at ≤ 2% quality loss**, proven on the benchmark suite.

**Failure containment:** routing policy is itself circuit-broken — on anomaly
(quality dip, cost spike) auto-revert to the static V2 table (axiom 2).

### 4. Planning `[DESIGNED]`

V2 has no planner. V3 introduces one — as a *typed artifact*, not a hidden CoT:

```ts
interface Plan {
  goal: string
  steps: PlanStep[]          // typed: tool | inference | recall | verify
  budget: BudgetVector       // tokens, $, ms, toolCalls
  fallback: PlanStep[]       // degraded path if budget/steps fail
  trace: PlanTrace           // why this plan (replayable)
}
```

- **Plan-then-execute** for multi-step tasks; single-shot remains the fast path
  (planner engages only above a complexity threshold — most requests never pay
  planning latency).
- Plans are validated before execution: tool existence, permission scopes
  (Law 7), budget feasibility.
- Plans are first-class evaluation subjects: plan-quality benchmarks (§13)
  score step count, budget adherence, and success rate, replayable like policy
  replay does today.

### 5. Context Engineering `[DESIGNED]`

Context window = the engine's working memory (Working Memory organ). V3 makes
context assembly an explicit optimization problem:

```
maximize  relevance(context | query)
subject to  tokens(context) ≤ T_budget(model, task)
```

Sections with fixed priority: system+safety (never trimmed) → task instruction
→ recalled memories (ranked, §7) → tool schemas (only tools the plan needs) →
conversation tail (recency-windowed) → scratch. Each section reports its token
spend to the cost tracker; context composition appears in the request trace.
This replaces V2's `context-manager.ts` string assembly with a budgeted,
measurable composer — the direct beneficiary of memory ranking quality.

---

## Part III — Memory (the moat)

### 6. Memory architecture status `[MEASURED]`

Frozen v1 (do not reopen — CEO directive): ports (`memory-port.ts`),
extraction schema (ADR-010), acceptance state machine
Pending→Active→Superseded (ADR-009), hybrid vector retrieval with
`RetrievalTrace` (ADR-007), facade migration (ADR-011). Validation pending
(M11d Baseline v1). **V3 memory work builds ON these contracts, never under them.**

### 7. Memory quality: the V3 agenda `[DESIGNED → RESEARCH]`

Priorities in expected-return order (matches CEO's revised M06–M12 ordering):

1. **Supersession correctness** — "I moved from Patna to Bangalore" must
   retire Patna. Benchmarks: `temporal.json`, `corrections.json`,
   `conflicting.json` (datasets exist in `eval/`). Target: correction-recall
   ≥ 95% before any new memory feature.
2. **Confidence propagation** — extend scoring from `(confidence, relevance)` to
   `(confidence, freshness, source_reliability, confirmation_count,
   contradiction_score)`. Gated: ship only if the eval suite proves ranking
   lift (CEO condition, explicitly).
3. **Forgetting economics** — decay/archival policy derived from
   `SYSTEM_MATHEMATICS.md §2` (linear growth is unaffordable at 1M+ users).
   Archived ≠ deleted (Law 2).
4. **Procedural memory** `[RESEARCH]` — "how the user likes things done"
   (format preferences, tone, workflows) as a distinct memory type with its own
   extraction rules and eval set.
5. **Episodic summaries** `[RESEARCH]` — periodic conversation-level
   consolidation (like sleep consolidation), producing semantic facts from
   episode logs. Strictly evaluation-gated.

### 8. Knowledge Graph `[RESEARCH — deliberately last]`

Position unchanged from the M06 decision: most assistants are never
graph-limited; they are extraction-, ranking-, and evaluation-limited.
**Trigger condition to start graph work:** the eval suite shows ≥ 10% of recall
failures are multi-hop relational queries that hybrid vector retrieval cannot
serve. Until that measurement exists, the graph remains a chapter, not a milestone.
When triggered: entity-resolution layer over existing memories (identity keys
from Law 1), edges as events (Law 3), retrieval as a `GraphRetriever` port
beside the vector retriever — zero contract changes.

---

## Part IV — Agency

### 9. Single-agent execution loop `[DESIGNED]`

```
perceive (input + recall) → plan (§4) → act (tool/inference)
→ verify (§14) → record (memory observe + trace) → repeat within budget
```

Tools come from `@quant/quant-tools` registry; every tool declares permission
scope, cost estimate, and reversibility class:

| Class | Example | Policy |
|---|---|---|
| Reversible | draft email, search | auto-execute |
| Compensable | send message (deletable) | execute + audit |
| Irreversible | send mail, spend credits, deploy | **human approval (Law 7)** |

### 10. Multi-agent `[RESEARCH]`

Honest note: `agent-swarm`/`agent-runtime` packages are scaffolding
(heatmap: LOW). V3 earns multi-agent only after single-agent verification
works. Topology when earned: **orchestrator–specialist**, not free-form swarm:

- Orchestrator owns the plan, the budget, and the merge.
- Specialists (research, code, mail, calendar) are single agents with narrow
  tool scopes — blast radius per specialist stays small.
- All inter-agent messages are typed events on the existing queue (Law 3, Law 4)
  — no bespoke agent bus.
- Global budget is partitioned, not shared: a runaway specialist exhausts its
  slice, never the request.

### 11. Protocols: MCP & A2A `[DESIGNED]`

- **MCP (Model Context Protocol):** V3 exposes Quant capabilities (mail, drive,
  calendar, memory recall) as MCP servers, and consumes external MCP tools.
  This replaces N×M bespoke integrations with N+M — the exact math that
  justifies Law 4. Permission mapping: MCP tool scope → Quant RBAC scope, no
  exceptions.
- **A2A (agent-to-agent):** cross-organism delegation (Quant agent ↔ external
  agent). Adopt conservatively: outbound first (we call others), inbound only
  behind allow-lists + signed identity (Law 1, Law 7). Every A2A exchange is an
  auditable event.

---

## Part V — Trust, Economics, Reliability

### 12. Safety `[DESIGNED, partially MEASURED]`

Defense in depth, each layer independently killable:

1. Input policy (`safety.ts`) — injection/jailbreak screens before recall.
2. Context provenance — recalled memories carry trust labels; untrusted content
   is delimited and never interpreted as instructions.
3. Tool gating — reversibility classes (§9); irreversible ⇒ human approval.
4. Output policy + moderation (`@quant/moderation`) before delivery.
5. Audit — every AI action that crossed a trust boundary is reconstructable
   from events (Law 2 + Law 7).

Safety gets its own benchmark set (prompt-injection corpus, exfiltration
attempts, escalation attempts) with a hard rule: **safety regressions block
release regardless of quality gains.**

### 13. Benchmarks & Evaluation `[MEASURED → DESIGNED]`

V2 already has the right skeleton (`eval/`): extraction eval, policy replay,
shadow replay, failure taxonomy, versioned corpus. V3 extends the same
discipline to every new component:

| Suite | Measures | Exists? |
|---|---|---|
| memory-eval (facts, prefs, corrections, temporal, conflicts, long-context, multilingual) | recall/precision/duplicate-rate/latency | ✅ datasets in repo |
| routing-eval | quality-vs-cost frontier per (task, difficulty) | ❌ build first in V3 |
| plan-eval | success rate, step efficiency, budget adherence | ❌ |
| safety-eval | injection resistance, gating correctness | ❌ |
| e2e assistant-eval | task completion on realistic multi-turn scenarios | ❌ |

Rules inherited from M11: baselines are read-only forever; one change per
rerun; version-freeze (model ID, prompt rev, policy version, corpus version,
SHA, lockfile hash) recorded before every run; success = trustworthy evidence,
not flattering numbers.

### 14. Reflection & Learning `[RESEARCH]`

Learning WITHOUT weight training — the only kind V3 does:

- **Verification pass:** cheap post-hoc check per response (schema validity,
  claim-vs-source consistency, tool-result consistency). Failures → retry or
  escalate route (§3).
- **Feedback ingestion:** user corrections ("no, I meant…") become (a) routing
  bandit signal, (b) memory supersession events, (c) eval-set candidates —
  closing the loop between production and benchmarks.
- **Prompt evolution:** prompt registry (`prompt-registry.ts`) gains versioned
  A/B via shadow replay — a prompt change is an experiment with a decision-log
  row, never a silent edit.
- Explicitly out of scope for V3: fine-tuning/RLHF pipelines. Revisit when
  self-hosted cheap tier exists (SYSTEM_MATHEMATICS §5 breakeven at ~100k users).

### 15. Cost & Latency Engineering `[DESIGNED]`

Targets (derived in `SYSTEM_MATHEMATICS.md` §1/§4):

- TTFT P95 < 1.5 s; cache-hit P95 < 100 ms; recall < 50 ms.
- Blended cost/inference ≤ $0.00175 at 30% cache-hit; router cascade target
  −40% cost at ≤ −2% quality (§3).
- Every request emits a cost vector; budgets enforced pre-flight by planner.
  The cost dashboard is a first-class artifact, same rank as latency SLOs.

### 16. Failure Recovery `[MEASURED → DESIGNED]`

V2 primitives (breaker/retry/health) extend to V3 semantics:

- **Provider failure:** breaker → fallback chain (exists) → *stateful resume*:
  a failed plan step retries alone, never the whole plan.
- **Partial plan failure:** compensable steps roll back via compensation
  events; irreversible steps park the plan for human decision.
- **Memory unavailability:** engine degrades to stateless inference (facade
  already proves sinks are best-effort — commit `9920396`).
- **Poisoned state:** replay + traces make every bad output attributable to
  (model, prompt, policy, memory) versions — the M11 version-freeze discipline
  is the incident-response tool.

### 17. Model Evolution & Provider Strategy `[DESIGNED]`

- **Onboarding a model = running the benchmark suite**, publishing its
  frontier position (quality/cost/latency per task), adding routing-table
  entries. Target: < 1 day from API key to routed traffic.
- **Retiring a model = flipping routing weights**, nothing else (Law 6 test).
- Portfolio: ≥ 2 frontier providers + ≥ 2 cheap providers + 1 local/self-host
  path (ollama adapter exists) — no single provider > 50% of spend.
- India-specific: multilingual eval sets (hi/en code-switch) weight routing for
  Bharat traffic (`bharat-ai` package becomes an eval-driven route, not a fork).

---

## Part VI — Programme

### 18. Migration path (order, not dates)

```
V3.0  Routing-eval suite + difficulty estimator (offline only)
V3.1  Cascade routing behind facade (shadow → gates → cutover, ADR-011 style)
V3.2  Context composer (budgeted assembly) + supersession hardening
V3.3  Planner + tool reversibility classes + safety-eval suite
V3.4  Single-agent verified loop (reflection signals live)
V3.5  MCP server/client surface
V3.6  Confidence propagation (if eval proves lift) + forgetting economics
V3.7  Multi-agent orchestrator–specialist (only after V3.4 metrics hold)
V3.8  A2A outbound · Knowledge graph iff trigger condition (§8) fires
```

Every stage: contracts → shadow → baseline → gates → cutover → scoreboard row.
No stage starts while the previous stage's gates are red. M11d baseline
completion is the entry condition for V3.0.

### 19. Open research questions

1. Can difficulty estimation reach ≥ 85% routing accuracy at < 5 ms overhead?
2. What supersession precision is achievable without an entity graph? (Bounds
   the graph trigger in §8.)
3. Does confidence propagation lift ranking on OUR corpus, not in papers?
4. Injection-resistance ceiling of provenance-labeled context vs dual-model
   screening — which pays?
5. Where is the planner-engagement threshold that keeps P95 flat?

Each question = one experiment = one decision-log row. That is the whole method.

---

## Appendix A — Traceability

| CEO order/topic | Section |
|---|---|
| Routing | §3 | Planning | §4 | Memory | §6–7 | Evaluation | §13 |
| Reflection | §14 | Learning | §14 | Agents | §9 | Multi-agent | §10 |
| Context | §5 | Long-term memory | §7 | Knowledge graph | §8 |
| MCP | §11 | A2A | §11 | Benchmarks | §13 | Cost | §15 |
| Latency | §15 | Safety | §12 | Failure recovery | §16 |
| Model evolution | §17 | Provider strategy | §17 |

**Owner:** Kiro (Principal Systems Engineer) · **Approved pending:** CEO review
**Version:** 1.0 · **Date:** 2026-07-09 · Expansion of any `[RESEARCH]` chapter
into a full sub-paper happens when its milestone activates — depth follows need,
like everything else in this repo.
