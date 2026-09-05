# QuantGit — Agentic Workspace Architecture

**Status:** DRAFT FOR CEO SIGN-OFF · authored 2026-09-05 · owner: Claude (Opus) + Antigravity (Gemini)
**Supersedes:** nothing. **Depends on:** `.agents/project-memory/OWNER_INTENT_AND_VISION.md`, `.agents/state/quant-product-vision.md`

This document exists so that QuantGit does not get built twice, does not stall on an
undecided question, and does not ship a demo that quietly fakes its own results.
Every claim below was verified against the code on 2026-09-05. Nothing here is aspirational
unless it is explicitly marked `PLANNED` or `MISSING`.

---

## 0. What QuantGit is

An agentic workspace: the user describes an outcome, a **CEO agent** plans it, spawns role
agents, and those agents coordinate with each other — like an office floor — until the
outcome is delivered with evidence. Work is not limited to coding. Marketing, research,
outreach, and analysis are first-class.

It is the concrete implementation of the North Star's stated moat:

> model-agnostic orchestration + durable user-owned memory + trusted cross-app execution + evaluation

QuantMail proves we can ship. **QuantGit is the thing that is actually novel.**

## 0.1 Reference product studied

`munderdiffl.in` — an Office-themed agent-clone product. Studied 2026-09-05. What it gets right,
and what we deliberately take from it:

| Take                                                                                                                                                                        | Why                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Spend/runaway **circuit breaker** as a first-class setting: floor token budget, token velocity (tok/min), repeated-tool limit, error-storm limit, **steer-first then kill** | Without this an autonomous floor burns real money in hours. This is the single best idea in their product. |
| **Agent↔agent messaging** as the coordination primitive, not a central queue                                                                                                | "One agent blocked → messages another" is how an office actually unblocks itself.                          |
| **Deterministic, token-free simulation view** of the floor                                                                                                                  | You can watch (and replay, and demo) the office without spending a rupee.                                  |
| **4-step agent creation**: Identity → Workspace → Engine → Briefing                                                                                                         | Correct decomposition. Copy the shape.                                                                     |
| **Engine-agnostic wrapping** of whatever model/CLI the user already pays for                                                                                                | Matches our own `AIEnginePort` seam and `@quant/user-owned-ai`.                                            |
| Per-agent **isolated git worktree**                                                                                                                                         | Prevents agents trampling each other. We already use this pattern internally.                              |
| Presence-aware behaviour (`3AM · CLONES SHIP`, `0/4 HUMANS`)                                                                                                                | Turns "agent" into "colleague". Cheap to build, high perceived value.                                      |

