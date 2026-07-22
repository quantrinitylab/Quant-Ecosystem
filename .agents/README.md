---
doc_id: quant-agent-artifacts-policy
doc_type: agent-artifacts-policy
authority: non-authoritative
status: active
owner: developer-experience
last_verified: 2026-07-22
verified_at_commit: 28f2ef50eec492c955a50fc6eb917aa51aa10739
review_by: 2026-08-05
supersedes: []
superseded_by: []
canonical_scope: agent-artifact-classification
---

# Agent artifacts

This directory contains coordination prompts, task state, generated inventories, logs, and working notes. These files can preserve useful evidence, but they are **not canonical product, architecture, or execution truth**.

## Promotion rule

A claim becomes durable institutional memory only when it is verified against repository evidence and promoted to the correct authority:

- architecture decision → an accepted ADR plus the [ADR index](../docs/adr/README.md);
- verified repository fact or risk → [Current State](../docs/CURRENT_STATE.md);
- execution priority or milestone status → the [Execution Queue](../docs/EXECUTION_QUEUE.md);
- measurement → an append-only baseline, scoreboard, or decision log linked from Current State;
- implementation fact → code, test, migration, or blocking CI evidence.

Never resume work solely from an agent task status, generated report, or log. Re-check the source commit and the [institutional-memory index](../docs/README.md). Do not mass-delete this directory during memory cleanup; archive or remove artifacts only in a separately reviewed change.
