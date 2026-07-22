---
doc_id: quant-institutional-memory-index
doc_type: authority-index
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-07-22
verified_at_commit: 28f2ef50eec492c955a50fc6eb917aa51aa10739
review_by: 2026-08-05
supersedes: []
superseded_by: []
canonical_scope: repository-authority
---

# Quant institutional memory

This index makes Git the durable memory for engineering state. It does not replace code, tests, ADRs, or the AI user-memory subsystem; it defines which evidence wins when claims disagree.

## Authority order

1. Executable code, tests, migrations, and blocking CI evidence establish operational reality.
2. [Quant Foundation](./QUANT_FOUNDATION.md) defines immutable laws.
3. Accepted, non-superseded [ADRs](./adr/README.md) define scoped decisions.
4. [Engineering Bible](./ENGINEERING_BIBLE.md) and domain architecture describe intent.
5. [Current State](./CURRENT_STATE.md) owns commit-pinned facts; the [Execution Queue](./EXECUTION_QUEUE.md) alone owns priority and the active milestone.
6. Active specs describe approved but potentially unimplemented work.
7. Audits, baselines, scoreboards, and decision logs are dated evidence.
8. [Agent artifacts](../.agents/README.md) are non-authoritative working material.

When claims conflict, prefer the higher authority and expose the discrepancy in Current State; never silently rewrite history.

## Resume protocol

For a new session—especially a prompt containing only `continue`—read this index, Current State, Execution Queue, Quant Foundation, and the ADR index, then inspect the active work unit's linked evidence. Verify all implementation claims against the pinned commit or newer code.

## Document classes

| Class            | Examples                     | Rule                                                         |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| Constitution     | Quant Foundation             | Change only through an existential, CEO-approved ADR.        |
| Decision         | ADRs                         | Append/supersede; do not rewrite accepted history.           |
| Current truth    | Current State                | Re-verify after implementation, risk, or gate changes.       |
| Execution        | Execution Queue              | Exactly one active milestone; ordered, evidence-driven work. |
| Evidence         | scoreboards, baselines, logs | Append-only where declared.                                  |
| Guidance         | prompts, roadmaps, audits    | Never overrides current code or accepted decisions.          |
| Working material | `.agents/`                   | Promote verified claims before relying on them.              |

## Update protocol

Update Current State when verified facts, risks, or gate decisions change. Update the Execution Queue when priority or milestone state changes, and update the ADR index with every ADR addition or supersession. Run `pnpm memory:validate` before review; CI enforces the validator and its focused tests.
