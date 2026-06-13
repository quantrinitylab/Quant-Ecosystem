# AGENT HANDOFF — CEO-Assigned Tasks (2026-06-13)

> CEO note: gates are GREEN (typecheck 149/149, build 117/117, both CEO-verified).
> The "fix the build" phase is over. All tasks below target the real gap:
> **75 `@simulated` stubs** — and only on the flagship path. Each task is ONE
> file/feature with explicit acceptance criteria. **Worker agents edit only;
> they do NOT git push. CEO verifies typecheck + reads the diff, then merges.**

---

## Task format

```
## Task: [ID]
- Assigned: [model]   Priority: P0/P1/P2   Status: PENDING/IN_PROGRESS/REVIEW/DONE
- Scope: ONE file/feature only — list exact path(s)
- Do: [what]
- Acceptance: [verifiable]
- Forbidden: touching other files, git push, broad "fix all" behavior
```

---

## Active CEO Tasks (Flagship path: agentic + @quant/ai + QuantMail)

## Task: STUB-001 — Real model routing in @quant/ai
- Assigned: opencode-go/deepseek-v4-pro   Priority: P0   Status: PENDING
- Scope: `packages/ai/src/services/*` (model router / ai.service only)
- Do: replace the simulated/mock model-call path with a real provider call behind
  the existing interface. Use the provider SDK already in deps; if no key at runtime,
  fall back to a clearly-labelled stub — but the REAL path must exist and be the default.
- Acceptance: `npx tsc --noEmit` clean for the package; a unit test that asserts the
  real client is invoked (mock the SDK, assert call shape). No behavior change to callers.
- Forbidden: editing apps/*, other packages, git push.

## Task: STUB-002 — Agent execute() runs a real model turn
- Assigned: opencode-go/deepseek-v4-pro   Priority: P0   Status: PENDING
- Scope: `packages/agentic/src/core/agent.ts` + the agent tool that returns
  `'This is a simulated AI response.'`
- Do: route agent execution through @quant/ai (STUB-001) instead of the hardcoded
  simulated string. Keep memory.store shape intact.
- Acceptance: package typechecks; a test asserts execute() calls the ai service and
  returns its result. Depends on STUB-001.
- Forbidden: editing orchestrator public signatures, apps/*, git push.

## Task: STUB-003 — QuantMail triage→draft uses the real agent
- Assigned: opencode-go/qwen3.7-max   Priority: P1   Status: PENDING (blocked by STUB-002)
- Scope: `apps/quantmail/backend/` mail-AI route/service only
- Do: wire the mail draft/triage endpoint to the real agent loop. Replace any mock
  reply with the agent result.
- Acceptance: quantmail backend typechecks; an integration test (mocked model) shows
  a request → agent → drafted reply flow.
- Forbidden: frontend rework, other apps, git push.

## Task: STUB-AUDIT — Map the 75 stubs by app + priority
- Assigned: opencode-go/deepseek-v4-flash   Priority: P1   Status: PENDING
- Scope: read-only; write findings to `STUB-INVENTORY.md`
- Do: list every `@simulated` occurrence grouped by app/package, one line each with
  what it fakes and a P0/P1/P2 for the flagship path.
- Acceptance: STUB-INVENTORY.md with all 75, no code changes.
- Forbidden: editing any source, git push.

---

## Stale tasks (superseded — gates already green)
- ~~TASK-001 Run quality gates~~ → DONE (CEO-verified green)
- ~~TASK-002 Clean build artifacts~~ → DONE (.gitignore updated by CTO)
- ~~TASK-003 Push commits~~ → DONE (synced with origin/main)
