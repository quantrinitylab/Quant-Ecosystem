# Roadmap and Ownership

## Ownership model

### Tyccy — founder/owner

- Sets vision, product priority, risk tolerance, and final trade-offs.
- Approves production, DNS, destructive changes, security-policy changes, spending, and sensitive access.
- Resolves the mismatch between the canonical M11D queue and recent parallel work.

### Execution agent

- Reads canonical memory and this folder before acting.
- Verifies current main, issue/PR state, source ownership, and acceptance evidence.
- Implements one narrow boundary, tests it, scans for secrets, opens a PR, and updates memory.
- Never invents logs, pass states, deployment, or review approval.

### Reviewer

- Reviews the diff and evidence, not the summary alone.
- Confirms capability truth, regression risk, security, and required gates.
- Blocks merge when evidence is incomplete.

Historical labels such as CEO, CTO, Kiro, Claude, or Qwen describe prior sessions; do not assume a currently assigned human or agent without fresh confirmation.

## Immediate administrative priority

1. Validate, review, and merge project-memory PR #136.
2. Run `pnpm memory:validate`, formatting, local-link checks, and a targeted secret scan.
3. Obtain review and merge through normal repository policy.
4. Make memory refresh the final step of every substantial future session.

## Canonical priority decision

Before declaring security or deployment the active engineering milestone, Tyccy must choose one of these evidence-backed paths:

- finish or explicitly block M11D WU4 and retain the existing queue; or
- approve a queue change that moves S-01/dependency/auth work ahead and records why.

Open PR activity alone must not silently rewrite the one active milestone.

## If security becomes the approved next chain

1. Reproduce PR #130 gate/full-sweep failures.
2. Fix the responsible source/config only.
3. Land dependency remediation with approval.
4. Refresh and land PR #125.
5. Refresh, fully validate, review, and land PR #132.
6. Close Issue #120 only after deployed browser/security evidence.

## If M11D remains active

1. Acquire real PostgreSQL/Qdrant/embedding dependencies and a synthetic actor.
2. Run the versioned 500-recall WU4 plan.
3. Persist and archive version freeze, report, and replay artifacts.
4. Keep the decision `HOLD_PENDING_WU5` where pending agreement is not measured.
5. Prove rollback/release gates in order.
6. Append the migration decision; do not overwrite prior evidence.

## Deployment sequence

1. Keep PR #126 superseded.
2. Use reviewed single-purpose application, Terraform, Helm/secrets, and deployment PRs.
3. Confirm target account/region/domains/origins.
4. Provision GitHub OIDC and cost-reviewed single-region infrastructure.
5. Build, scan, sign, and push immutable-SHA images.
6. Deploy staging first.
7. Verify migrations, health, TLS, auth cookies, logs, and rollback.
8. Change application DNS only after explicit approval and origin-health proof.

## Design sequence

- Obtain edit-capable Figma access.
- Finish QuantMail screens one by one across responsive and state variants.
- Approve mastermark variants.
- Add accessibility and visual-regression evidence.
- Propagate only stable shared components to the next app.
