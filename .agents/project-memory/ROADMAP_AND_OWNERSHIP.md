# Roadmap and Ownership

## Ownership model

### Tyccy — founder/owner

- Sets vision, product priority, risk tolerance, budget, and final trade-offs.
- Approves production, DNS, destructive changes, security-policy changes, spending, and sensitive access.
- Approves any change to the one canonical active milestone.

### Execution agent

- Reads canonical memory and this folder before acting.
- Verifies current main, issue/PR state, source ownership, live infrastructure evidence, and acceptance evidence.
- Implements one reversible boundary, tests it, scans for secrets, opens or updates a PR, and refreshes memory.
- Never invents logs, pass states, resources, deployment, or approval.

### Reviewer/administrator

- Reviews the diff and evidence, not the summary alone.
- Provides authorized cloud access only through approved paths.
- Confirms capability truth, regression risk, security, cost, rollback, and required gates.
- Blocks merge or deployment when evidence is incomplete.

Historical labels such as CEO, CTO, Kiro, Claude, or Qwen describe prior sessions; do not assume a currently assigned human or agent without fresh confirmation.

## Immediate repository priority

1. Validate the refreshed PR #136 with `pnpm memory:validate`, focused memory tests, required CI, and secret scanning.
2. Mark it ready only after its current-head evidence is green.
3. Merge through normal repository policy.
4. Preserve this refresh as the final step of every substantial future session.

## Canonical priority

M11D-SHADOW-CANARY work unit 4 remains active. Security/dependency/provider/infrastructure hardening is now merged but did not rewrite the queue. Any reprioritization must be explicit, owner-approved, and committed to `docs/EXECUTION_QUEUE.md`.

## Ninety-day product focus

1. Complete M11D WU4/WU5 durable evidence without enabling `new` authority.
2. Establish authorized OIDC/EKS access and a reviewed, costed production-v2 plan.
3. Provision real secrets and immutable images; deploy an origin-only staging environment.
4. Prove QuantMail's login → triage → draft → approval → send loop with observability and rollback.
5. Deepen QuantChat and QuantAI only where they reinforce the shared platform loop.
6. Fix flagship frontend/type/coverage debt before expanding product breadth.

## Administrator-only infrastructure sequence

1. Deploy the reviewed GitHub OIDC template linked from Issue #127 with named-IAM capability.
2. Verify the actual EKS state and supported version in account `266176113726`.
3. Review the production-v2 Terraform plan; keep approval false until accepted.
4. Rebuild the EBS CSI trust against the actual EKS OIDC provider.
5. Establish a secure execution path to the private EKS endpoint.
6. Provision real database, Redis, and Cloudflare secrets through an approved secure path.
7. Build, scan, sign, and push immutable-SHA images.
8. Deploy staging first; prove migrations, health, TLS, auth cookies, logs, load, cost, and rollback.
9. Enable the production deploy variable and change application DNS only after explicit final approval.

## Design sequence

- Obtain edit-capable Figma access.
- Finish QuantMail screens one by one across responsive and state variants.
- Approve mastermark variants.
- Add accessibility and visual-regression evidence.
- Propagate only stable shared components to the next app.
