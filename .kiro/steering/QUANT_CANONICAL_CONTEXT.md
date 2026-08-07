---
inclusion: always
doc_id: quant-canonical-context
doc_type: session-steering
authority: canonical-pointer
status: active
owner: platform-architecture
last_verified: 2026-08-07
verified_at_commit: 09a0a22e9aa5fe288d22987b90a6119a70f7c467
review_by: 2026-09-06
supersedes: []
superseded_by: []
canonical_scope: agent-session-context
---

# Quant canonical context

For every session, especially a prompt containing only `continue`:

1. Read the [institutional-memory index](../../docs/README.md).
2. Read the commit-pinned [Current State](../../docs/CURRENT_STATE.md).
3. Follow the one active milestone and ordered work unit in the [Execution Queue](../../docs/EXECUTION_QUEUE.md).
4. Follow the [Quant Foundation](../../docs/QUANT_FOUNDATION.md) and accepted [ADRs](../../docs/adr/README.md).
5. Read the [detailed project-memory checkpoint](../../.agents/project-memory/README.md) for owner intent and continuity, while treating it as non-authoritative supporting context.
6. Verify claims against code, tests, migrations, blocking CI, and live infrastructure reads before changing implementation or operational state.
7. Treat audits, prompts, roadmaps, and `.agents` artifacts as dated evidence unless the authority index promotes them.
8. Keep operational hardening reversible and fail-closed; it does not change the active milestone unless the Execution Queue records an explicit owner-approved change.

Update `CURRENT_STATE.md` when verified facts, risks, or gate decisions change; update `EXECUTION_QUEUE.md` when priority or milestone state changes. Update the ADR index with every ADR addition or supersession. Update the detailed project-memory checkpoint after substantial sessions, but never let it override canonical authority. Never rewrite append-only measurement history, never auto-execute the manual historical production-readiness prompt, and never infer deployment from merged configuration.