| Reject                                                                                | Why                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Office characters** (Michael/Jim/Pam/Dwight) and the Dunder-Mifflin-parody name | NBCUniversal IP. We are now a registered company with real liability. Use **Quanty variants** — we already have a 35-expression mascot sheet and Default/Orange/White variants. Our own IP, and a better brand fit. |
| Laptop-only execution as the _only_ model                                             | Our surface is a web app. See D2.                                                                                                                                                                                   |
| Per-seat flat pricing with unmetered agents                                           | Their inference cost is ₹0 (user's own subscription). Ours is not. See D2.                                                                                                                                          |

---

## 1. Decisions that must be locked before any code is written

These are the only four questions that can cause rework or delay. Everything else is downstream.

### D1 — Where does QuantGit's engine live? `AWAITING CEO`

**The mismatch that will cause confusion if not settled now.** The vision says QuantGit is part of
QuantMail. The code says otherwise — the entire agent engine is already wired into **QuantAI**:

- `apps/quantai/backend/routes/agent-swarm.ts` → `@quant/agent-swarm`
- `apps/quantai/backend/routes/agent-runtime.ts` → `@quant/agent-runtime` (the 12 pilots)
- `apps/quantai/backend/routes/code-agent.ts` → `@quant/code-agent`
- `apps/quantai/src/app/api/agents/swarm/goals/**` + `src/features/agents/useAgentSwarm.ts`
- `apps/quanttrinity/src/lib/ai-employee-runtime.ts` → the owner console's "AI employees"

**Recommendation: do not move a single line.** Declare `quantai-backend` the ecosystem's
**agent plane** (it is already deployed and has a real `server.ts`), and make QuantGit the
**product surface in QuantMail** that talks to it over HTTP. QuantMail already has the shell:
`src/app/codehub/`, `src/app/repos/`, `src/app/pipelines/`.

Rationale: migrating ~25k LOC of working agent code between apps buys nothing a URL cannot,
and it is exactly the kind of move that adds three weeks for zero user-visible gain.

### D2 — Who pays for inference and compute? `AWAITING CEO`

This decides the pricing page, the sandbox budget, and whether we survive the first 100 users.

| Model                                                                                                                                     | Our marginal cost                                                                                         | Needs                                              | Verdict                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| **A · Pure cloud** — we host models + sandboxes                                                                                           | **High.** One agent on a real task can burn more tokens in an hour than a $20/mo plan covers for a month. | Bedrock quota (stuck in AWS review), hard metering | Only viable with strict credit metering |
| **B · BYOK / local harness** — desktop app wraps the user's own Claude Code / Codex / Gemini CLI                                          | **~₹0**                                                                                                   | A desktop shell (Tauri/Electron) we do not have    | Best economics, new surface, later      |
| **C · Hybrid (RECOMMENDED)** — ship cloud-metered first, keep the engine seam clean so the local harness plugs in later without a rewrite | Controlled                                                                                                | Nothing new — the seam already exists              | **Ship this**                           |

The seam already exists and is clean: `packages/agent-runtime/src/ai-engine.interface.ts`
defines `AIEnginePort { infer, classify, embed }` and it already reports
`usage: { tokens, cost }`. `@quant/user-owned-ai` (2,460 LOC, 8 test files) already has
`byom-engine.ts`, `encrypted-key-vault.ts`, `local-first-router.ts` and `model-registry.ts`.
**The BYOK story is 70% built.** Path B is a later milestone, not a rewrite.

### D3 — Sandbox technology `AWAITING GEMINI'S ASSESSMENT, THEN CEO`

An agent that can run code without isolation is a remote-code-execution hole in a company that
now has legal liability. This is the **single hard blocker** for QuantGit (see §2).

| Option                                       | Isolation                     | Ops cost                 | Note                                                                                                   |
| -------------------------------------------- | ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **K8s Job + gVisor (`runsc`) (RECOMMENDED)** | Strong (syscall interception) | Low — we already run EKS | **Requires EC2 managed node groups; gVisor cannot run on Fargate.** Gemini must confirm our node type. |
| Firecracker / Kata microVM                   | Strongest                     | High                     | Revisit at scale                                                                                       |
| Third party (E2B / Daytona / Modal)          | Strong                        | Lowest to ship           | Customer code leaves our cluster — bad fit for the "trusted execution" claim                           |

Non-negotiable properties whichever is chosen: one sandbox per task, non-root, read-only
rootfs except a workspace volume, `NetworkPolicy` default-deny with an explicit egress allowlist
(our git-server, npm, PyPI), CPU/memory limits, `activeDeadlineSeconds`, no cluster credentials
mounted, and every command written to the audit trail before it runs.

### D4 — Mascot and floor identity `RECOMMENDATION, needs CEO confirm`

Use **Quanty variants** as the agent avatars, from the existing AI ROBOT 3D MODEL SHEET
(Default / Orange / White, 35 named expressions). Do not use licensed characters. The floor art
must be built in the praised medium (3D/WebGL/Canvas), consistent with the existing
Quant-Ecosystem logo — which remains off-limits and unchanged.

---

## 2. Verified reality: what already exists, what is theatre

Checked against the code on 2026-09-05. **This section is the reason the timeline is credible** —
QuantGit is not a greenfield build. It is ~25,000 LOC of scaffolding with two holes in it.

### 2.1 Real and working

| Component                               | Path                                                                             | Evidence                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git Smart HTTP server**               | `services/git-server/`                                                           | Genuinely spawns `git upload-pack --stateless-rpc`, `git receive-pack --stateless-rpc`, `git init --bare`. 7 test files. **Correction to an earlier note: QuantGit's git protocol is NOT missing — it is real.** |
| **Swarm orchestrator state machine**    | `packages/agent-swarm/src/orchestrator/swarm-orchestrator.ts` (196 L)            | Goal → decompose → sub-goals with priorities + dependency gating → assign → complete/fail → retry with exponential backoff → cancel → progress → timeout, plus observation hooks. Clean and correct.             |
| **Per-agent budget ledger**             | `packages/agent-swarm/src/budget/swarm-budget.ts` (152 L)                        | tokens/cost/time per agent, `isOverBudget`, `shouldPause` at 80%, alert thresholds 80/90/100%, sub-goal allocation, budget transfer between agents, full history. **~70% of the circuit breaker we want.**       |
| **Agent↔agent bus + shared scratchpad** | `packages/agent-swarm/src/bus/message-bus.ts`, `scratchpad/shared-scratchpad.ts` | The coordination primitive.                                                                                                                                                                                      |
| **12 role pilots**                      | `packages/agent-runtime/src/agents/*.ts` (13,853 L total pkg)                    | code · content · email · finance · health · learning · meeting · research · schedule · shopping · social · travel                                                                                                |
| **Trust & safety scaffolding**          | `packages/agent-runtime/src/`                                                    | `approval-queue.ts`, `audit-trail.ts`, `kill-switch.ts` (55 L), `spending-limit.ts` (189 L), `permissions.ts`, `safety-classifier.ts`, `trust-score.ts`, `undo-engine.ts`, `conflict-resolver.ts`                |
| **Provider health breaker**             | `packages/ai/src/core/circuit-breaker.ts` (203 L)                                | Real closed/open/half-open with reset timeout. Different axis from spend — both are needed.                                                                                                                      |
| **BYOK / bring-your-own-model**         | `packages/user-owned-ai/` (2,460 L, 8 test files)                                | `byom-engine.ts`, `encrypted-key-vault.ts`, `local-first-router.ts`, `model-registry.ts`, `daily-allowance.service.ts`, `spend-dashboard.service.ts`                                                             |
| **Cross-app command bus**               | `packages/agentic/` (7,571 L, 34 importers)                                      | `cross-app/command-bus.ts`, `app-controller.ts`, `coordination/cross-app-coordinator.ts`, `communication/agent-communication.ts`                                                                                 |
| **Vector memory backend**               | `packages/ai/src/adapters/qdrant-vector-backend.ts`                              | The semantic-search half of MemPalace                                                                                                                                                                            |
| **Memory store + export**               | `packages/ai-memory/` (1,537 L)                                                  | `memory-store.ts`, `memory-export.ts`, `memory-explainer.ts`                                                                                                                                                     |
| **UI shell routes**                     | `apps/quantmail/src/app/{codehub,repos,pipelines}/`                              | Pages exist and render                                                                                                                                                                                           |

### 2.2 Theatre — looks finished, does nothing

These must be fixed or removed. Shipping any of them into a demo is a credibility event.

| #      | What                                                       | Path                                                             | The actual code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | **CI execution is entirely fake and always reports green** | `services/ci-runner/src/executor.ts:28-32`                       | It loops over `job.script` and pushes `$ <line>` then `[OK] <line>` into stdout, then returns `exitCode: 0, status: 'success'`. There is **no `child_process`, no container, nothing** — a grep for `spawn\|child_process\|docker\|firecracker` across `services/ci-runner/src/` returns **zero matches**. The `catch` block is unreachable because nothing in the loop can throw, so `status: 'failed'` is dead code. **Every pipeline in QuantMail reports success regardless of the commit.** A green light that cannot go red is worse than no light. |
| **T2** | **The only sandbox implementation is a mock**              | `packages/code-agent/src/sandbox/code-sandbox.ts:8`              | `MockCodeSandbox` (35 L) returns `` `executed: ${command}` ``. `grep "implements ICodeSandbox"` across the repo finds **only** this class. The `ICodeSandbox` interface is the right seam — nothing real sits behind it.                                                                                                                                                                                                                                                                                                                                  |
| **T3** | `AgentSandbox` is a 47-line shell                          | `packages/agent-runtime/src/sandbox.ts`                          | No process execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **T4** | The code agent cannot read a repo                          | `packages/code-agent/src/repo/repo-client.ts:37`                 | `return 'mock diff output';`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **T5** | **The orchestrator has no planner**                        | `packages/agent-swarm/src/orchestrator/swarm-orchestrator.ts:42` | `decompose(gid, descs: string[])` — **the caller must supply the plan.** Nothing calls an LLM to produce it. The state machine is real; the intelligence is absent.                                                                                                                                                                                                                                                                                                                                                                                       |
| **T6** | The 12 pilots are rule-based                               | `packages/agent-runtime/src/agents/*.ts`                         | Confirmed by `QUANT_ECOSYSTEM_COFOUNDER_BRIEF.md:152`. They implement `AIEnginePort` but are not LLM-driven.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **T7** | `ci-runner` is not deployed                                | `infra/k8s/`                                                     | No manifest for it exists at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 2.3 Duplication — the real delay risk

The user's brief was explicitly _"so there is no confusion and no product delay."_ The largest
source of both is not missing code. **It is four parallel implementations of the same ideas:**

- **Two orchestrators** — `packages/agent-swarm/src/orchestrator/swarm-orchestrator.ts` (196 L) and `packages/agent-runtime/src/orchestrator.ts` (194 L)
- **Two decomposers** — `swarm-orchestrator.decompose()` and `packages/agent-runtime/src/task-decomposer.ts`
- **Two sandboxes** — `packages/code-agent/src/sandbox/code-sandbox.ts` and `packages/agent-runtime/src/sandbox.ts` (both fake)
- **Four spend trackers** — `agent-swarm/src/budget/swarm-budget.ts`, `agent-runtime/src/spending-limit.ts`, `agent-runtime/src/cost-tracker.ts`, `packages/ai/src/core/cost-tracker.ts`
- Plus three competing AI provider implementations already on record

**Decision D5 (mine to make, recording it here): one of each, chosen by evidence.**

| Concern         | Winner                                         | Loser — delete or make a thin re-export |
| --------------- | ---------------------------------------------- | --------------------------------------- |
| Orchestration   | `@quant/agent-swarm` `SwarmOrchestrator`       | `agent-runtime/src/orchestrator.ts`     |
| Spend ledger    | `@quant/agent-swarm` `SwarmBudget`             | the other three                         |
| Sandbox         | **new** `@quant/sandbox` behind `ICodeSandbox` | both existing fakes                     |
| Provider health | `@quant/ai` `CircuitBreaker`                   | — (no duplicate)                        |
| Pilots / roles  | `@quant/agent-runtime` `agents/*`              | — (no duplicate)                        |

`SwarmOrchestrator` wins on dependency gating, retry/backoff and observation hooks.
`SwarmBudget` wins on allocation, transfer and threshold alerts. Neither loser has a capability
the winner lacks. **Nothing is deleted until its importers are migrated and green.**

---

## 3. Target architecture

```
                    QuantMail  /codehub   ·   the Office Floor UI
                    (Next.js · deterministic replay · zero tokens to watch)
                                     │  HTTPS + one JWT (shared issuer)
                                     ▼
  ┌──────────────────────────── AGENT PLANE  (quantai-backend) ────────────────────────────┐
  │                                                                                        │
  │   L7  TRUST         approval-queue · audit-trail · undo-engine · trust-score            │
  │                     permissions · safety-classifier      (every action logged first)    │
  │   L6  GOVERNOR      FloorGovernor  = SwarmBudget + velocity + tool-loop + error-storm   │
  │                     steer → constrain → kill      (kill-switch.ts)                      │
  │   L5  CEO AGENT     Planner (LLM)  →  SwarmOrchestrator (goal · sub-goals · deps)       │
  │   L4  ROLE AGENTS   engineer · reviewer · researcher · marketer · writer · support ·    │
  │                     analyst · scheduler        (= @quant/agent-runtime pilots)          │
  │   L3  COORDINATION  message-bus (agent↔agent) · shared-scratchpad                       │
  │   L2  MEMORY        MemPalace = ai-memory store + qdrant vectors + QuantDrive docs      │
  │   L1  ENGINE        AIEnginePort → Bedrock | OpenRouter | BYOK (user-owned-ai)          │
  └────────────────────────────────────────────────────────────────────────────────────────┘
             │                                    │
             ▼                                    ▼
  L0a  GIT SUBSTRATE                    L0b  SANDBOX  ⚠ MISSING — THE BLOCKER
  services/git-server (REAL)            one K8s Job per task · gVisor · non-root
  worktree isolated per agent           default-deny egress · deadline · no cluster creds
```

**Reading the diagram:** everything from L1 to L7 exists in some form today. L0a is real. **L0b is
the hole.** The CEO-agent planner at L5 is the second hole. Those two are the whole project.

### 3.1 The FloorGovernor spec — build this before the first autonomous agent runs

This is the Munder-Difflin idea we are copying most directly, and it is what stops an autonomous
floor from spending the seed grant in a weekend. It extends `SwarmBudget` rather than replacing it.

| Guard               | Trip condition                                          | Response                                                                            |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Floor token budget  | total tokens across all agents ≥ limit                  | **steer** at 80%, **constrain** at 90%, **stop** at 100%                            |
| Token velocity      | tokens/minute over a rolling 60 s window ≥ limit        | constrain (queue the agent, do not kill)                                            |
| Repeated-tool limit | same tool + near-identical args N times in a row        | constrain + inject a corrective system note                                         |
| Error-storm limit   | N consecutive tool errors                               | constrain, then escalate to the CEO agent                                           |
| Wall-clock deadline | per sub-goal, from `budget.maxTimeMs` (already present) | stop                                                                                |
| Hard stop           | user toggle, default **OFF**                            | when OFF: steer-first (recommended). when ON: `kill-switch.ts` terminates the agent |

Three-stage response (steer → constrain → stop) is deliberate: killing an agent loses its context
and the user pays again to redo the work. Steering is cheaper than restarting.

**Non-negotiable:** the governor is evaluated **server-side, before** each engine call and each
tool call. A client-side limit is not a limit.

### 3.2 Agent creation — 4 steps

Adopting the reference product's decomposition, because it is correct:

1. **Identity** — name · Quanty variant · accent colour (from the locked palette; `#FF8C42` reserved for primary actions, agents pick from the secondary set)
2. **Workspace** — repo · branch · isolation (`worktree` | `clean-clone`) · resume-from-last-session
3. **Engine** — provider · model · effort/thinking level · optional BYOK key
4. **Briefing** — role description · goal · success criteria · autonomy level

Plus: **import a hire** from a `.json` manifest, and **generate a hire with AI** from a one-line
description. A hire manifest is portable and shareable — that is a growth loop, not a feature.

### 3.3 Memory — where we are genuinely ahead

The reference product's MemPalace is per-machine, synced E2E. Ours is better by construction,
because the North Star already requires it: **memory lives in QuantDrive and is shared across
every app.** An agent that read the user's mail, calendar and documents starts from a context
no laptop-local tool can reach.

Three tiers, all already partly built:

| Tier               | Content                                                                 | Storage                                         |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------- |
| **Org memory**     | shared with every agent — conventions, decisions, standing instructions | `ai-memory` store, markdown, user-editable      |
| **Agent memory**   | one agent's durable facts across sessions                               | same store, scoped by agent id                  |
| **Run scratchpad** | ephemeral, one goal                                                     | `shared-scratchpad.ts`, discarded on completion |

Retrieval is both **exact** (text search across board/tasks/memory) and **semantic**
(`qdrant-vector-backend.ts`). Memory must be **correctable, supersedable, forgettable and
exportable** — `OWNER_INTENT_AND_VISION.md` commits us to this and `ai-memory/memory-export.ts`
already exists. **This is the moat. It is not optional.**

### 3.4 The Office Floor UI

A **pure view over the orchestrator's event stream.** It renders from the audit trail, which means:

- **Watching costs zero tokens.** The simulation is deterministic — same events, same animation.
- **Any past run replays exactly.** This is the investor demo: replay a real run, spend nothing.
- Two modes: the themed floor, and a dense fullscreen ops view for real work.
- Presence: `9AM · ALL IN` / `2PM · SOME AWAY` / `3AM · AGENTS SHIP` derived from real activity.
- Click an agent → inspect card: role, engine wrapped, online state, current action, spend so far.

Command Center tabs (from the reference, mapped to our surfaces): terminal · monitor · tasks ·
ask-me · schedules · **memory** · graph · activity · commands · workers.

**Build order note:** the floor is the last thing built, not the first. It is a view. If the
event stream is right, the floor is a weekend. If the event stream is wrong, a beautiful floor
is a lie with animation.

---

## 4. Data model

Prisma-shaped, because the stack is Prisma 6.19.3. This is the contract between the agent plane
and the UI: **if it is not in this list, the floor cannot render it, and if the floor cannot
render it, it did not happen.** Every mutating action produces an `AuditEvent` — that is what
makes replay possible.

| Model             | Key fields                                                                                                                                      | Notes                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Floor`           | `id` `userId` `name` `presenceMode` `tokenBudget` `tokenSpent` `hardStopEnabled`                                                                | One per workspace. The governor's ceiling lives here, not per-agent.                                       |
| `Agent`           | `id` `floorId` `name` `role` `quantyVariant` `accentColour` `engineProvider` `engineModel` `effort` `byokKeyId?` `briefing` `autonomy` `status` | The 4-step wizard writes exactly this row. `byokKeyId` points into `encrypted-key-vault`, never a raw key. |
| `Workspace`       | `id` `agentId` `repoId` `branch` `isolation` (`worktree`\|`clean-clone`) `resumeFromLast`                                                       | Step 2 of the wizard. One workspace per agent, not per task.                                               |
| `Goal`            | `id` `floorId` `description` `status` `budgetTokens` `budgetCost` `budgetMaxTimeMs` `createdBy` (`user`\|`ceo-agent`)                           | Maps 1:1 to `SwarmOrchestrator.createGoal`.                                                                |
| `SubGoal`         | `id` `goalId` `description` `priority` `dependsOn[]` `assignedAgentId?` `status` `retryCount`                                                   | Maps 1:1 to `decompose()`. `dependsOn` is what gates assignment today.                                     |
| `Run`             | `id` `subGoalId` `agentId` `startedAt` `endedAt?` `exitReason` `tokensUsed` `costUsd`                                                           | One attempt. A retry is a new `Run`, so the history survives.                                              |
| `ToolCall`        | `id` `runId` `seq` `tool` `argsHash` `resultSummary` `durationMs` `error?`                                                                      | `argsHash` is what the repeated-tool guard compares. Store the hash, not the args, so the guard is cheap.  |
| `Message`         | `id` `floorId` `fromAgentId` `toAgentId` `kind` `body` `readAt?`                                                                                | Agent↔agent, over `message-bus.ts`. This is the coordination record the floor animates.                    |
| `ScratchpadEntry` | `id` `goalId` `agentId` `key` `value`                                                                                                           | Ephemeral, deleted on goal completion.                                                                     |
| `MemoryEntry`     | `id` `scope` (`org`\|`agent`) `agentId?` `text` `embeddingId?` `supersededById?` `forgottenAt?`                                                 | Correctable, supersedable, forgettable — the North Star commitment, encoded as columns.                    |
| `SandboxSession`  | `id` `runId` `k8sJobName` `image` `startedAt` `endedAt?` `exitCode?` `timedOut` `egressAllowlist[]`                                             | One per task. Written **before** the Job is created.                                                       |
| `AuditEvent`      | `id` `floorId` `actorType` `actorId` `verb` `target` `payload` `at` `seq`                                                                       | Append-only, monotonic `seq`. **The floor renders from this table alone.**                                 |
| `Approval`        | `id` `runId` `action` `risk` `state` `decidedBy?` `decidedAt?`                                                                                  | `approval-queue.ts` already implements the state machine.                                                  |
| `BudgetLedger`    | `id` `floorId` `agentId?` `subGoalId?` `tokens` `cost` `timeMs` `at`                                                                            | `SwarmBudget`'s in-memory history, persisted. Velocity is a window query over this.                        |
| `GovernorTrip`    | `id` `floorId` `agentId?` `guard` `stage` (`steer`\|`constrain`\|`stop`) `detail` `at`                                                          | Every intervention is visible to the user. A silent throttle is indistinguishable from a bug.              |

Two rules that are easy to get wrong:

- **`AuditEvent.seq` must be assigned server-side and gapless per floor.** Replay is ordered by
  `seq`, not by timestamp — two events in the same millisecond are common under concurrency.
- **`SandboxSession` is written before the Job exists, not after.** If the pod is killed before
  it reports, we still have the record of what we intended to run. Audit-after-the-fact loses
  exactly the cases you care about.

---

## 5. The Office Floor UI — spec

Lives at `apps/quantmail/src/app/codehub/` (the shell already exists). Obeys the QuantMail design
system without exception: `#FF8C42` for primary actions only, `#111318` cards on `#090A0C`,
`#282C35` borders, inline SVG icons only — **no decorative emoji anywhere** — 44px minimum touch
targets, `focus-visible:ring-2 focus-visible:ring-[#FF8C42]`, and
`shadow-[0_4px_16px_rgba(0,0,0,0.6)]` instead of coloured glows. No card inside a card.

The floor art is built in the **praised medium — 3D / WebGL / Canvas** — to the same bar as the
existing Quant-Ecosystem logo. That logo itself stays untouched.

### 5.1 Two modes, one data source

| Mode      | Purpose                                                                             | Notes                                          |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Floor** | the themed room: desks, Quanty agents, walk-to-desk when one agent messages another | The demo view. Deterministic.                  |
| **Ops**   | dense fullscreen: goal tree, live log, spend, governor trips                        | The working view. Default for returning users. |

Both render from `AuditEvent` ordered by `seq`. Nothing in the UI calls the engine.
**Watching the floor costs zero tokens, and any past run replays byte-identically.** That single
property is both the investor demo and the debugging tool.

### 5.2 Command centre tabs

`terminal` · `monitor` · `tasks` · `ask-me` · `schedules` · `memory` · `graph` · `activity` ·
`commands` · `workers`

- **terminal** — read-only stream of `ToolCall` + sandbox stdout for the selected run.
- **monitor** — floor spend, token velocity sparkline, governor state, per-agent cost.
- **tasks** — the `Goal`/`SubGoal` tree with dependency edges and retry counts.
- **ask-me** — the queue of `Approval` rows the agents are blocked on. **This is the trust surface.**
- **schedules** — recurring goals (cron-shaped), owned by the CEO agent.
- **memory** — org and per-agent `MemoryEntry`, editable, with supersede and forget as first-class
  buttons. Exact text search plus semantic search over `qdrant-vector-backend.ts`.
- **graph** — agent↔agent `Message` edges over time. Shows who unblocked whom.
- **activity** — the raw audit trail, filterable, exportable.
- **commands** — the palette: create goal, hire agent, pause floor, hard stop.
- **workers** — the roster with engine wrapped, status, and spend-to-date.

### 5.3 Agent inspector card

Opened by clicking an agent on the floor. Four lines, in this order:

```
  ROLE      engineer
  WRAPS     claude-opus-5  ·  BYOK           <- which engine, and whose key pays
  STATUS    working · sub-goal 3 of 7
  NOW       running `pnpm test` in sandbox   <- the current ToolCall, live
  SPEND     41.2k tokens · $0.61 · 12m       <- from BudgetLedger, not estimated
```

Presence line on the floor header, derived from real activity — never faked:
`9AM · ALL IN` / `2PM · SOME AWAY` / `3AM · AGENTS SHIP` / `0/4 HUMANS`.

### 5.4 The hire wizard

Four steps (§3.2), plus two shortcuts that matter more than they look:

- **Import a hire** from a `.json` manifest — portable, shareable, reviewable in a PR.
- **Generate a hire with AI** from one line of description — fills all four steps, user edits.

A manifest that a user can post publicly and another user can import is a growth loop. Build the
export button in the same PR as the import.

---

## 6. Roles → existing pilots

Nine of the twelve pilots in `@quant/agent-runtime` map directly onto the office roles. **No new
role package is needed** — the pilots need an LLM behind them (T6), not a rewrite.

| Floor role         | Pilot(s)                                      | Status                                          |
| ------------------ | --------------------------------------------- | ----------------------------------------------- |
| CEO / orchestrator | _new_ `PlannerAgent` → `SwarmOrchestrator`    | **MISSING — hole #2**                           |
| engineer           | `code-pilot`                                  | exists, rule-based, needs sandbox               |
| reviewer           | `code-pilot` + `code-audit.ts`                | exists                                          |
| researcher         | `research-pilot`                              | exists                                          |
| marketer           | `content-pilot` + `social-pilot`              | exists                                          |
| writer             | `content-pilot`                               | exists                                          |
| support            | `email-pilot`                                 | exists — and it already has real QuantMail data |
| analyst            | `finance-pilot`                               | exists                                          |
| scheduler          | `schedule-pilot` + `meeting-pilot`            | exists — real QuantCalendar data                |
| _(unmapped)_       | `health` · `learning` · `shopping` · `travel` | consumer pilots, not office roles. Leave them.  |

`support`, `scheduler` and `writer` are the interesting ones: they are the roles where **our
memory advantage is visible immediately**, because the mail and calendar data is already ours.
An engineer agent is table stakes; a support agent that has read the actual inbox is not.

---

## 7. Sandbox implementation spec — the brief for Antigravity

This is D3 made concrete. It is the **critical path**: nothing else in QuantGit can ship first,
because an agent that runs code without isolation is a remote-code-execution hole in a company
that now has legal liability.

**Shape:** one Kubernetes `Job` per task, created by the agent plane, torn down on completion.
Not a warm pool in v1 — a warm pool is an optimisation and it weakens isolation.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: qg-sbx-<runId> # runId, so the audit row and the Job are joinable
  labels: { app: quantgit-sandbox, runId: '<runId>' }
spec:
  backoffLimit: 0 # a retry is a new Run, decided by the orchestrator
  activeDeadlineSeconds: 900 # hard wall-clock ceiling, independent of the governor
  ttlSecondsAfterFinished: 300 # logs collected, then gone
  template:
    spec:
      runtimeClassName: gvisor # <-- REQUIRES EC2 managed node groups. NOT Fargate.
      automountServiceAccountToken: false # no cluster credentials, ever
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: task
          image: <pinned digest, not a tag>
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ['ALL'] }
          resources:
            requests: { cpu: '250m', memory: '512Mi' }
            limits: { cpu: '2', memory: '4Gi', ephemeral-storage: '8Gi' }
          volumeMounts:
            - { name: workspace, mountPath: /workspace }
            - { name: tmp, mountPath: /tmp }
      volumes:
        - { name: workspace, emptyDir: { sizeLimit: 8Gi } }
        - { name: tmp, emptyDir: { sizeLimit: 1Gi } }
