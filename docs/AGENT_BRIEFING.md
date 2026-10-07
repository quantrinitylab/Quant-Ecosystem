# Agent Briefing — Read This First

> **Purpose:** onboard ANY agent (Claude, GPT, Gemini, human) into this repo
> with the full vision and the working rules, in one page. The repo itself is
> our shared communication channel: findings go in GitHub issues, changes go
> in PRs with evidence, and decisions live in the documents listed below.

## The Vision (what we are building)

One AI-native account across many surfaces (mail, chat, docs, meet, drive,
video, AI). **The moat is NOT any single app** — clones lose. The moat is the
**shared agentic layer**: one set of agents with shared, user-owned memory
that acts across every app. Incumbents (separate companies' silos) structurally
cannot copy the cross-app loop. Strategy analogy: NVIDIA didn't win on chips,
it won on CUDA — the layer everyone must pass through. Our CUDA is
model-agnostic orchestration + durable user memory + a measurement machine.

Read in this order:

1. `docs/QUANT_FOUNDATION.md` — the constitution (Genome + 7 Laws)
2. `CEO-DIRECTIVES.md` — market positioning, flagship-first discipline
3. `docs/AI_ENGINE_V3_RESEARCH.md` — where the AI engine is going
4. `docs/SYSTEM_MATHEMATICS.md` — the scaling math (100 → 100M users)

## Current State (evidence, not claims)

- **Memory subsystem v1**: frozen contracts (ADR-005…011), hybrid retrieval,
  acceptance state machine. Wired into production paths via a 4-mode facade
  (`legacy | dual_write | shadow | new`) — a HUMAN flips modes, never code.
- **3 shared memory channels** in `@quant/ai`: style, contact, commitments —
  consumed cross-app (mail↔chat↔docs↔meet). See `docs/INTEGRATION_MAP.md`.
- **Measurement machine**: eval suites (memory/routing/safety/extraction),
  version-freeze tooling, append-only baselines (`docs/baselines/`),
  `docs/M11D_DECISION_LOG.md` (every change = one experiment, Keep/Revert
  from data). Two experiments were REVERTED on data — that is the system
  working, not failing.
- **Migration evidence**: `docs/MIGRATION_SCOREBOARD.md`; the shadow pipeline
  has already said HOLD once (correctly).
- **Deploy prep**: `docker-compose.shadow.yml` + `docs/SHADOW_DEPLOY_RUNBOOK.md`.

## Known Honest Gaps (do not "discover" these again — they are tracked)

- Live model access: blocked on a fresh API key (issues #6, #8, #11)
- Deployed-traffic shadow run: needs a host (`SHADOW_DEPLOY_RUNBOOK.md`)
- 37 DEAD packages (#3), duplicate packages (#4), phantom deps (#5)
- Hinglish prose extraction (measured known-hard), injection screening 0%
  baseline (#11), quantube creator-tools unrouted (#36)
- License decision pending; security-workflow claims vs reality (see issues)

## Working Rules (non-negotiable)

1. **Measure before tuning.** No behavior change without a baseline and a
   rerun on the identical corpus. Baselines are read-only forever.
2. **One change per experiment**, decision recorded (Keep/Revert) with data.
3. **Capability + wiring together.** A service nobody routes is shelf-ware.
4. **Trust before intelligence** (Law 7): wrong memories are worse than
   missed ones; precision regressions block, period.
5. **Issues, not commits, for blocked/parked work.** Evidence in every PR.
6. **No secrets in the repo. Ever.** Env only; known dev defaults hard-fail
   in production (`packages/auth/src/lib/secrets.ts`).

## How to Collaborate With the Other Agents

- Post findings as GitHub issues with evidence (file paths, line numbers,
  measured numbers). Tag severity honestly.
- Respond to existing threads before opening duplicates — check the issue
  list and `docs/M11D_DECISION_LOG.md` first.
- PRs must keep gates green: `turbo typecheck` + package test suites.
- The Notion ledger mirrors session history; the repo remains the source of
  truth for engineering state.
