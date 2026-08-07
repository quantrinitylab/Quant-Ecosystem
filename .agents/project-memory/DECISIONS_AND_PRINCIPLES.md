# Decisions and Principles

## Seven binding laws

1. Identity is immutable.
2. Memory is append-first.
3. Significant state changes are events.
4. Modules communicate through contracts and protocols.
5. Every module must be replaceable.
6. Every model is temporary; architecture is permanent.
7. Trust comes before intelligence.

## Product decisions

- QuantMail is the flagship; QuantChat is the second connected surface; QuantAI is the shared intelligence proof.
- The shared abstraction layer is the moat, not any single app.
- The candidate platform layer combines OAuth2/SSO, credits, user-owned memory, trusted cross-app execution, orchestration, and evaluation.
- Capability and real wiring ship together.
- Unsupported controls stay unavailable instead of pretending to work.
- Depth, deployed user paths, reliability, and coverage outrank adding more products.

## Engineering decisions

- Measure before tuning; change one behavior per experiment.
- Baselines and migration decisions are append-only evidence.
- One independently valuable boundary per worker/PR.
- Required gates and repository policy precede merge.
- No security-threshold reduction, ignored advisory, hand-edited lockfile, or fabricated result.
- Merged configuration is not an apply, deployment, or production proof.
- An unverified resource remains **unknown**; lack of read permission is not evidence of absence.
- Irreversible, public, destructive, or cost-bearing changes require human approval.
- Code, CI, and live read evidence outrank summaries and agent status files.

## Memory-system decisions

- Modes are `legacy`, `dual_write`, `shadow`, and `new`.
- Human-controlled transitions only.
- `new` remains blocked while ADR-011 gates are unmet.
- Wrong memory is worse than missed memory.
- Two precision-regressing memory experiments were correctly reverted.
- A HOLD decision is valid progress when evidence is unsafe.
- M11D WU4 remains the canonical active unit until the Execution Queue explicitly changes.

## Authentication decisions

- Long-lived refresh credentials do not enter JavaScript-readable browser storage or JSON responses.
- Server persistence stores one-way refresh digests.
- Rotation is atomic; reuse and logout revoke the complete family.
- Browser refresh uses a host-only HttpOnly cookie with exact-Origin protection.
- Access tokens remain short-lived and memory-scoped.
- Browser sessions and non-browser OAuth remain separate compatible contracts.
- Inherited frontend debt stays visible instead of being hidden or misattributed.

## Infrastructure decisions

- No production apply from stale account, domain, region, or multi-region manifests.
- Bootstrap is single-region, fail-closed, cost-reviewed, and approval-gated.
- Images use immutable commit SHAs and verified digests.
- Never write placeholder secrets; real values enter only through an authorized secure path.
- Cloudflare DNS changes require origin-health and rollback proof.
- QuantAI uses direct Cloudflare Workers AI REST; zero deployed Worker scripts is expected.
- Cloudflare Workers AI is the active provider direction while Bedrock is parked, but production activation is not approved.
- Do not set `bootstrap_root_approved` or `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY=true` before every prerequisite is evidenced.

## Supersession rule

A changed decision must identify the old decision, new evidence, invariant, owner approval, date, and affected canonical files. Do not rewrite history to make current code appear compliant.
