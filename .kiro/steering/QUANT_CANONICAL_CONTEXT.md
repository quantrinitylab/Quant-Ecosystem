---
inclusion: always
doc_id: quant-canonical-context
doc_type: session-steering
authority: canonical-pointer
status: active
owner: platform-architecture
last_verified: 2026-08-06
verified_at_commit: 1162352cf094615136098d2675f169e886364e9f
review_by: 2026-09-05
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
5. Read the [detailed project-memory checkpoint](../../.agents/project-memory/README.md) for owner intent and conversation continuity, while treating it as non-authoritative supporting context.
6. Verify claims against code, tests, migrations, and blocking CI before changing implementation.
7. Treat audits, prompts, roadmaps, and `.agents` artifacts as dated evidence unless the authority index promotes them.

Update `CURRENT_STATE.md` when verified facts, risks, or gate decisions change; update `EXECUTION_QUEUE.md` when priority or milestone state changes. Update the ADR index with every ADR addition or supersession. Update the detailed project-memory checkpoint after substantial sessions, but never let it override canonical authority. Never rewrite append-only measurement history, and never auto-execute the manual historical production-readiness prompt.
