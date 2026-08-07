# Quant Ecosystem Project Memory

This folder preserves durable, project-safe memory for Tyccy and authorized agents working on `quantrinitylabsgo/Quant-Ecosystem`.

## Authority boundary

This folder is detailed **supporting context**, not a second source of canonical truth.

When claims conflict, follow the repository authority order:

1. executable code, tests, migrations, and blocking CI evidence;
2. `docs/QUANT_FOUNDATION.md`;
3. accepted ADRs;
4. `docs/CURRENT_STATE.md` for verified state;
5. `docs/EXECUTION_QUEUE.md` for the one active milestone;
6. this folder for owner intent, reconstructed history, and session continuity.

Verified conclusions must be promoted to the owning canonical file. Never let a chat summary silently override code, CI, an ADR, Current State, or the Execution Queue.

## Read order

1. [`CURRENT_CHECKPOINT.md`](./CURRENT_CHECKPOINT.md)
2. [`OWNER_INTENT_AND_VISION.md`](./OWNER_INTENT_AND_VISION.md)
3. [`DECISIONS_AND_PRINCIPLES.md`](./DECISIONS_AND_PRINCIPLES.md)
4. [`WORKSTREAM_STATUS.md`](./WORKSTREAM_STATUS.md)
5. [`ROADMAP_AND_OWNERSHIP.md`](./ROADMAP_AND_OWNERSHIP.md)
6. [`ENGINEERING_HISTORY.md`](./ENGINEERING_HISTORY.md)
7. [`BRAND_DESIGN_UIUX.md`](./BRAND_DESIGN_UIUX.md)
8. [`SECURITY_AUTH_TRUST.md`](./SECURITY_AUTH_TRUST.md)
9. [`INFRA_DEPLOYMENT_ACCESS.md`](./INFRA_DEPLOYMENT_ACCESS.md)
10. [`RISKS_BLOCKERS_OPEN_QUESTIONS.md`](./RISKS_BLOCKERS_OPEN_QUESTIONS.md)
11. [`sessions/`](./sessions/) for dated reconstruction checkpoints
12. [`memory-index.json`](./memory-index.json) for machine-readable bootstrap

Latest checkpoint: [`2026-08-07 — production hardening and live cloud truth`](./sessions/2026-08-07-production-hardening-and-cloud-truth.md).

## Memory rules

- Store project conclusions, decisions, evidence, ownership, progress, and next actions.
- Separate `merged`, `open`, `draft`, `blocked`, `superseded`, and `deployed` states.
- Cite issue, PR, commit, test, run, or source paths for implementation claims.
- Append meaningful history; do not erase failed experiments or prior decisions.
- Keep `CURRENT_CHECKPOINT.md` current after substantial sessions.
- Add one dated session note after each major reconstruction or milestone.
- Do not store secrets, tokens, passwords, personal email addresses, raw private chats, or unrelated personal conversations.
- Do not claim a GitHub write, cloud mutation, deployment, or DNS change unless the resulting evidence is visible.

## Update trigger

Update this folder when a focused PR changes state, a required gate changes, owner priority changes, deployment access changes, a design/security contract changes, or a new blocker invalidates prior assumptions.
