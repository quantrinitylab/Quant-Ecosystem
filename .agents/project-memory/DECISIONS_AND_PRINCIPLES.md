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

- QuantMail is the flagship; QuantChat is the second surface.
- The shared intelligence layer is the moat, not any single app.
- Apps are experience surfaces over shared capability layers.
- Capability and real wiring ship together.
- Unsupported controls stay unavailable instead of pretending to work.
- Screen-by-screen evolution is preferred over broad redesign.
- Dark-first does not mean dark-only; light and high-contrast remain requirements.

## Engineering decisions

- Measure before tuning.
- One behavior change per experiment.
- Baselines and migration decisions are append-only evidence.
- One independently valuable boundary per worker/PR.
- Required gates and review approval precede merge.
- No security-threshold reduction, ignored advisory, hand-edited lockfile, or fabricated result.
- Irreversible changes require human approval.
- Code/CI evidence outranks summaries and agent status files.

## Memory-system decisions

- Modes are `legacy`, `dual_write`, `shadow`, and `new`.
- Human-controlled transitions only.
- `new` remains blocked while ADR-011 gates are unmet.
- Wrong memory is worse than missed memory.
- Two precision-regressing memory experiments were correctly reverted.
- A HOLD decision is valid progress when evidence is unsafe.

## Authentication decisions

- Long-lived refresh credentials leave JavaScript-readable browser storage.
- Server persistence stores one-way refresh digests.
- Rotation is atomic; reuse revokes the family.
- Browser refresh uses a reviewed HttpOnly cookie and exact-origin controls.
- Access tokens remain short-lived and memory-scoped where practical.
- Browser sessions and non-browser OAuth remain separate contracts.
- Local-only sign-out must not be described as verified server revocation.

## Infrastructure decisions

- No production apply from stale account/domain/multi-region manifests.
- Bootstrap is single-region and cost-reviewed.
- Images use immutable SHAs and verified digests.
- Cloudflare DNS changes require origin-health and rollback proof.
- Cloudflare Workers AI is the active provider direction while Bedrock remains parked, but production activation is not yet approved.

## Supersession rule

A changed decision must identify the old decision, the new evidence, the invariant, the owner approval, the date, and the affected canonical files. Do not rewrite history to make current code appear compliant.
