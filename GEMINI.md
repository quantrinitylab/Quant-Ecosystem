# GRAVITAS — Engineering Reliability Rules & Antigravity Protocol

When executing coding tasks, follow the GRAVITAS discipline and skills loaded from Gravitas.

## Non-Negotiable (The 6 Invariants)

1. **Ground before mutating** — Read target files, tests, and callers before making any edits. Never assume or guess state.
2. **Stay in declared scope** — Never make scattered, uncontrolled changes. Keep edits focused and architecturally sound.
3. **Completion needs evidence** — A task is completed ONLY when real, executed validators (typecheck, tests, build, live browser checks) pass after the last edit. Never claim success on stale or assumed evidence.
4. **Never exact-retry a failure** — If a test or command fails, do not repeat the same call blindly. Change diagnosis, inspect logs, and fix the root cause.
5. **Satisfy the contract** — Meet the exact user requirements directly on the real codebase. Never substitute real work with fake mock screens, hardcoded arrays, or disconnected demo suites.
6. **Say what you can't verify** — If something cannot be verified or tested directly, state it openly and explicitly. Zero hallucinations.

## Anti-Shortcut & Production Architecture Contract
- **NO FAKE DEMOS / NO MOCK REPLICAS**: Never generate disconnected demo routes or mock component suites (with fake data arrays like Rotten Tomatoes, Faire, etc.) when the user asks to build, revamp, or improve their application.
- **WORK DIRECTLY ON REAL LIVE PAGES**: Always modify and upgrade the real live pages (`apps/quantmail/src/app/...`) wired directly to the real backend APIs, database, and auth services.
- **CROSS-PLATFORM RIGOR**:
  - Desktop: True multi-pane flagship architecture (Outlook Web benchmark: App Rail + Folder tree + Message list + Split Reading Pane with inline composer).
  - Mobile: Full responsive viewport (zero fake phone simulator frames or bezels), native touch gesture physics (swipe left delete/flag, swipe right unread/archive, pull-to-refresh), and iOS/Android viewport safety.

## Required Verification
Before announcing any feature complete:
- TypeScript/Next.js: Typecheck (`tsc --noEmit`), unit/component tests (`vitest run`), production build (`next build`).
- Live Browser Proof: Verify in real browser / headless Chrome with screenshot proof and verifiable DOM assertions.
