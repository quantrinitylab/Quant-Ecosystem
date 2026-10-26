# Agent Coordination Board

> Live shared board for **Muse** (`army/*`), **Muse** (`muse/*`), **Agent 3** (`quantai/*`).
> Read before starting work. Update when you start/finish.
> Token rule: 30B per agent (not shared).

## Heartbeats
| Agent | Last active | Current focus | Next step |
|---|---|---|---|
| Muse | 2026-10-04 | Merge chain, backend + Flutter lanes, coordination system | Staging deploy after CI green |
| Muse | 2026-10-04 | Web-frontend lane (QuantMail-first); `docs/AGENT_MISSION.md` on main | Fold AGENT_MISSION.md into board structure |
| Agent 3 (QuantAI) | — | PROVISIONING by shristi | Read AGENT3_ONBOARDING.md → hello on #382 → claim first task |
| CODEX | 2026-10-26 | Calendar clock repair locally verified; stacked on canonical CI repair #1466 | Owner review and fresh CI on the combined candidate; no merge/deploy |

## Task Claims
| Task | Agent | Status | Since |
|---|---|---|---|
| Merge chain watch (#380, #381, #383) | Muse | in-progress | 2026-10-04 |
| Staging deploy (post-merge) | Muse | pending (CI gate) | 2026-10-04 |
| QuantAI P0 identity-forgery fixes (7) | quantai-mind (army program) | assigned | 2026-10-04 |
| Agent-coordination system | Muse | in-progress | 2026-10-04 |
| Calendar seasonal-clock CI regression (test-only; QuantMail ownership remains MUSE-ORCHESTRATOR) | CODEX | local-verified; awaiting review/CI | 2026-10-26 |

## File Locks
| Paths | Agent | Until |
|---|---|---|
| `docs/agent-coordination/*` | Muse | 2026-10-04 EOD |
| `apps/quantmail/*` (QA lane) | Muse | flexible — talk on #382 before touching |
| `apps/quantmail/src/__tests__/calendar-multiview-trackers.test.tsx` | CODEX | Released after local verification on 2026-10-26; re-check #382 before another edit |

## Message Log (append-only, newest last)
- 2026-10-04 — Muse: Protocol v1 + board v1 + agent-3 onboarding drafted; lanes agreed on #382.
- 2026-10-26 — CODEX: Direct user authorized implementation of CI repairs. Narrow Calendar clock-test claim announced on #382 (6408112403); existing owner branches and canonical CI repair #1466 remain untouched. No merge, deploy, secret/IAM change or gate relaxation.
- 2026-10-26 — CODEX: Main baseline reproduced 1 failed / 26 passed. Explicit seasonal/transition fixtures now pass 35/35 in UTC, Asia/Kolkata and America/Los_Angeles; four Calendar suites pass 99/99 on Node 22.23.3, including the #1466 combined tree with Vitest 4.1.12. Temporary summer-only source mutations triggered 7 expected failures and were fully reverted. This is test/source evidence, not hydrated UI, deployment or journey proof.

## Milestones — ship → launch → users → revenue
- [x] PR #376 merged (QuantMail backend startup fix)
- [x] 7 QuantMail QA bugs fixed + merged (`d984e95a`)
- [x] PR #381 merged (Flutter Phase-1 tail)
- [ ] #380 fixed + merged (CI red — ci-fix lane)
- [ ] #383 (wave-8) merged (CI green)
- [ ] Staging deploy + live QA green
- [ ] QuantAI P0 identity flaws fixed
- [ ] All 9 apps E2E working on staging
- [ ] QuantAdmin live
- [ ] Public launch push → users → revenue
