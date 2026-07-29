---
doc_id: quant-adr-index
doc_type: decision-index
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-07-22
verified_at_commit: 28f2ef50eec492c955a50fc6eb917aa51aa10739
review_by: 2026-08-05
supersedes: []
superseded_by: []
canonical_scope: architecture-decisions
---

# Architecture Decision Records

ADRs are immutable decision history. Amend a decision with a new ADR and record supersession here; never rewrite an accepted ADR to make current code look compliant. [`000-template.md`](./000-template.md) is a template, not a decision.

## Decision index

| ADR                                             | Decision                                                | Status   | Date       | Evolution                                            |
| ----------------------------------------------- | ------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------- |
| [001](./001-monorepo-structure.md)              | Monorepo with pnpm + Turborepo                          | ACCEPTED | 2024-12-01 | —                                                    |
| [002](./002-identity-first-architecture.md)     | Identity-first architecture with QuantMail as auth root | ACCEPTED | 2025-01-15 | Evolved by ADR-004; not formally superseded          |
| [003](./003-ai-model-agnostic.md)               | AI model-agnostic orchestration                         | ACCEPTED | 2026-07-07 | —                                                    |
| [004](./004-identity-independent-of-product.md) | Identity independent of every product                   | ACCEPTED | 2026-07-07 | Evolves ADR-002 toward a standalone identity service |
| [005](./005-memory-port-architecture.md)        | Memory port architecture                                | ACCEPTED | 2026-07-08 | Memory V2 contract series                            |
| [006](./006-memory-persistence.md)              | Durable memory persistence                              | ACCEPTED | 2026-07-08 | Memory V2 contract series                            |
| [007](./007-hybrid-vector-retrieval.md)         | Hybrid vector retrieval                                 | ACCEPTED | 2026-07-08 | Memory V2 contract series                            |
| [008](./008-negation-temporal-confidence.md)    | Negation, temporal precedence, and confidence           | ACCEPTED | 2026-07-08 | Memory V2 contract series                            |
| [009](./009-memory-state-machine.md)            | Memory state machine and confidence semantics           | ACCEPTED | 2026-07-08 | Memory V2 contract series                            |
| [010](./010-extraction-output-schema.md)        | Extraction output schema                                | ACCEPTED | 2026-07-08 | Memory V2 contract series                            |
| [011](./011-memory-facade-shadow-migration.md)  | Memory facade and shadow-mode migration                 | ACCEPTED | 2026-07-08 | Governs reversible activation                        |

## Status and supersession rules

- Supported leading statuses are `PROPOSED`, `ACCEPTED`, `REJECTED`, and `SUPERSEDED`.
- Parenthetical annotations do not change the leading status.
- A newer ADR must identify every ADR it supersedes; this index must be updated in the same change.
- ADR-002 and ADR-004 currently describe an explicit evolution, not a formal supersession. The implementation gap remains visible in [Current State](../CURRENT_STATE.md).
