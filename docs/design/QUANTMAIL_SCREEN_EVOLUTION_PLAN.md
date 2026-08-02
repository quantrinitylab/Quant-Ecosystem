# QuantMail Screen Evolution Plan

> Evolution is a measured product loop: observe, design, implement, verify, learn, and simplify. The goal is not visual churn. The goal is a compounding system that makes every product faster to improve.

## Outcome

Turn QuantMail into the flagship proof of the Quant Design OS while preserving working behaviour and shipping reversible improvements. Each screen must make the current context, next valuable action, system state, and AI scope immediately clear.

Design handoff: [Quantrinity QuantMail — Code-Parity UI/UX & Next Upgrades](https://www.figma.com/design/3G6f5Ik3tdc8dymTIvJyry)

## Non-negotiable product rules

1. **Mail remains primary.** Calendar, Drive, Contacts, Code, and AI appear when they help the active communication task.
2. **AI is contextual and reversible.** Suggestions show scope and preserve the original until explicitly applied.
3. **Claims must match capability.** No fake shortcuts, uploads, delivery scheduling, security controls, or success states.
4. **One scroll owner per layout.** Permanent nested scrollbars block release.
5. **Accessible by construction.** WCAG AA, visible focus, keyboard paths, reduced motion, screen-reader names, and 44 px targets.
6. **One family, distinct tools.** Semantic tokens and interaction rules are shared; each product keeps a purposeful accent and task model.
7. **Measure before expansion.** A screen graduates only after task, accessibility, responsive, and visual-regression evidence.

## Screen-by-screen execution order

| Wave | Screen / state | Current focus | Evolution target | Exit evidence |
| --- | --- | --- | --- | --- |
| 0 | Foundations | Semantic dark/light/high-contrast roles exist | Freeze variables, type, spacing, radius, focus, motion, and component-state contracts | Token/contrast tests and isolated preview |
| 1 | Global shell | Mail, Context, Code, and Control groups exist | One responsive shell with truthful navigation and one scroll owner | 390/768/1024/1440/1920 snapshots |
| 1 | Populated inbox | List, search, selection, and reading pane exist | Priority signal with evidence, compact AI brief, consistent row density, keyboard triage | Inbox task flow and keyboard test |
| 1 | Empty inbox | First action is now clearer | Connect/import/sample paths plus direct compose action | New-user activation test |
| 1 | Inbox search miss | Recovery actions exist | Preserve query context, explain recovery, advanced-search handoff | Zero-result recovery test |
| 1 | Thread | Summary and reply hierarchy improved | Reading-first thread, related context, one reply flow, AI evidence and preview | Read/summarise/reply task test |
| 1 | Compose | Readiness, local files, undo, draft, and AI tools exist | Cross-platform shortcut copy, recipient resolution, AI diff preview, real upload, real schedule delivery | Compose task, failure, undo, and keyboard tests |
| 2 | Search | Quick starts and reset exist | Search operators, filter chips, recent context, explainable result ranking | Find-known-message task test |
| 2 | Sent | Generic state remains shallow | Delivery status, follow-up signals, schedule/undo context | Sent-message recovery test |
| 2 | Drafts | Generic state remains shallow | Autosave confidence, templates, stale-draft recovery, context grouping | Resume-draft task test |
| 2 | Trash | Generic state remains shallow | Retention explanation, restore, permanent-delete confirmation | Restore/delete safety test |
| 2 | Calendar | Dark shell bridge exists | Mail-linked events, commitment creation, responsive agenda, timezone clarity | Mail-to-event task test |
| 2 | Contacts | Dark shell bridge exists | Identity resolution, relationship context, import/create activation | Recipient-resolution task test |
| 2 | Add contact dialog | Layout issues were identified | Persistent actions, bounded body scroll, validation and duplicate handling | 390/768 dialog snapshots |
| 2 | Drive | Partial/full recovery states improved | Real upload, attachment insertion, cached context, permissions and progress | Attach-file and outage tests |
| 3 | Repositories | Dark shell bridge exists | Coherent Code workspace, activation, repository status and recent work | Open/import-repository task test |
| 3 | Repository detail | Shell parity exists | File/commit/PR hierarchy, trustworthy states, code-context AI | Review-change task test |
| 3 | Pipelines | Dark shell bridge exists | Run status, logs, failure recovery, artifact access | Diagnose-failed-run task test |
| 3 | Settings | Controls require capability audit | Shared fields/tabs/switches, dirty state, save/cancel, unavailable controls explained | Preference persistence tests |
| 3 | Security | Controls require end-to-end contracts | Sessions, recovery, 2FA setup/verify/recovery, revocation scope | Security-flow integration tests |
| 4 | Login | Semantic bridge exists | Same identity and surface system as app, clearer trust and recovery | Auth continuity snapshots |
| 4 | Register | Semantic bridge exists | Progressive validation, password guidance, recovery ownership | Registration task test |
| 4 | Registration success | Exists | Clear next step, identity summary, recovery reminder | First-session activation test |
| 4 | Command palette | Verified Ctrl/Cmd+K handler exists | Search, navigation, commands, explicit scope and result preview | Keyboard-only command test |
| 4 | Mobile inbox | Canonical identity exists | List → thread → compose flow with safe-area actions and no desktop sidebar | 360/390 task snapshots |
| 4 | Tablet | Responsive behaviour is incomplete | Navigation and context drawers that preserve the primary task | 768/1024 task snapshots |

## Immediate implementation queue

### Boundary 1 — compose shortcut truthfulness

- Replace visible `⌘ Enter` with `Ctrl/Cmd + Enter`.
- Replace visible `⌘ S` with `Ctrl/Cmd + S`.
- Keep the existing `metaKey || ctrlKey` handlers unchanged.
- Do not alter send, undo-send, draft, schedule, or attachment behaviour.

### Boundary 2 — AI rewrite preview

- Preserve the original message body.
- Present original and proposed copy before applying.
- Show the requested operation: professional, friendly, concise, or expand.
- Provide Apply, Keep original, and Cancel actions.
- Never send as a side effect of generation or apply.

### Boundary 3 — attachment capability

- Replace “local selection” with upload only after backend/storage progress, retry, cancellation, and send inclusion are verified.
- Until then, keep the current limitation explicit and do not imply delivery.

### Boundary 4 — scheduled delivery

- Keep “Schedule draft” wording until a delivery queue, persistence, cancellation, timezone handling, and delivery evidence exist.
- Promote to “Schedule send” only after the end-to-end contract is verified.

## Definition of done for every screen

- Clear primary task and next action.
- Loading, empty, partial failure, full failure, permission, and success states.
- Keyboard path and visible focus order.
- Screen-reader labels and announcements.
- WCAG AA contrast for actual token pairs.
- 44 px pointer targets or equivalent spacing.
- Reduced-motion behaviour.
- No permanent nested scrollbars.
- Responsive evidence at applicable target widths.
- Visual-regression baseline.
- Task-level acceptance test.
- No UI claim without a verified product contract.

## Compounding loop

For each boundary:

1. Audit the active path and capability contract.
2. Capture a baseline screenshot and task expectation.
3. Change the smallest coherent boundary.
4. Run focused tests, accessibility checks, secret scanning, and required CI.
5. Review the actual rendered state.
6. Merge only when evidence is green.
7. Record the next dependency instead of expanding scope.

This loop is the product equivalent of a platform moat: a shared system that makes every future application improvement cheaper, safer, and faster.