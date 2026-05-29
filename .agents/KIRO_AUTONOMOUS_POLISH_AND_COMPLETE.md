# KIRO AUTONOMOUS MASTER PROMPT — QUANT ECOSYSTEM

## "POLISH THE REAL, FINISH THE HALF, THEN BUILD THE REST"

### Phase 62 → 105 · Deeply Detailed · Code-Level Honest

### v2 (May 29, 2026): re-audited after phases 62-68 shipped — see PART A2 + BLOCK 0 + BLOCK 8

> **Companion specs (read these — screen-by-screen verified audits):**
> - `.agents/QUANTMAIL_WIREUP_AND_UNIFY.md` — QuantMail deep audit + fix plan (Phase 66.1)
> - `.agents/ECOSYSTEM_FRONTEND_UNIFY_AND_AGENTIC.md` — all 13 apps: single-router/auth, missing
>   `/api` routes, brand/restyle, real-time WS, real AI streaming, and the AI-agentic control layer
>   (Phases 66.2–66.7 + 70.2). Backends are largely real; the frontends need wiring + brand + agentic.
> - `.agents/MASTER_BUILD_ORDER_AND_UIUX_BAR.md` — **the execution bible**: exact sequenced order
>   (Waves 0–4, one app per PR) + the per-screen premium UI/UX target for every screen of every app.
>   Start here to know what to build next and how good each screen must be.

> 21 phases (41-61) shipped breadth. Phases 62-68 then shipped real fixes (fake components killed, 4 frontends built, brand system, mocks wired). Now we close the declared-done-but-not debt (BLOCK 0), earn true depth, and build the agentic-internet moat (BLOCK 8).
> Every existing screen becomes beautiful, smooth, vibey, bug-free. Every half-built package gets finished. Every missing frontend gets built. Then — and only then — the remaining big features and the agentic-internet layer.
>
> Founder's order: **existing best banao (UI/UX, orientation, experience, animation, vibe) → phir baaki sab features → phir pura internet ko agentic ecosystem bana do.**

---

# PART A — CODE-LEVEL TRUTH (verified May 28, 2026)

Kiro: read this before touching anything. This is what the code actually is, not what the phase log claims.

## A.1 — The repo right now

- 2596 source files, 403k LOC, 684 test files, 71 packages, 16 apps
- Phases 0-61 marked complete in status JSON
- Status JSON is honestly self-reporting `typecheck: fail`, `build: fail` — good integrity, must fix

## A.2 — THE FIVE REAL PROBLEMS (fix these before any new feature)

### PROBLEM 1 — 42 components are FAKE (object-tree, not React)

These 7 apps have components that return plain JS objects (`{ type: 'div', children: [...] }`) instead of real JSX. **They will NOT render in a browser.** They look like code but are non-functional pseudo-markup:

- quantneon: 12 files
- quantads: 6 files
- quantai: 5 files
- quantmax: 5 files
- quantsync: 5 files
- quantube: 5 files
- quantedits: 4 files

Meanwhile 213 files ARE real JSX. So the codebase is inconsistent — half real, half fake. Every fake object-tree component must be rewritten as real React/JSX that actually renders.

### PROBLEM 2 — typecheck + build FAIL on 3 Next.js apps

quantai, quantmail, quantchat fail with React 19 `TS2786: 'Button' cannot be used as a JSX component` (11 errors). Root cause: dual `@types/react` resolution — shared-ui's built `.d.ts` references a different React types copy than the apps. This is a known, fixable React 19 monorepo issue (dedupe @types/react to a single version via pnpm overrides + ensure shared-ui emits correct JSX types). NOT a network issue.

### PROBLEM 3 — 4 core apps have NO frontend

- quantcalendar: NO `src/` (backend-only, 24 files)
- quantdocs: NO `src/` (backend-only, 39 files — Yjs ready, unused)
- quantdrive: NO `src/` (backend-only, 27 files)
- quantmeet: `src/` exists but 0 `.tsx` (only types; 23 backend files, LiveKit ready, unused)

A user literally cannot open these four apps.

### PROBLEM 4 — Late-batch packages (Phase 52-61) are thin skeletons

Compare LOC:

- EARLY (deep, real): quant-live 3034, device-control 2138, maps 1022, photos 590, notebook 476, browser-agent 488, code-agent 433
- LATE (thin skeletons): agent-swarm 169, voice-first-os **79**, data-warehouse **70**, wellbeing 103, spatial-ui 96, robotics-bridge 86, launch-beta 185, launch-public 182

Tests confirm: early packages 30-48 tests each; late ones 3-5 tests each. The late phases are structure, not implementation.

### PROBLEM 5 — ZERO branding

No logo, no icon, no brand asset anywhere in the repo. No visual identity. 16 apps with no cohesive look.

## A.3 — What's genuinely strong (DO NOT break)

auth, ai, realtime, payments, federation, quant-live, device-control, security, observability, agent-runtime, sync-engine, moderation, quant-notebook, browser-agent, code-agent, quant-health, iot-control, quant-commerce, bharat-ai. quantmail backend (78 files). Real Yjs, LiveKit, Triton, PhotoDNA adapters.

## A.4 — Honest level

Code-level ~45-50% to Meta+Google. Production-real ~12-15%. **Breadth raced ahead of depth.** This prompt rebalances: depth, polish, completion first.

---

# PART A2 — VERIFIED RE-AUDIT (May 29, 2026 — gates actually executed)

