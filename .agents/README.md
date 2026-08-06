---
doc_id: quant-agent-artifacts-policy
doc_type: agent-artifacts-policy
authority: non-authoritative
status: active
owner: developer-experience
last_verified: 2026-08-06
verified_at_commit: 1162352cf094615136098d2675f169e886364e9f
review_by: 2026-09-05
supersedes: []
superseded_by: []
canonical_scope: agent-artifact-classification
---

# Agent artifacts

This directory contains coordination prompts, task state, generated inventories, logs, working notes, and [detailed project memory](./project-memory/README.md). These files preserve useful evidence and continuity, but they are **not canonical product, architecture, or execution truth**.

## Project-memory folder

`.agents/project-memory/` stores project-safe owner intent, reconstructed history, workstream status, responsibilities, blockers, and dated session checkpoints. It deliberately excludes secrets, personal contact details, raw private chats, and unrelated conversations.

Every session may read this folder after the canonical institutional-memory files. Any claim that changes architecture, current state, priority, or implementation must be verified and promoted to the correct authority.

## Promotion rule

A claim becomes durable institutional memory only when it is verified against repository evidence and promoted to the correct authority:

- architecture decision → an accepted ADR plus the [ADR index](../docs/adr/README.md);
- verified repository fact or risk → [Current State](../docs/CURRENT_STATE.md);
- execution priority or milestone status → the [Execution Queue](../docs/EXECUTION_QUEUE.md);
- measurement → an append-only baseline, scoreboard, or decision log linked from Current State;
- implementation fact → code, test, migration, or blocking CI evidence.

Never resume implementation solely from an agent task status, generated report, log, or conversation memory. Re-check the source commit and the [institutional-memory index](../docs/README.md). Do not mass-delete this directory during memory cleanup; archive or remove artifacts only in a separately reviewed change.
