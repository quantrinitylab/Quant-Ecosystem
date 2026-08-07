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
- WU4 representative runner was merged; its real 500-recall artifact remains active.
- WU5 release tooling keeps production in `legacy` and `new` blocked.

## 3. Quantrinity and Quant Design OS

- Issue #71 became the canonical QuantMail/Design OS tracker.
- Masterbrand `QUANTRINITY`, company domain `quantrinity.in`, consumer mail domain `quantmail.in`, and endorsed product lockup were established.
- PRs #72–#80 established design constitution, identity metadata, semantic roles, and reversible auth/shell adoption.
- Final mark geometry was intentionally not frozen without visual review.

## 4. QuantMail screen-by-screen evolution

- PRs #81–#84 expanded dark-shell coverage and reorganized navigation.
- PRs #85–#94 improved recovery, activation, compose/thread/copilot hierarchy, command coverage, and security-state honesty.
- PRs #95–#106 removed unsupported persistence and shortcut claims while wiring real settings where contracts existed.
- PR #124 merged cross-platform shortcut labels at `a23203d5f11c6366f8e5d2ca8766a0e86f7c2eac`.
- PR #123 merged safe global recovery at `3d002e3c1d27174753e52e75af83829aa00e69d6`.
- PR #107 merged the canonical screen plan at `1162352cf094615136098d2675f169e886364e9f`.

## 5. Dependency and authentication hardening — 2026-08-07

- A GitHub Actions major outage delayed all queued evidence; retriggers were intentionally held until service recovery.
- A newly published `js-yaml` high advisory invalidated an otherwise clean dependency branch. The override was advanced to 4.3.1, a pinned runner regenerated the lockfile, the audit verified it before commit, and the temporary workflow was removed.
- PR #130 merged dependency remediation as `7fe3e25416348477c6790826b43f22ef675b5c0c`.
- PR #125 merged atomic refresh-family integrity as `a5f2057887e1842368af4baaf65192c16b5f1c14`.
- PR #132 exposed stale inherited tests after integration. Repairs changed only test expectations/harness wiring, including a per-request Fastify cookie getter; production cookie semantics were not weakened.
- The definitive #132 head passed the gate, dependency audit, memory/PostgreSQL, coverage, action pins, CodeQL, backend/focused typechecks, focused contracts, and real Chromium acceptance.
- PR #132 merged as `09a0a22e9aa5fe288d22987b90a6119a70f7c467`.

## 6. Active-account infrastructure and Workers AI — 2026-08-07

- PR #137 replaced legacy AWS account `650708167640` with `266176113726` in active deployment references and merged as `cf1797c510a5bff349220c8f0e680ca4536997ee`.
- PR #131 locked the unsafe legacy production root and merged as `a05bcfc4249a0fc392418ee053e9a5799ad40cde`.
- PR #133 added a single-region fail-closed production v2 Terraform root and merged as `04b9b0c845a1f32598bf2e8e70cdb5b89a9708c3`.
- PR #134 added the fail-closed production v2 Helm profile and merged as `42133d98d73e31b4c70ca62c583ec64b7018a419`.
- PR #135 added the fail-closed direct Cloudflare Workers AI runtime and merged as `8aa8fa5d911ec306229a03bb9cad9a6124ea1c7b`.
- Live verification found five empty ECR repositories, no GitHub OIDC deploy role, absent production Cloudflare secret paths, and EKS state unknown because the read role lacks permission.
- Cloudflare verification found two active zones, zero Worker scripts, existing AWS/email DNS, and no application DNS cutover.
- No Terraform apply, image push, production deployment, or placeholder-secret write occurred.

## Durable lesson

Narrow, reversible, source-backed work compounds. Broad rewrites, capability simulation, hidden red gates, mixed infrastructure/application PRs, or deployment claims without live evidence create risk and must be split or rejected.