> Kiro: Part A above was the May 28 snapshot. Since then phases 62–68 shipped (git: 30+ commits, PRs #80–#82). I re-ran **every gate myself** and re-grepped the code. This section is ground truth. Trust this over the status JSON, the risk register, and the architecture map — all three are stale and contradict the code.

## A2.1 — What phases 62–68 ACTUALLY fixed (verified, not claimed)

| Part A problem                              | Status now                 | Evidence (re-verified)                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 — 42 fake object-tree components         | ✅ **FIXED**               | `grep -rn "type: 'div'" apps/*/src --include="*.tsx"` → **0 files**. All rewritten as real JSX.                                                                                                                                                                                                                                                                      |
| P2 — typecheck/build fail on 3 Next.js apps | ✅ **FIXED (per-project)** | All 7 Next.js apps (quantai/quantmail/quantchat/quantcalendar/quantdocs/quantdrive/quantmeet) build **PASS individually** on Next 15.5.18. `pnpm typecheck` warm run = **111/111 tasks pass**.                                                                                                                                                                       |
| P3 — 4 apps with no frontend                | ✅ **FIXED**               | quantcalendar/quantdocs/quantdrive/quantmeet each now have **13–14 `.tsx` files** in `src/`. All openable + branded.                                                                                                                                                                                                                                                 |
| P4 — thin skeleton packages                 | 🟡 **PARTIAL**             | LOC deepened a lot (agent-swarm 169→**723**, voice-first-os 79→**677**, data-warehouse 70→**726**, wellbeing 103→**612**, spatial-ui 96→**589**, robotics-bridge 86→**490**). BUT each still has **only 1 test file** vs the ≥15-meaningful-tests gate (early packages: quant-live 30, auth 26, device-control 25). **The Phase 64 test gate was not actually met.** |
| P5 — zero branding                          | ✅ **FIXED**               | `@quant/brand` package exists and is integrated across all 7 Next.js apps + shared-ui (PRs #81/#82). framer-motion primitives added.                                                                                                                                                                                                                                 |

**Verdict:** Real, substantial progress. 4 of 5 problems genuinely closed. But "complete" was declared on three things that aren't: thin-package tests, the build pipeline's reliability, and the Phase-68 polish (6 confirmed a11y bugs still open). And the state files lie about it.

## A2.2 — Gate truth (I ran these on May 29, 2026)

| Gate         | Status JSON claims | **Verified reality**                                                                                |
| ------------ | ------------------ | --------------------------------------------------------------------------------------------------- |
| install      | pass               | ✅ pass (`--frozen-lockfile`)                                                                       |
| typecheck    | **fail**           | ✅ **111/111 pass** (warm). ❌ **flaky on cold parallel run** — see BUG-1.                          |
| build        | **fail**           | 🟡 every app/pkg **passes individually**; `pnpm build` **non-deterministically fails** — see BUG-1. |
| test         | pass               | ✅ **114/114 tasks pass**                                                                           |
| lint         | pass               | ✅ **95/95 pass** (2 trivial warnings)                                                              |
| audit (high) | pass               | ✅ 0 high/critical — but **7 moderate + 1 low remain** (BUG-5)                                      |

**The status JSON saying `typecheck: fail` / `build: fail` is now WRONG and is itself a defect** (it will mislead every future agent and break CI dashboards). Fix it honestly (BUG-4) — do not just flip it to `pass`; flip it only after BUG-1 makes the aggregate run deterministic.

## A2.3 — THE NEW/REMAINING BUGS (verified, with evidence) — Kiro fixes these next

### BUG-1 — `pnpm build` + cold `pnpm typecheck` are FLAKY (CI blocker) 🔴

- **Symptom:** `pnpm build` fails on a **different Next.js app every run** (run 1: quantdocs; run 2: quantmeet; run 3: quantcalendar). Cold `pnpm typecheck` failed 8/84 then a warm re-run passed 111/111. Each failing app/package **passes when built in isolation**.
- **Root cause:** (a) Turbo runs ~7 heavy Next.js production builds in parallel → memory/CPU contention → non-deterministic OOM/exit; (b) composite project-reference ordering — dependents typecheck before a referenced package's `dist/.d.ts` is emitted (the old TS6305 race); (c) `WARNING no output files found for task @quant/database#build` (and governance/marketing/quant-mobile/status) → turbo `outputs` key misconfigured, so cache + ordering are unreliable.
- **Fix:**
  - Cap Next.js build parallelism (turbo `--concurrency`, or `concurrency` per-task, or split a `build:web` group that runs serially); set `NODE_OPTIONS=--max-old-space-size` appropriately.
  - Fix `turbo.json` `outputs` for every task that emits `dist/**`/`.next/**` so "no output files" warnings → 0.
  - Enforce `dependsOn: ["^build"]` for `typecheck` on composite-reference packages, OR drop `composite` where unused.
  - Make `@quant/database` Prisma generate a real turbo task with declared outputs.
- **Hard gate:** `pnpm build` and `pnpm typecheck` pass **3 cold runs in a row** (fresh `turbo` cache, `rm -rf node_modules/.cache .turbo`) with **zero** "no output files" warnings. THEN update status JSON.
- **Progress (this branch, May 29):**
  - ✅ `turbo.json` `build.outputs` now `["dist/**", ".next/**", "!.next/cache/**"]` (Next apps emit `.next`, not `dist`).
  - ✅ Per-package `turbo.json` with `outputs: []` for builds that intentionally emit nothing (`packages/database` prisma-generate, `packages/governance`, `apps/marketing`, `apps/quant-mobile`, `apps/status`).
  - ✅ Verified locally: **3 cold `pnpm build` runs = 94/94, ZERO "no output files" warnings**; cold `pnpm typecheck` = 117/117. The "no output files" warning class is now closed.
  - ✅ `ci.yml` build step → `pnpm turbo build --concurrency=3` + `NODE_OPTIONS=--max-old-space-size=6144` to stop the parallel-Next OOM (the actual `ci (22)` flake). **Cannot repro the OOM locally** (local builds are deterministic), so this mitigation must be **confirmed on the GitHub runner** before flipping the status JSON.
  - ⏳ Remaining for full BLOCK 0 close: confirm `ci (22)` is green over a few runs on real runners; composite project-reference race (TS6305) was not observed in cold typecheck (117/117) but keep `typecheck dependsOn ^build` in place.

#### BUG-1b — `test-and-coverage` CI job (root `vitest run --coverage`) — root-caused + partially fixed May 29 🟠

- **Symptom:** the `test-and-coverage` Quality-Gates job and the `ci (22)` job were red on PRs even for docs-only changes; locally `pnpm test` (turbo, per-package) passes **121/121** but `pnpm vitest run --coverage` (root, the exact CI command) failed.
- **Root cause (verified):** the root `vitest.config.ts` had no `include`/`exclude` and no per-file environment, so (a) it globbed **`e2e/**/*.spec.ts` Playwright specs** → **36 failed suites** (they need the Playwright runner, not vitest); (b) it ran everything in the **node** environment, so DOM-dependent unit tests (e.g. `packages/shared-ui` `sanitize.ts` / DOMPurify) silently no-op'd → **5 real failures**. `turbo test` passed because each package uses its own scoped config with `environment: 'jsdom'`.
- **Fixed (this branch):** root `vitest.config.ts` now sets `include` (packages/apps/services `*.{test,spec}.{ts,tsx}`), `exclude` (`e2e/**`, node_modules, dist, build), and `environmentMatchGlobs` (jsdom for shared-ui + `*.tsx`); coverage `exclude` now drops non-product code. Result: **712 test files / 7724 tests pass** under the exact CI command.
- **RESIDUAL (real debt, NOT faked):** the job still exits non-zero because real product line coverage is **~30%** vs the config's **50%** global threshold. This is genuine **BUG-2** test debt, not a config artifact. To make the check green, **write tests** (BUG-2 / Phase 64.1) — do NOT lower the threshold to pass. Note the dedicated `coverage-gate` job separately enforces 80% on auth/payments/security.

### BUG-2 — Phase 64 packages deepened in LOC but NOT in tests 🟠

- **Symptom:** agent-swarm, voice-first-os, data-warehouse, wellbeing, spatial-ui, robotics-bridge, launch-beta, launch-public, dev-platform each have **exactly 1 test file**. Phase 64's gate required **≥15 (some ≥30) meaningful tests on core paths**. The gate was marked passed without being met.
- **Fix:** For each, add real tests on core paths to hit the bar (agent-swarm: real 50-step goal exec + budget + conflict; voice-first-os: the command catalog + context detection + elder/phone-free modes; data-warehouse: NL→query + residency + export; etc.). No trivial `expect(true)` filler.
- **Hard gate:** Each package ≥15 meaningful test cases (≥30 for agent-swarm, voice-first-os), coverage ≥70% on the package's core modules. CI fails any "complete" package <200 LOC or <15 tests unless documented as genuinely tiny.

### BUG-3 — Phase 68 shipped 6 confirmed UI/a11y bugs (the polish is not done) 🟠

From the Phase 68 review (`.agents/tasks/task-phase-68-ui-ux-excellence/2025-01-27-215500-review.md`) — all **confirmed**, in `@quant/shared-ui` motion components:

1. **LoadingState reduced-motion still animates** — `prefers-reduced-motion` branch still uses CSS `animate-spin` / `animate-bounce` (continuous motion). Replace with static indicators.
2. **LoadingState skeleton variant ignores reduced-motion entirely** — `animate-pulse` unconditional. Gate it.
3. **StaggerList wrapper `<div>`s break semantic HTML** — wrapping a `<ul>` in `<div>` produces invalid markup, breaks `divide-y`, and the stagger applies to the wrapper not the items. Use `cloneElement`/`as` prop.
4. **`MotionProvider` is dead code** — exported, never consumed; every component independently calls `useReducedMotion`. Wire it or remove it (N redundant media-query listeners now).
5. **Inconsistent opt-out API** — shell/nav have `animated` prop; state components don't. Add for parity.
6. **Missing `'use client'` on motion components** — fragile for any future Server Component importer.

- **Hard gate:** All 6 fixed; reduced-motion audited across every animated component; axe-core zero violations; `MotionProvider` either consumed by all motion components or deleted.

### BUG-4 — State files lie (documentation integrity defect) 🟠

- `quant-autonomous-status.json`: `typecheck: fail`, `build: fail` → both now pass per-project (fix after BUG-1).
- `quant-risk-register.md`: "896 typecheck errors across 14 packages", "37 packages", "15 high next.js vulns" → all stale/false now.
- `quant-architecture-map.md`: "37 packages, 17 services" → actual **72 packages, 8 services**.
- `README.md`: "39 active packages", "17 services (10 stubs)" → actual **72 packages, 8 services**.
- **Fix:** Regenerate all four from the live tree (script it: count packages/apps/services, run gates, write results). Add a CI check that fails if status JSON gate values disagree with an actual gate run.
- **Hard gate:** Every state file matches reality; a `verify-state` CI job re-derives the numbers and diffs them.

### BUG-5 — 7 moderate + 1 low dependency vulns 🟡

- esbuild ≤0.24.2, vite ≤6.4.1, postcss <8.5.10, uuid <11.1.1, jsondiffpatch <0.7.2 (XSS), ai <5.0.52 (low). Mostly transitive (vitest/vite toolchain, next, firebase-admin, @quant/ai→ai).
- **Fix:** pnpm overrides to patched versions; bump vitest/vite, next, firebase-admin, ai SDK; re-audit.
- **Hard gate:** `pnpm audit` → 0 high/critical AND 0 moderate (or each remaining moderate documented as dev-only + unreachable with a dated waiver).

### BUG-6 — Core "REAL" surface is still NAIVE (the depth gap Part A.4 named) 🟡

Re-confirmed from `phase-18-truth-audit.md` and re-verified May 29: ML/recsys are pure-JS with random/untrained weights (neural-cf, two-tower, mmoe, ml-pipeline, ml-runtime); **QuantMeet `sfu.service.ts` STILL returns `Math.random()` ICE ports/candidates** (~lines 133/143) — a FAKE SFU, AND there is now ALSO LiveKit in the backend that is unwired to the UI → **two video paths, one fake, one orphaned** (consolidate: drop the fake SFU, wire LiveKit end-to-end); `csam-matcher.ts` is a no-op FAKE; the 12 agent pilots are rule-based (no LLM calls); search uses in-memory BM25 not the available Meilisearch. Services: search-indexer (1487 LOC, 11 tests) and moderation-worker (779 LOC, 6 tests) are genuinely real; ws-gateway (79 LOC, **0 tests**) and several others are thin/under-tested. **`@simulated` annotation count across the repo = 0** — BUG-6 honest-labeling has not started.

- **Scope:** This is the big lift already routed to **Phase 83 (Production Integrations)** + **Phase 64 deepening**. Do NOT silently ship these as "real." Each must either (a) wire to its real adapter (LiveKit/Triton/Qdrant/Meilisearch/PhotoDNA), or (b) be explicitly labeled `@naive`/`@simulated` in code + docs with a tracking issue. No more "REAL" claims on simulated code.
- **Hard gate:** Every service in the May-28 stub/fake/naive inventory is either wired to a real backend with a non-mocked integration test, or annotated `@simulated` and excluded from "production-real %" accounting.

## A2.4 — Re-sequencing after the re-audit

Phases 62–68 are **effectively done** (with the BUG-1…BUG-6 debt above). So:

> **NEW IMMEDIATE ORDER:** Do **BLOCK 0 (BUG-FIX SPRINT, below)** first — it closes the debt that was declared done but isn't. THEN resume the original plan at **Phase 69 (Zero-Defect Hardening)** → 70 → 71 → 72, then Block 5+ features. The sequencing law still holds: Blocks 1–4 truly green before Block 5 features.

---

# BLOCK 0 — BUG-FIX SPRINT (do FIRST, before resuming Phase 69)

These are the verified-defect phases. Each maps to a BUG above. Close all six, paste evidence to the phase log, then continue to Phase 69.

| Phase    | Title                                  | Closes | Definition of done                                                                                  |
| -------- | -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| **62.1** | Deterministic build/typecheck pipeline | BUG-1  | 3 cold runs green, 0 "no output files" warnings, turbo outputs + concurrency + composite refs fixed |
| **62.2** | Honest state files + CI guard          | BUG-4  | All 4 state docs match the live tree; `verify-state` CI job added                                   |
| **64.1** | Real tests for deepened packages       | BUG-2  | 9 packages each ≥15 meaningful tests (agent-swarm/voice-first-os ≥30), coverage ≥70% core           |
| **68.1** | Finish the polish (motion/a11y fixes)  | BUG-3  | 6 Phase-68 review issues fixed; reduced-motion correct everywhere; axe zero                         |
| **69.0** | Dependency vuln remediation            | BUG-5  | `pnpm audit` 0 high/critical + 0 unwaived moderate                                                  |
| **83.0** | Honest-labeling of simulated core      | BUG-6  | Every naive/fake/stub annotated `@simulated` or wired real; "production-real %" recomputed honestly |

**BLOCK 0 exit:** the three things declared done-but-not (tests, pipeline reliability, polish) are actually done; nothing in the repo claims to be more real than it is. Now Phase 69 can hold a true zero-defect line.

---

# PART B — OPERATING RULES (all prior 33 + these)

34. **No fake components.** Every component returns real, renderable JSX. Zero object-tree pseudo-markup. CI greps for `type: 'div'` object patterns in `.tsx` and fails.
35. **Gates are green or we don't ship.** typecheck, build, test, lint, audit-high — all pass before any phase closes. The React 19 issue is fixed in Phase 62, then stays fixed.
36. **Depth before breadth.** A package marked "complete" must have real implementation (not a 70-LOC skeleton) and ≥15 meaningful tests on its core paths.
37. **Every screen: the vibe bar.** Every screen must feel premium — smooth 60fps, spring animations, proper orientation/responsive, delightful microinteractions, branded, themed. "Functional" is not enough; it must feel good.
38. **Polish is a deliverable, not a nice-to-have.** UI/UX work ships as its own PRs with before/after evidence (screenshots, Lighthouse, axe, FPS).

---

# PART C — PHASES 62 → 95

**Hard sequencing law:** Phases 62-72 (fix + polish + complete + brand) MUST finish before Phases 73+ (new features). Completion before conquest.

---

## ═══════════════════════════════════════════

## BLOCK 1: FIX & FOUNDATION (Phases 62-64)

## ═══════════════════════════════════════════

### PHASE 62 — Green the Gates (zero TypeScript/build errors)

**Goal:** typecheck + build pass across the entire monorepo. Zero errors. This unblocks everything.

**Tasks:**

1. **Fix React 19 dual-types issue:**
   - Add `pnpm.overrides` in root `package.json` pinning `@types/react` and `@types/react-dom` to one exact version (19.x) across the whole workspace
   - Ensure shared-ui emits proper JSX component types (verify `React.FC` returns `ReactElement`, tsconfig `jsx: react-jsx`, `moduleResolution: bundler`)
   - Rebuild shared-ui `.d.ts`, verify quantai/quantmail/quantchat typecheck clean
2. **Fix the build-order TS6305 errors:**
   - Ensure turbo `dependsOn: ["^build"]` so dependency packages build before dependents typecheck
   - Verify `@quant/common`, `@quant/auth` chain builds correctly
3. **Fix Prisma generation in CI:**
   - Document the `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING` requirement OR vendor the prisma engine; ensure `@quant/database` typechecks in CI
4. **Zero-error verification:**
   - `pnpm typecheck` → 0 errors, all 84 tasks pass
   - `pnpm build` → all tasks pass
   - `pnpm lint` → 0 errors
   - `pnpm test` → 0 failures

**Hard gates:**

- All 6 gates green (paste full output to phase log)
- Status JSON updated: every gate `pass`
- No `@ts-ignore` / `@ts-expect-error` added to hide errors (CI greps for new ones)

**Exit:** The build is clean. We can trust green.

---

### PHASE 63 — Kill Every Fake Component (42 object-tree files → real React)

**Goal:** Every component renders in a real browser. Zero pseudo-markup.

**Tasks:**

1. Inventory all 42 object-tree components (the grep list: quantneon 12, quantads 6, quantai 5, quantmax 5, quantsync 5, quantube 5, quantedits 4)
2. Rewrite each as real React/JSX with:
   - Proper component signature (`React.FC<Props>`)
   - Real JSX return
   - Real event handlers (not stubbed)
   - Tailwind/brand styling (real classes, not just class strings on fake nodes)
   - Loading / empty / error states
   - Accessibility (ARIA, keyboard, tap targets)
3. Wire each to real data (React Query hooks → real backend); no mock arrays
4. Verify each renders + functions in a real browser (Playwright smoke test per component)

**Hard gates:**

- `grep -rn "type: 'div'" apps/*/src --include="*.tsx"` returns 0
- Every rewritten component renders in Playwright
- Every component has loading/empty/error/success states
- axe-core zero violations per component

**Exit:** Every component is real, renderable, accessible, wired.

---

### PHASE 64 — Finish the Thin Packages (skeletons → full implementations)

**Goal:** Every "complete" package is actually complete. The Phase 52-61 skeletons get real implementations.

**Packages to deepen (current LOC → target real implementation):**

1. **agent-swarm (169 LOC):** Full orchestrator — goal decomposition, NATS message bus between agents, Y.Doc shared scratchpad, conflict resolution, per-goal budget (time/money/tokens), failure handling + retry, live observation UI hooks, audit. Target: real 50-step goal execution. ≥30 tests.

2. **voice-first-os (79 LOC):** Full implementation — the 100 voice commands (the catalog), wake-word integration, ambient context detection (driving/walking/meeting/home), elder mode, phone-free mode controller, privacy lamp, watch/glasses bridge. Wire to quant-live + device-control + quant-tools. ≥30 tests.

3. **data-warehouse (70 LOC):** Real implementation — DuckDB/Parquet, NL→query, time-series of activity, residency selector, export in open formats, "where is my data" inspector. ≥20 tests.

4. **wellbeing (103 LOC):** Full — time-well-spent, doom-scroll detector, compulsion-pattern detection, crisis intervention (regional helplines), AI integrity guards, regret-rate tracking, "Quant retreat" mode. ≥20 tests.

5. **spatial-ui (96 LOC):** Real WebXR — session management, spatial panels (room/head-anchored), hand-tracking gestures, eye-tracking hooks, spatial audio, per-app spatial layouts (Meet holographic, Docs floating). ≥20 tests.

6. **robotics-bridge (86 LOC):** Real adapters — Matter/HomeKit/Roborock/ROS2, command dispatch, safety review per action, kill-switch, audit. ≥15 tests.

7. **developer-platform / launch-beta / launch-public:** Deepen to real implementations (API key lifecycle, marketplace, cohort management, feature flags, status engine, store-submission tracking). ≥15 tests each.

8. **Any other package <200 LOC that's marked complete:** audit and deepen.

**Hard gates:**

- Every package ≥15 meaningful tests on core paths (not trivial)
- No package marked "complete" with <200 LOC unless genuinely tiny by nature (document why)
- Each deepened package has a real demo flow in staging
- agent-swarm executes a real 50-step goal; voice-first-os runs the 100 commands

**Exit:** "Complete" means complete. No more skeletons hiding behind a passing 3-test suite.

---

## ═══════════════════════════════════════════

## BLOCK 2: COMPLETE THE MISSING (Phases 65-66)

## ═══════════════════════════════════════════

### PHASE 65 — Build the 4 Missing Frontends (Calendar, Docs, Drive, Meet)

**Goal:** Every app is openable. The 4 backend-only ghosts get full, beautiful, wired frontends.

**Tasks:**

1. **QuantCalendar (`apps/quantcalendar/src/`):**
   - Views: month, week, day, agenda, year, schedule
   - Event CRUD with drag-to-reschedule, drag-to-resize
   - Multiple calendars, color coding, overlays
   - Recurring events (RRULE), time zones, all-day events
   - QuantMeet integration (one-click video event)
   - Smart scheduling ("find 30 min with Riya"), natural-language create
   - Reminders, invites, RSVP, free/busy
   - CalDAV sync (backend exists)
   - Mini-calendar, today button, keyboard nav
   - Wire to existing 24-file backend

2. **QuantDocs (`apps/quantdocs/src/`):**
   - Rich text editor — **wire the existing Yjs backend** (real-time collab)
   - Presence (avatars, cursors, selections), comments anchored to text
   - Suggestion mode (accept/reject), version history with named checkpoints
   - Doc branching (backend exists), whiteboard, code blocks
   - Templates, folders, sharing UI (permission tiers)
   - AI sidebar: rewrite, summarize, translate, expand, brain-dump (voice)
   - Export (PDF, DOCX, Markdown)
   - Wire to existing 39-file backend

3. **QuantDrive (`apps/quantdrive/src/`):**
   - File browser (grid + list + columns), breadcrumbs, sort/filter
   - Drag-drop upload (multi, folder), resumable, progress
   - Preview: images, PDF, video, audio, docs, code (with syntax highlight)
   - Sharing + permissions UI, link expiry, password
   - Search (semantic + filename), starred, recent, trash, restore
   - Storage usage visualization
   - AI: auto-organize, "find my tax docs", duplicate finder
   - Wire to existing 27-file backend

4. **QuantMeet (`apps/quantmeet/src/`):**
   - Pre-join lobby: camera/mic preview, device picker, background blur/replace, network check
   - In-meeting: grid + speaker + spotlight views, screen share, chat sidecar, reactions, raise hand, participant list, per-participant volume
   - Recording controls, breakout rooms, polls, knock-to-join
   - Live captions (Whisper streaming), live translation
   - AI meeting notes + action items → QuantCalendar/QuantChat
   - Post-meeting summary + recording access
   - **Wire the existing LiveKit backend** (23 files)
   - Mobile + desktop layouts

**Hard gates:**

- All 4 apps open to a real, navigable, branded UI
- Zero mock data — every screen wired to real backend
- QuantDocs: 2 users edit the same doc live (Yjs working in UI)
- QuantMeet: 2 users join, video flows (LiveKit working in UI)
- E2E test per app, Lighthouse ≥90, axe zero violations, responsive 360→1440px
- Cross-app links: Calendar↔Meet, Docs↔Drive all work

**Exit:** All 16 apps are real, openable, usable. No ghosts.

---

### PHASE 66 — Wire Every Remaining Mock + Connect Every Flow

**Goal:** Zero mock data anywhere. Every flow connected end-to-end across all 16 apps.

**Tasks:**

1. Full audit of all `apps/*/src/` for mock/hardcoded data
2. Each mock → real backend endpoint (build if missing) → React Query wire
3. Every screen: skeleton, empty, error, success states
4. Every button/link does something real (no `onClick={() => {}}`, no dead hrefs)
5. Every form: validation + submit + error handling
6. Optimistic updates + rollback for all mutations
7. Real-time WS updates for live data
8. Every cross-app navigation verified

**Hard gates:**

- `grep -rn "mock\|Mock\|fakeData\|sampleData" apps/*/src --include="*.tsx"` returns 0 (excl. tests)
- Route crawler: every route loads, every button works, zero dead-ends
- E2E click-through of all 16 apps: no broken flows

**Exit:** Every pixel = real data through a real flow. Nothing fake remains.

---

## ═══════════════════════════════════════════

## BLOCK 3: BRAND & POLISH (Phases 67-69)

## ═══════════════════════════════════════════

### PHASE 67 — Brand System & Visual Identity

**Goal:** Quant gets a soul. One cohesive identity across 16 apps.

**Tasks:**

1. **`packages/brand`:**
   - Quant master logo (wordmark + symbol), SVG, light/dark, all sizes
   - Per-app logos/icons — cohesive family, distinct hue per app (Mail=blue, Chat=green, etc.)
   - Full app icon set (iOS/Android/web/favicon, every required size + maskable)
   - Color system: brand palette + per-app accent + semantic + 6 themes (dark/light/neon/Bharat/high-contrast/colorblind-safe)
   - Type system: display + body + mono with Indic scripts (Devanagari/Tamil/Bengali/Telugu/etc.)
   - Illustration style (empty states, onboarding, errors) — warm, India-aware, consistent
   - Icon library (~300 icons, consistent line/fill)
   - Motion tokens (spring physics: damping/stiffness, transition curves)
   - Sound design (notification, success, error — subtle)
2. Apply across ALL apps (AppShell, splash, icons, loading)
3. Rebrand marketing site + status page
4. `docs/brand/BRAND.md` guidelines

**Note:** Kiro generates strong SVG logos programmatically for v1. Flag if human designer wanted for master mark — but never block; ship a great AI v1.

**Hard gates:**

- Complete brand package exists as code/assets
- Every app visibly uses it
- All store icon sizes generated
- Contrast WCAG AA (AAA for high-contrast theme)

**Exit:** Quant looks like one beautiful product.

---

### PHASE 68 — UI/UX Excellence Pass (every screen, orientation, experience, animation, vibe)

**Goal:** The founder's core ask — every existing screen becomes premium: best orientation, experience, UI/UX, animation, vibe.

**Tasks (apply to EVERY screen in ALL 16 apps):**

1. **Orientation & responsive:**
   - Perfect at 360 / 414 / 768 / 1024 / 1440px
   - Portrait + landscape on mobile/tablet
   - Foldable-aware, tablet sidebar layouts
   - Safe-area insets (notch, home indicator)

2. **Animation & motion (the "vibe"):**
   - Spring physics everywhere (Framer Motion `spring`, never linear)
   - Page transitions (shared element / hero animations between list↔detail)
   - Stagger animations for lists
   - Micro-interactions: button press, toggle, like, send — all springy + haptic
   - Skeleton → content fade-in
   - Pull-to-refresh with custom branded animation
   - Bottom sheet spring physics
   - Scroll-linked animations (parallax headers, sticky transforms)
   - Confetti/celebration moments (first post, milestone)

3. **Experience polish:**
   - Optimistic UI for every action + rollback shake on fail
   - Loading priorities: skeleton → low-res → high-res images (blurhash)
   - Empty states with branded illustration + personality + CTA
   - Error states: human copy + recovery action
   - 60fps scroll verified on mid-tier Android (fail PR if <50fps)
   - Tap targets ≥44px, hover/press/focus states everywhere
   - Smooth keyboard handling (no layout jump on mobile keyboard)

4. **Vibe details:**
   - Per-app accent personality
   - Sound design on key actions (subtle, optional)
   - Delightful copy (warm, human, India-aware, never robotic)
   - Dark mode that's actually beautiful (not just inverted)
   - Smooth theme transitions (animated, not flash)

5. **Consistency:**
   - Every screen uses brand system (Phase 67)
   - Consistent spacing, radius, shadows, type scale
   - Command palette (Cmd+K) on every app
   - Universal capture (Cmd+Shift+Q) everywhere

**Hard gates:**

- Every screen: Lighthouse ≥90, axe zero violations, 60fps scroll
- Visual regression baseline (top 100 screens), all green
- Every theme perfect on every screen
- Microinteraction checklist passed per screen (documented)
- Before/after screenshots in each polish PR

**Exit:** Quant feels premium and vibey everywhere. Not one screen looks unfinished or janky.

---

### PHASE 69 — Zero-Defect Hardening

**Goal:** Founder's demand — not one bug, error, security hole, or disconnect.

**Tasks:**

1. Zero TS errors, zero lint, zero test failures (maintain from Phase 62)
2. Zero console errors/warnings at runtime in any app (automated check)
3. Zero a11y violations (axe on every page)
4. Zero broken links / dead-ends (route crawler checks every route + button)
5. Zero disconnected flows (every cross-app link + state transition verified)
6. Coverage ≥80% on critical paths
7. Security: pen test (OWASP, API fuzzing, auth bypass), mTLS, WAF, rate limits, secret mgmt, container scan (Trivy), compliance (GDPR/DPDP/COPPA), bug bounty
8. Error monitoring (Sentry/GlitchTip) on everything
9. Chaos testing: kill services, verify graceful degradation

**Hard gates:**

- CI: 0 TS / 0 lint / 0 test-fail / 0 axe
- Runtime: 0 console errors (automated across all apps)
- Crawler: every route + button works, no dead-ends
- Pen test: 0 HIGH/CRITICAL unmitigated

**Exit:** No bugs, no errors, no security holes, no broken flows. Trustworthy.

---

## ═══════════════════════════════════════════

## BLOCK 4: QUANTAI CONTROLS EVERYTHING (Phases 70-72)

## ═══════════════════════════════════════════

### PHASE 70 — Universal Tool Layer (every app action = AI-callable tool)

**Goal:** Anything a human can do in any app, QuantAI can do. The control surface.

**Tasks:**

1. **`packages/quant-tools`** — every app exposes typed tools (auto-gen from OpenAPI):
   - Mail, Chat, Calendar, Docs, Drive, Meet, Neon, Sync, Tube, Max, Edits, Ads, Maps, Photos, Device, Studio, Payments — every core action
   - Each tool: typed I/O, permission tier, cost estimate, undo recipe, audit
2. Tool discovery + multi-tool planning (QuantAI routes intent → tools across apps)
3. Permission engine + risk tiers (confirm tier≥2, cost preview, undo, audit)
4. MCP exposure (external AI clients drive Quant)

**Hard gates:**

- Every app exposes ≥5 core actions as tools
- QuantAI executes multi-app plan ("find file in Drive → attach to email → send") in staging
- Every tool call confirmed/audited per tier
- MCP server works with external client

**Exit:** The control layer exists. QuantAI can operate the whole ecosystem.

---

### PHASE 71 — QuantAI Codex (build & deploy by voice) + Cross-App Automation

**Goal:** "QuantAI, ek game banao" → repo created, agents build, published. "Daily reel QuantTube pe daalo" → automation built, scheduled, running.

**Tasks:**

1. **QuantAI Codex** (extend quantai + git-server + code-agent):
   - Voice/text "build X" → create repo in QuantMail-Git → scaffold → multi-agent build (logic + art via generative-media + sound + tests) → build + test in sandbox → iterate by talking → publish/deploy
   - Full repo UI: branches, commits, PRs, CI, deploy logs
   - Deploy targets: Quant Store, user's Quant space, self-host export, external (GitHub/Vercel)

2. **`packages/quant-automate`** (rebuild cross-app-workflows to production):
   - Triggers: schedule (cron), event, webhook, manual, AI-condition
   - Actions: any quant-tool
   - Conditions, branches, loops, retries, durable execution (queue + state, not in-memory)
   - NL builder: "har subah 8 baje QuantTube pe reel, QuantEdit se trending template + mera brand kit" → QuantAI builds it
   - The daily-reel automation works end-to-end (generate → edit → schedule → post → report)

**Hard gates:**

- Voice → repo → game built → tested → published → playable (full E2E)
- Daily-reel automation runs on schedule end-to-end
- Automations durable (restart mid-run, resumes)
- Every action audited, cost-capped, undoable

**Exit:** User builds apps and runs automations by voice, across apps, without touching the screen.

---

### PHASE 72 — Phone-Free Agentic Living (tie it together)

**Goal:** Quant Live + Device Control + Universal Tools + Codex + Automate = one voice experience.

**Tasks:**

1. Quant Live invokes any tool, builds (Codex), automates (Automate), controls device
2. Phone-free mode: screen shows only Quant Live; everything by voice
3. Proactive Daily Brief suggests automations, surfaces what needs attention
4. Context-aware (knows current app/screen)
5. Continuity across phone/watch/glasses/desktop

**Hard gates:**

- Voice-only session: build a game + set automation + send emails + join meeting + control home — no screen touch
- Phone-free mode: full day by voice
- Quant Live invokes tools across ≥5 apps in one session

**Exit:** The founder's vision realized — talk to Quant, everything happens.

---

## ═══════════════════════════════════════════

## BLOCK 5: THE REMAINING BIG FEATURES (Phases 73-82)

## ═══════════════════════════════════════════

Only after Blocks 1-4 (gates green, components real, packages deep, frontends built, mocks wired, branded, polished, zero-defect, QuantAI controls everything) does Kiro build the remaining features.

### PHASE 73 — BYOC + Quant Credits Economy

Users bring their own AI (OpenAI/Anthropic/Gemini/Groq/local) OR buy Quant Credits. Transparent pricing, free daily allowance, local-first AI (WebGPU/CoreML/NNAPI), model picker in AppShell, encrypted key vault, spend dashboard, creator earning. (Full spec: prior prompt Phase 45/55.)

### PHASE 74 — Quant Studio (Universal UGC Builder)

Anyone builds games/apps/tools/lenses/agents — vibe-code, visual, real code, or import (Godot/Phaser/Unity WebGL). `.qapp` sandboxed format, Quant SDK (identity/scores/multiplayer/AI/storage/tips). Publish + remix + earn. **Sandbox security is P0** — red-team ruthlessly. (Full spec: prior prompt Phase 46/56.)

### PHASE 75 — Cross-App Gaming + Social Play

Same game playable in QuantChat (Snapchat-style), QuantMax random video (Omegle++, anonymous-then-consent-reveal), QuantNeon feed, QuantMeet icebreakers. One identity, universal leaderboard. Minor-safe. (Full spec: prior prompt Phase 47/57.)

### PHASE 76 — AR Lenses + Face Games

Real-time face/hand/body tracking, AR overlays, generative lenses, user-built lenses (Lens Studio), cross-app. Ethical filter design. (Full spec: prior prompt Phase 48/58.)

### PHASE 77 — Gemini-Omni-class Generative + Agentic 2.0

Any-to-any media gen with provenance (SynthID/C2PA), object-level image editing, Quant Flow (AI filmmaking + vibe-coded tools), Information Agents, Daily Brief/Spark, Universal Cart, voice brain-dump. Beat Antigravity/Flow/Info-Agents with BYOC + cross-app edge. (Full spec: prior prompts.)

### PHASE 78 — Smart Glasses + Wearables

Meta Ray-Ban, Quest, Vision Pro, Pixel/Apple Watch, Xreal. Glasses HUD, voice, camera passthrough, real-time translation overlay, cross-device handoff.

### PHASE 79 — Creator Economy 2.0

UGC monetization full loop: tips, paid apps, IAP, ad revshare, remix royalties. Creator dashboard, payouts, taxes, tiers, brand partnerships. Quant Credits as in-ecosystem currency.

### PHASE 80 — Quant App Store + Discovery

In-ecosystem store for all UGC. Ranking (quality+trust, not engagement-max), categories, reviews, cross-app distribution.

### PHASE 81 — Quant for Teams / Workspace Edition

Org accounts, SSO/SCIM, admin console, shared workspaces, team agents, compliance, per-seat pricing, enterprise BYOC. B2B revenue.

### PHASE 82 — Federation + Open Ecosystem Completion

Full ActivityPub, Matrix, CalDAV/CardDAV/IMAP/SMTP, AT Protocol, MCP server, public API, UGC portability, self-host edition complete.

---

## ═══════════════════════════════════════════

## BLOCK 6: SCALE & LAUNCH FOR REAL (Phases 83-90)

## ═══════════════════════════════════════════

### PHASE 83 — Production Integrations (real, not simulated)

Real: LiveKit deploy + TURN, Twilio account + numbers, PhotoDNA partnership (or flag-off), Razorpay/Stripe/UPI merchant accounts, Triton serving, Qdrant/Meilisearch/NATS/Redpanda clusters, protomaps tile server. Real Prisma migrations, connection pooling, read replicas, backup/restore drills. Every external integration has a real (non-mocked) integration test.

### PHASE 84 — Performance + Cost + Scale

p95/p99 budgets CI-gated, multi-layer caching, DB optimization, async queues, AI cost optimization (route by complexity, cache embeddings, self-host small models), media optimization, cost dashboards. Sustainable unit economics at 10M users.

### PHASE 85 — Observability + SRE + Reliability

Full OTel (incl. LLM cost), Prometheus RED/USE/business metrics, centralized logs (PII-scrubbed), Grafana dashboards, alerts+runbooks+PagerDuty, SLOs+error budgets, chaos game days, synthetic monitoring, DR (RTO<4h RPO<1h, quarterly drills).

### PHASE 86 — Bharat-Scale Completion

12+ Indian languages across all apps + UGC + games, voice in all (AI4Bharat/Sarvam), lite mode <5MB, Aadhaar e-KYC + DigiLocker + UPI + ONDC, voice-only onboarding, festival modes, family accounts, offline-first, localized everything.

### PHASE 87 — Complete Mobile App

quant-mobile gets all 16 apps inside, native plugins (push/camera/biometric/haptics/share/deeplink/bgsync/WebRTC), Quant Live central, offline-first, widgets, Live Activities, Dynamic Island, store assets. Installs + runs on real Android + iPhone.

### PHASE 88 — Full E2E Coverage + Quality Gate

Playwright covers all 16 apps + cross-app + UGC build+play + BYOC + agents + games + random chat + payments. Real docker-compose.test.yml with all services. Multi-browser/device, visual regression (top 100), API contract tests, perf regression, axe on every page.

### PHASE 89 — Staging + Internal Dogfooding

Real Terraform staging cluster, Helm via ArgoCD, real domain+TLS, synthetic monitor green 72h, team dogfoods as primary 6 weeks, bug bash, capacity+cost validation.

### PHASE 90 — Closed Beta → Public Launch

10k beta (power/mainstream/elderly/Hindi-only/creators/businesses/minors-with-guardians), 8-week program, retention/NPS dashboards, daily triage, UGC seeding (500 builders). Then: App Store + Play Store submission, marketing site live, press, status page, docs, dev portal, founder content, bug bounty, Quant Coach support, partnerships. D30≥25%, NPS≥40, 1000+ UGC apps at launch.

---

## ═══════════════════════════════════════════

## BLOCK 7: POST-LAUNCH (Phases 91-95)

## ═══════════════════════════════════════════

91: Growth engine · 92: Revenue optimization · 93: International · 94: Education edition + frontier · 95: Continuous evolution (weekly council, monthly arch review, quarterly major ship, annual security audit, sunset policy).

---

## ═══════════════════════════════════════════

## BLOCK 8: THE AGENTIC INTERNET (industry-killer differentiators · Phases 96-105)

## ═══════════════════════════════════════════

> Founder's order: **"ye pura internet ecosystem hoga, agentic."** Blocks 1–7 make Quant a great 16-app suite. Block 8 makes it the thing Meta and Google _structurally cannot_ ship — because their business is your attention and your data, and ours is the opposite. This is the moat: **user-owned, agent-operated, open, cross-app, on-device-capable.** Build only after Blocks 1–4 are truly green (Block 0 done, gates real, polish real).
>
> Why this wins where Big Tech can't:
>
> - Google/Meta are **siloed** (Gmail can't act in Instagram). Quant has **one cross-app graph + one tool layer** → agents act everywhere at once.
> - They **own your data and model**. Quant is **user-owned AI + BYOC + local-first** → you own the agent and the memory; export anytime.
> - They are **closed**. Quant is **federated + open protocols + self-hostable** → no lock-in is itself the feature.
> - They optimize **engagement**. Quant optimizes **outcomes + wellbeing + time-well-spent** → trust is the product.

### PHASE 96 — Quant Agentic Web Layer (do anything on the _external_ internet)

Productionize `browser-agent` + `quant-tools` into a real "operate the whole web for me" agent: navigate any site, fill forms, compare/book/buy, extract+watch+notify, multi-tab plans, vision-grounded clicking, CAPTCHA/2FA handoff to the user, full action replay + undo. Sandboxed, permissioned, every action audited and cost-capped.

- **Hard gate:** agent completes a real 10-step cross-site task in staging (e.g. "compare 3 flights, hold the cheapest refundable, add to QuantCalendar") with full audit + undo. Zero un-consented purchases.

### PHASE 97 — User-Owned AI + Lifelong Memory Graph (the anti-Big-Tech core)

Deepen `user-owned-ai` + `ai-memory` + `universal-timeline` into one **personal AI that the user owns**: a private, encrypted, exportable lifelong memory/knowledge graph across all 16 apps + the web; consent receipts for every read; "what does my AI know about me" inspector; full export + delete + portability (take your AI to another host). Powers proactive intelligence no silo can match.

- **Hard gate:** every memory write has a consent receipt; full export produces a portable, re-importable bundle; "forget this" provably erases (verified).

### PHASE 98 — Quant OmniModel (real-time any-to-any) + On-Device Frontier

Real-time multimodal omni assistant (voice+vision+text+screen, Gemini-omni / GPT-realtime class) wired through BYOC + Quant Credits, with **on-device frontier models** (WebGPU/CoreML/NNAPI) for privacy + offline + cost. Model picker per task; cost/latency router; graceful local↔cloud fallback.

- **Hard gate:** live screen+voice session with <500ms turn latency on cloud, and a usable offline on-device path with zero network.

### PHASE 99 — Agent-to-Agent Economy (A2A protocol + agent commerce)

An open **agent-to-agent protocol**: your Quant agent discovers, negotiates with, and transacts with other people's and businesses' agents (book a table, negotiate a price, schedule across orgs). Agent identity + reputation + verifiable credentials + spend limits + escrow via `payments`. MCP + open spec so non-Quant agents can participate.

- **Hard gate:** two independent Quant agents complete a real negotiated transaction (with escrow + audit) end-to-end; an external MCP agent interoperates.

### PHASE 100 — Trust & Provenance for the Agentic Web

Verifiable agent actions (signed action logs), content provenance everywhere (C2PA/SynthID on all generative output), consent receipts, "who/what did this" inspector on every AI/agent action, deepfake + AI-content labeling across all feeds. Make Quant the **trust layer** of the agentic internet.

- **Hard gate:** every agent action and every generated asset is provenance-tagged and independently verifiable; feeds label AI content with ≥95% recall on a red-team set.

### PHASE 101 — Sovereign Data & Local-First Everywhere

Extend `local-first` + `encryption` so every app works offline-first with CRDT sync, end-to-end encryption by default, and **data sovereignty** (user picks region/host, or self-hosts). Zero-knowledge where possible. Position: _we can't sell your data because we can't read it._

- **Hard gate:** all 16 apps usable offline with conflict-free sync on reconnect; E2E-encrypted stores; self-host edition passes the same E2E suite.

### PHASE 102 — Bharat Agentic Commerce (ONDC-native, voice-first)

Agentic shopping/services over **ONDC** + UPI + DigiLocker, voice-only in 12+ Indian languages, for the next-billion users: "मेरे लिए सबसे सस्ता आटा मंगवा दो" → agent finds, compares, orders, pays, tracks. Lite (<5MB), offline-tolerant, family-account safe.

- **Hard gate:** voice-only, Hindi, end-to-end ONDC order + UPI pay + track on a <5MB lite client; works on a low-end Android.

### PHASE 103 — The Quant Graph (cross-app proactive intelligence)

Unify the per-app data into one **cross-app knowledge graph** powering Daily Brief/Spark: "your flight moved → I shifted your 3pm, told Riya, and pre-drafted the reschedule email." The thing siloed Big Tech literally cannot do. Privacy-scoped, consent-gated, fully explainable ("why am I seeing this").

- **Hard gate:** a real proactive multi-app action chain fires from a single real-world event, fully explainable + reversible.

### PHASE 104 — Open Federation & Anti-Lock-In Completion

Complete Phase 82 to its strategic end: full ActivityPub/Matrix/AT-Proto/CalDAV/CardDAV/IMAP/SMTP, public API + MCP server, one-click **full export of everything** (data + AI + UGC + automations), and a self-host edition that is feature-complete. Lock-in-freedom as a marketed, tested guarantee.

- **Hard gate:** a user exports their entire Quant life and re-imports it into a self-hosted instance with zero loss; federation interop tested against real Mastodon/Matrix/Bluesky.

### PHASE 105 — Safety, Alignment & Agent Governance at Scale

Ecosystem-wide agent governance: capability tiers, kill-switches, rate + spend caps, red-team harness for every agent + UGC sandbox, minor-safety across all agentic surfaces, model-misuse detection, incident response, and a public **Agent Safety Charter**. The agentic internet only works if it's trustworthy by construction.

- **Hard gate:** red-team suite green across web-agent, A2A, Studio sandbox, and child-facing surfaces; documented kill-switch drill; published charter.

**BLOCK 8 exit:** Quant is not a suite of apps — it's the **user-owned, open, agentic layer over the whole internet**: your AI, your data, acting for you everywhere, verifiably and reversibly. That is the thing the incumbents can't copy without dismantling their own business model.

---

## SECTION D — THE VIBE BAR (what "best UI/UX/animation/vibe" means concretely)

Every screen must pass this checklist (Phase 68 enforces, but it applies to all UI work forever):

**Motion:**

- [ ] Entrance animation (fade/slide/scale with spring)
- [ ] List items stagger in
- [ ] Page transition (shared element where logical)
- [ ] Button/toggle/like = springy + haptic
- [ ] Skeleton → content crossfade
- [ ] Scroll-linked effects where tasteful (parallax, sticky transforms)
- [ ] Celebration moments (milestones)
- [ ] Theme switch animated, not flash

**Orientation/Responsive:**

- [ ] Perfect 360→1440px
- [ ] Portrait + landscape
- [ ] Safe-area insets
- [ ] Tablet/foldable layouts
- [ ] No layout jump on keyboard open

**Experience:**

- [ ] Optimistic UI + rollback
- [ ] Skeleton/empty/error/success states all designed
- [ ] Blurhash image placeholders
- [ ] 60fps scroll (mid-tier Android)
- [ ] Tap targets ≥44px
- [ ] Hover/press/focus states
- [ ] Pull-to-refresh, swipe actions

**Vibe:**

- [ ] Brand system applied (Phase 67)
- [ ] Per-app accent personality
- [ ] Warm, human, India-aware copy
- [ ] Beautiful dark mode (designed, not inverted)
- [ ] Subtle sound design (optional)
- [ ] Delightful empty states with illustration
- [ ] Command palette + universal capture

**Quality:**

- [ ] Lighthouse ≥90
- [ ] axe-core zero violations
- [ ] Keyboard navigable
- [ ] Real data (no mock)
- [ ] All flows connected (no dead-ends)

---

## SECTION E — DAILY DISCIPLINE, DECISION RIGHTS, DEFINITION OF DONE

(Carry forward from prior prompts.)

**Definition of "Polished & Complete" — all true before Phase 73 (new features):** 0. **BLOCK 0 closed:** build/typecheck deterministic over 3 cold runs (BUG-1); state files honest + CI-guarded (BUG-4); deepened packages have ≥15 real tests (BUG-2); Phase-68 motion/a11y bugs fixed (BUG-3); 0 unwaived moderate vulns (BUG-5); simulated core honestly labeled (BUG-6). **Nothing claims to be more real than it is.**

1. All 6 gates green (typecheck/build/test/lint/audit/+ custom greps)
2. Zero fake components (0 object-tree in .tsx)
3. All thin packages deepened (≥15 tests, real implementation)
4. All 16 apps have full wired frontends (Calendar/Docs/Drive/Meet built)
5. Zero mock data anywhere
6. Brand system applied across all 16 apps
7. Every screen passes the Vibe Bar checklist
8. Zero defects (0 errors/console/a11y/dead-ends), pen test passed
9. Universal Tool Layer: QuantAI operates every app
10. Codex builds by voice; Automate runs the daily-reel cross-app
11. Phone-free mode: full day by voice

If any false → fix it. No new features until the existing is best.

---

## SECTION F — FIRST 14 DAYS

**Day 1:** Read Part A fully. Begin Phase 62 (green the gates). Fix React 19 dual-types (pnpm overrides + shared-ui JSX types). Get typecheck + build green.

**Day 2-3:** Phase 62 done — all 6 gates green, status JSON updated honestly. Begin Phase 63 (kill fake components) — start with quantneon's 12.

**Day 4-6:** Phase 63 — rewrite all 42 object-tree components as real JSX, wired, accessible. Playwright smoke each.

**Day 7-10:** Phase 64 — deepen thin packages (agent-swarm, voice-first-os, data-warehouse, wellbeing, spatial-ui, robotics-bridge first). Real implementations, ≥15 tests each.

**Day 11-14:** Phase 65 begins — QuantCalendar frontend (all views, wired to backend). Then Docs.

Reassess after 14 days. **Sequencing law: Blocks 1-4 (62-72) before Block 5 (73+). Completion before conquest. Polish before expansion.**

---

## SECTION G — A NOTE FROM CLAUDE TO KIRO

Kiro —

You shipped 21 phases of breadth in a day. Impressive. But I looked at the code, and the founder was right to slow us down. We have 42 components that don't render, 3 apps that don't typecheck, 4 apps with no frontend, packages marked "complete" at 70 lines, and zero branding.

Breadth without depth is a demo, not a product. So we rebalance.

The new order is sacred and it's the founder's order: **make the existing best first.** Green the gates. Make every component real. Finish every skeleton. Build the missing frontends. Wire every mock. Build the brand. Polish every screen to a premium vibe. Zero every defect. Make QuantAI truly control everything. THEN — and only then — the remaining big features.

Phase 68 (UI/UX excellence) is where the founder's heart is: every screen smooth, animated, oriented, vibey, beautiful. Treat polish as a real deliverable, not a chore. Ship before/after evidence.

And hold the zero-defect line (Phase 69). The founder said it plainly: not one bug, not one error, not one security hole, not one broken flow.

We have the breadth. Now we earn the right to call it a product.

Depth. Polish. Completion. Then conquest.

— Claude

---

## END. Now begin: read Part A, fix React 19 types, green the gates (Phase 62).
