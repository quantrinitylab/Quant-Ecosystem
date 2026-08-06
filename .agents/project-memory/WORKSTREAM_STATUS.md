# Workstream Status

Status vocabulary: `LANDED`, `ACTIVE-DRAFT`, `BLOCKED`, `SUPERSEDED`, `QUEUED`, `FROZEN`.

| Workstream                 | State                  | Current truth                                                                                    |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Canonical project memory   | LANDED / REFRESHING    | Git-backed authority index and validator exist; draft PR #136 awaits checks/review/merge         |
| M11D memory canary         | ACTIVE-CANONICAL       | WU4 remains active in Execution Queue; live archived evidence still required                     |
| Quant strategy/foundation  | LANDED                 | Genome, laws, foundation, research, mathematics, and migration discipline exist                  |
| Quantrinity identity       | LANDED FOUNDATION      | Brand architecture and semantic contracts exist; final editable visual execution remains         |
| QuantMail UX truthfulness  | LANDED SUBSTANTIAL     | PRs #72–#107 and #123/#124; audited backlog #108–#122 remains                                    |
| Token-family hardening     | ACTIVE-DRAFT           | PR #125 open; focused security evidence green; not merged                                        |
| Dependency remediation     | ACTIVE-DRAFT / BLOCKED | PR #130 audit/CodeQL green; main gate/full sweep red                                             |
| Browser HttpOnly session   | ACTIVE-DRAFT / BLOCKED | PR #132 focused and Chromium evidence green; aggregate gates/review/deploy alignment block merge |
| Cloudflare AI runtime      | ACTIVE-DRAFT / BLOCKED | PR #135 focused lane green; dependency/aggregate gate and review block merge                     |
| Mixed migration PR         | SUPERSEDED             | PR #126 retained only for comparison; do not merge                                               |
| AWS OIDC/EKS bootstrap     | BLOCKED                | Issue #127; restricted identity, failed stack rollback, no deployable EKS or images              |
| Production-v2 Helm/secrets | QUEUED/DRAFT           | Must remain split, reviewed, and blocked until app/infrastructure prerequisites are green        |
| Figma execution            | BLOCKED/PARTIAL        | Repository contracts/handoff exist; edit-capable workflow not verified                           |
| Broader app expansion      | FROZEN                 | Maintain health; do not displace flagship/security/memory priorities                             |

## Completion rule

A workstream is not complete because a draft has focused green tests. Completion requires the appropriate combination of:

1. current-head required checks;
2. approved review;
3. confirmed merge on current main;
4. deployment and user-path verification when applicable;
5. canonical memory and issue updates.

## QuantMail evolution groups

- #72–#80: design constitution, Quantrinity identity, semantic roles, auth/shell bridges.
- #81–#84: dark-shell rollout and navigation grouping.
- #85–#94: recovery, activation, compose/thread/copilot hierarchy, session truthfulness.
- #95–#106: live settings where contracts exist and removal of unsupported capability/shortcut claims.
- #107: canonical screen-by-screen plan.
- #123/#124: global error/loading recovery and cross-platform compose shortcut labels.

## Active security/dependency chain

1. PR #130 must become reproducibly green without policy weakening.
2. PR #125 must be refreshed and landed as the server invariant.
3. PR #132 must be rebased, fully green, reviewed, and aligned with production origins/configuration.
4. PR #135 must be refreshed after dependency remediation and reviewed independently of infrastructure.
