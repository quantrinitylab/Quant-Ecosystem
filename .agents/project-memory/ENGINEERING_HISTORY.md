# Engineering History

## 1. Audit and recovery

- Deep repository, infrastructure, security, CI, and simulated-capability audits established the real baseline.
- Local/Kiro work was recovered rather than left on one machine.
- Recorded recovery checkpoint: branch `wip/local-kiro-recovery`, commit `5352ee5d`.
- Recovery work was split into focused PRs instead of one broad rewrite.

## 2. Foundation and Memory V2

- Quant Foundation established the genome and seven laws.
- ADRs froze memory ports, persistence, retrieval, temporal/confidence rules, state machine, extraction schema, and migration facade.
- Four modes were defined: `legacy`, `dual_write`, `shadow`, `new`.
- Evaluation, replay, baselines, scoreboard, and decision log became permanent infrastructure.
- Two recall-content experiments were reverted because precision regressed.
- An in-process shadow run measured 14.3% agreement with five critical divergences and correctly returned HOLD.
- WU2/WU3 established fail-closed durable dependencies and restart-safe tenant-scoped shadow reports.
- WU4 representative runner was merged; its real 500-recall artifact remains an active evidence boundary.
- WU5 release tooling keeps production in `legacy` and `new` blocked.

## 3. Quantrinity and Quant Design OS

- Issue #71 became the canonical QuantMail/Design OS tracker.
- Masterbrand `QUANTRINITY`, company domain `quantrinity.in`, consumer mail domain `quantmail.in`, and endorsed product lockup were established.
- PR #72 began the design constitution/audit stream.
- PRs #73–#80 established identity metadata, semantic roles, and reversible auth/shell adoption.
- Final mark geometry was intentionally not frozen without visual review.

## 4. QuantMail screen-by-screen evolution

- PRs #81–#84 expanded dark-shell coverage and reorganized navigation.
- PRs #85–#94 improved recovery, activation, compose/thread/copilot hierarchy, command coverage, and security-state honesty.
- PRs #95–#100 made profile, labels, deletion, signature, and vacation-responder states truthful/live where contracts existed.
- PRs #101–#106 removed unsupported persistence and shortcut claims.
- PR #124 merged cross-platform shortcut labels at `a23203d5f11c6366f8e5d2ca8766a0e86f7c2eac`.
- PR #123 merged safe global recovery at `3d002e3c1d27174753e52e75af83829aa00e69d6`.
- PR #107 merged the canonical screen plan at `1162352cf094615136098d2675f169e886364e9f`.

## 5. Authentication security

- Issue #120 verified JavaScript-readable long-lived refresh credentials and misleading logout/session semantics.
- PR #125 added one-way refresh digests, binding checks, atomic rotation, and family revocation.
- PR #130 isolated dependency advisory remediation without weakening thresholds.
- PR #132 built the browser HttpOnly-cookie migration, memory-only access token, bounded retry, same-origin proxy, legacy cleanup, OAuth compatibility, and Chromium acceptance.
- All remain open/blocked at the latest checkpoint.

## 6. AI provider and deployment split

- Direct Cloudflare Workers AI inference succeeded while Bedrock remained parked.
- Mixed PR #126 combined application and deployment concerns, then was explicitly superseded.
- PR #135 isolated the fail-closed Cloudflare application runtime.
- Issue #127 tracks active-account OIDC/EKS/image prerequisites.
- Terraform audit found unsafe multi-region/cost/stale-domain defaults; issue #129 and split successor PRs own remediation.
- No production deployment or application DNS cutover occurred.

## Durable lesson

Narrow, reversible, source-backed work compounds. Broad rewrites, capability simulation, hidden red gates, or mixed infrastructure/application PRs create risk and must be split.
