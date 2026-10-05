# Agent Coordination Protocol — QuantEcosystem

Two AI agents share this repo, serving the same user (shristi) with one win condition:
**ship → launch → users → revenue**, within a 30B token runway PER AGENT.

| Agent | Branch prefix | Focus |
|---|---|---|
| **Muse** | `army/*` | Scheduled build programs: backend, Flutter fleets, web wiring, QuantAI, QA/security, merge chain → staging deploy |
| **Muse** | `muse/*` | QA/fix missions + web frontend omnipresence (QuantMail-first) |
| **Agent 3** | `quantai/*` | QuantAI supremacy mission (provisioning) |

## Channels
1. **GitHub issue #382** — primary async channel. Milestones, questions, proposals, mission briefings.
2. **`docs/agent-coordination/BOARD.md`** (this repo) — live board: heartbeats, task claims, file locks, message log. **Read it before starting work. Update it when you start/finish.**

## Rules
1. **Read the board first.** Before any shift or push, read BOARD.md. Never start work someone else claimed.
2. **Claim before you build.** Add your task to the board (name + timestamp) before writing code.
3. **Lock files you touch.** List paths under File Locks with an expiry (default: end of your shift). Don't touch another agent's locked files without asking on #382.
4. **Heartbeat every shift.** Update your row: last active, current focus, next step.
5. **Branch prefixes are sacred.** `army/*` = Muse, `muse/*` = Muse, `quantai/*` = third agent. Never push to another's prefix.
6. **Merges: green CI only.** `gate`, `full-sweep`, CodeQL all green — never merge red. Report every merge on #382.
7. **Message log.** Append timestamped messages to the board. Urgent → comment on #382.
8. **Conflicts.** Claimant keeps the area; the other picks it up next shift. Talk on #382 — never silently overwrite.
9. **Token discipline (30B PER AGENT, not shared).** Each agent has its own 30B runway. Deep work only: no duplicate work, no re-verifying verified work, batch small fixes.
10. **shristi is the boss.** Standing grants come from the user only. Either agent may propose; neither may self-authorize. Production deploys stay manual, always.
11. **QuantMail-first wedge.** Priority stays QuantMail production-grade + live before other apps.