```

Plus a `NetworkPolicy` that is **default-deny egress** with an explicit allowlist — our
`git-server` service, the npm registry, PyPI, and nothing else. No cluster-internal access, no
metadata endpoint (`169.254.169.254` must be denied explicitly; gVisor does not block it for you).

### 7.1 The five questions only Antigravity can answer

1. Are the `quant-staging-eks` node groups **EC2 managed node groups or Fargate?** gVisor
   cannot run on Fargate. If we are Fargate-only, D3 changes to Kata or a third party and the
   cost model changes with it.
2. Can a `RuntimeClass` named `gvisor` be installed on the staging cluster, and what is the
   node-level install (containerd `runsc` shim) that it needs?
3. Per-task `Job` vs a warm pool: what is the measured cold-start, and what does 100 tasks/day
   cost on our current node type?
4. Should `services/ci-runner` deploy as a long-lived `Deployment` that creates Jobs, or as a
   Job controller? It currently has **no manifest at all** (T7).
5. The egress allowlist — is it `NetworkPolicy` on the CNI we run, or does it need Cilium /
   a security group per pod?

### 7.2 The TypeScript side (mine)

New package `@quant/sandbox`, implementing the **existing** `ICodeSandbox` interface from
`packages/code-agent/src/sandbox/code-sandbox.ts` — the interface is right, only the
implementation is fake. Two implementations behind it:

- `K8sJobSandbox` — production. Creates the Job, streams logs, writes `SandboxSession` first.
- `LocalDockerSandbox` — development, so a contributor without a cluster can still work.

`MockCodeSandbox` stays, but **only** as a test double, exported from a `/testing` subpath so it
can never be imported by production code by accident. `packages/agent-runtime/src/sandbox.ts`
(the 47-line `AgentSandbox`) becomes a thin re-export and is deleted once its importers move.

---

## 8. Milestones and hard gates

Ordered by dependency, not by visibility. The gates are the point: each one is a thing that
**cannot be faked**, which is how we avoid shipping another green light that cannot go red.

| #      | Milestone                                 | Gate — the thing that proves it                                                                                                                                                              |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | Real sandbox behind `ICodeSandbox`        | A task runs `exit 3` and the `Run` records exit code 3. A task tries to reach a non-allowlisted host and is refused. Both asserted in CI.                                                    |
| **M2** | Real CI execution                         | `services/ci-runner` spawns work in an M1 sandbox, is deployed (T7), and **a deliberately broken commit turns the pipeline red.** Until a pipeline can fail, it is decoration.               |
| **M3** | LLM planner into `SwarmOrchestrator`      | One sentence of user intent produces a `Goal` with ≥3 `SubGoal`s carrying real `dependsOn` edges, and the orchestrator gates assignment on them.                                             |
| **M4** | `FloorGovernor`                           | Given a synthetic runaway agent, the governor steers at 80%, constrains at 90%, stops at 100%, and every intervention writes a `GovernorTrip`. **No autonomous agent runs before M4 lands.** |
| **M5** | QuantMail `/codehub` over the agent plane | Create a goal in QuantMail, watch it execute, approve one action, see real spend. One JWT, one login.                                                                                        |
| **M6** | Floor replay view                         | A completed run replays from `AuditEvent` alone with the network disabled — proving zero tokens and full determinism.                                                                        |
| **M7** | BYOK / local harness                      | A user's own key runs a goal end-to-end and our marginal inference cost for that goal is ₹0.                                                                                                 |

**M4 is a safety gate, not a feature gate.** M1→M2→M3 can be built in parallel with M4's design,
but the first unattended agent run happens after M4, not before. That ordering is what stops an
autonomous floor from spending the seed grant in a weekend.

Sequencing note: M1 is blocked on Antigravity's answer to §7.1 Q1. Everything else is ours.

---

## 9. Decision checklist for the CEO

Five answers unblock everything. Nothing below needs research — they are all judgement calls that
are mine to recommend and yours to make.

| #      | Question                                                     | My recommendation                                                                                                                                 | Cost of deciding wrong                                                                                                                                         |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Does QuantGit's engine live in QuantAI or move to QuantMail? | **Leave it in `quantai-backend`.** Declare it the ecosystem's agent plane; QuantGit is the surface in QuantMail that talks to it over HTTP.       | Moving ~25k LOC costs ~3 weeks for zero user-visible gain.                                                                                                     |
| **D2** | Who pays for inference and compute?                          | **Hybrid.** Cloud-metered first with hard credit limits, engine seam kept clean so BYOK plugs in later.                                           | Flat per-seat pricing with unmetered agents loses money per agent-hour. Munder Difflin can charge $20 because the user's own subscription pays; ours does not. |
| **D3** | Sandbox technology                                           | **K8s Job + gVisor**, pending Antigravity confirming we are on EC2 managed node groups.                                                           | Shipping without isolation is an RCE hole in a company with a CIN.                                                                                             |
| **D4** | Floor identity                                               | **Quanty variants** from the existing 35-expression sheet.                                                                                        | The Office characters are NBCUniversal IP. We now have real liability.                                                                                         |
| **D5** | Duplicate orchestrators/budgets/sandboxes                    | _Recorded, mine to make:_ `SwarmOrchestrator` + `SwarmBudget` + new `@quant/sandbox` win; nothing deleted until importers are migrated and green. | Four parallel implementations of the same idea is the single largest source of the confusion and delay you asked me to prevent.                                |

### 9.1 What I need to say plainly before we build

**`services/ci-runner` currently reports success for every commit and is not deployed.** It does
not execute anything — it echoes each script line with `[OK]` and returns `exitCode: 0`. Any demo
that shows a green pipeline today is showing a fabrication. This is fixed by M2, and until M2
lands, **the pipelines UI should not be shown to anyone outside the team.** A green light that
cannot go red is worse than no light.

The good news is larger than the bad news: **QuantGit is not a greenfield build.** ~25,000 lines
of agent scaffolding already exist and most of it is real — the orchestrator state machine, the
budget ledger, the agent↔agent bus, the approval queue, the audit trail, the kill switch, the
BYOK vault, and a genuine Git Smart HTTP server. Exactly **two** things are load-bearing and
missing: a real execution sandbox, and an LLM planner driving the orchestrator. That is why the
timeline is credible, and it is also why the sandbox brief goes to Antigravity today.
