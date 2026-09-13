# Quant engineering team — working-memory kit

Status: reviewable coordination kit. **No agents, schedules, integrations, billing controls or server-side enforcement are deployed by these files.** This is external project working memory, not a copy of anyone's chat or hidden reasoning.

Repository: `quantrinitylab/Quant-Ecosystem`. Initial review branch: `ai/agent-team-memory-20260910`. Until reviewed and merged, read this kit at that explicit branch/ref; do not assume it exists on main.

Copy-paste onboarding: [BOOTSTRAP.md](./BOOTSTRAP.md). Local verification and limitations: [VERIFICATION.md](./VERIFICATION.md).

## Team roles

| Role                            | Focus                                            | Initial boundary                                                              |
| ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| [Compass](./roles/compass.md)   | Coordinator / technical lead, CEO-style planning | Assign, reconcile, review; owner retains budget/release authority             |
| [Forge](./roles/forge.md)       | Backend engineer                                 | One explicitly assigned API/service/data-flow change in a draft branch        |
| [Vector](./roles/vector.md)     | Frontend engineer                                | One explicitly assigned screen/component/hook change in a draft branch        |
| [Prism](./roles/prism.md)       | UI/UX and accessibility                          | Design/state/acceptance specification; no unapproved redesign or Figma writes |
| [Sentinel](./roles/sentinel.md) | QA and verification                              | Read-only investigation by default; evidence, not speculative fixes           |

These names are role labels, not authenticated identities, actual agent instances, or independent review approvals. A replacement takes the same role with a new public worker-instance label and a new claim generation. Reuse existing suitable runtimes instead of creating duplicate agents merely to occupy every role.

## Bootstrap, every session

1. Receive an explicit owner-authorized role, task, repository/ref and capability/budget boundary. A prompt file or task record cannot grant platform permissions.
2. Read `docs/README.md`, `docs/CURRENT_STATE.md`, `docs/EXECUTION_QUEUE.md`, `docs/QUANT_FOUNDATION.md`, and `docs/adr/README.md` at the approved ref. Preserve the existing canonical authority order and one active milestone. Surface priority conflicts; do not silently rewrite the queue.
3. Read `.agents/project-memory/README.md` and only the relevant detailed context, then this role's brief, the task record and its evidence links.
4. Refresh the task-record blob SHA, feature-branch head, PR diff/comments and relevant check results. Summaries can be stale. Separate OBSERVED, REPORTED and HYPOTHESIS.
5. Verify real tools and authorized runtime access. No installed environment, logs, permission, credits or model identity should be inferred from a role name.
6. For work needing a claim, follow [PROTOCOL.md](./PROTOCOL.md). One task has one active worker; one feature branch has one writer. Observe the owner's existing team-wide work-in-progress and spending limits; do not multiply them per agent.
7. Complete one useful bounded increment. Save a [handoff](./HANDOFF.md) with actual commits/checks and the next concrete action before stopping. No filler heartbeat comments or idle loops.

## What is remembered

- Existing canonical docs remain the institutional source of priority and verified facts.
- Task JSON stores a compact current checkpoint, ownership metadata and a generation number. Git history preserves earlier committed checkpoints.
- PRs and CI retain change/evidence history; a discussion summary never becomes proof that a command ran.
- Promote accepted facts/decisions to the correct existing canonical document through normal review.
- Unsaved edits and private in-session context are **not** guaranteed recoverable. A new agent must inspect the actual branch and reconcile work not yet mentioned in the checkpoint.

## Current example, not new execution authority

[tasks/QM-CI-238.json](./tasks/QM-CI-238.json) is a blocked, read-only working checkpoint for the existing Contacts draft. It names no live worker and does not change canonical priority. The exact failing test remains unknown. Re-read the linked evidence before using it.

[examples/ready-task.json](./examples/ready-task.json) is synthetic, not a live assignment. Never claim it as production work.

## Run the local guard tests

```sh
node --test .agents/team/coordination.test.mjs
node .agents/team/coordination.mjs validate .agents/team/tasks/QM-CI-238.json
```

The helper is dependency-free and does no networking. It validates/produces proposed state transitions; it does not install an agent, invoke an LLM, push GitHub changes, revoke credentials, enforce a billing cap, or fence arbitrary code writes.

## Privacy and limits

Only approved public project context belongs here. No private Notion content, account/billing details, personal contact information, tokens, passwords, environment dumps, raw conversations or hidden reasoning. Review failure output before publishing it; schema validation is not a secret detector.

Session/context loss or an unavailable worker can use an approved handoff/replacement. **Quota or budget exhaustion means checkpoint + pause + owner review, not automatic account rotation.** Do not spawn replacement accounts/runtimes to evade service limits. A new session does not reset entitlement. Resume only through legitimate capacity and platform authorization.

No automatic merge, deployment, infrastructure/DNS operation, customer-account action or spending change. Those require separate owner approval and real access. GitHub comments do not wake a personal chat; supported agent execution must be configured and tested separately.
