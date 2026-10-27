# Perf Harness (measurement + tests only — NO product UI changes)

Turns "smooth" from a claim into numbers (design: `hidden_files/outlook-parity/W0-4-perf-harness.md`).
CDP-only, zero npm dependencies — plain `node` + the local Chrome binary.
The harness never imports app code, never touches the app bundle, and is
outside the app's tsconfig/vitest globs, so it cannot break app tests.

## Run

```sh
# Self-test against the bundled fixture (proves runner + collectors + report):
node apps/quantmail/perf-harness/run.mjs --fixture

# Real app build (needs a running build + a test account for authed journeys):
node apps/quantmail/perf-harness/run.mjs --url http://localhost:3000

# Options:
#   --devices VP-360,VP-390   (default: VP-360 throttled + VP-390 reference)
#   --journeys J1,J2,J4       (default: J1–J6)
#   --scroll-runs 3 --tap-runs 5 --filter-runs 5
#   --out <dir>               (default: perf-harness/runs)
#   --name <run-name>         (default: ISO timestamp)
```

Each run writes `runs/<name>.json` (machine-readable artifact) and
`runs/<name>.md` (the §7 Slack evidence post, generated FROM the JSON —
never hand-typed). Regenerate evidence any time with:

```sh
node apps/quantmail/perf-harness/report/evidence.mjs runs/<name>.json [--baseline runs/baseline.json]
```

## Budgets (PROPOSED until Gate 1 D4 confirms)

`config/budgets.json` is the ONLY file Gate 1 edits to change a number:
scroll ≥95% frames ≤16.67ms, p99 ≤33.3ms, 0 longtasks (VP-360, CPU ×4);
tap-to-screen median <300ms, p95 <450ms; filter first paint <200ms,
0 blank frames. **Regression rule:** any budget breach OR any metric
>10% worse than baseline on the same device/viewport blocks merge until
fixed or explicitly waived by the CEO in-thread.

## Guardrails (binding)

- **Ephemeral CDP port per run** — never assume 9333/9334 is free; a
  sibling worker's browser may own it. Every run starts with a launch
  probe and fails fast if Chrome does not answer.
- **Launch probe:** the binary is verified by a real launch every run,
  not by a past check.
- **Test account or genuinely empty states only.** Interaction testing
  NEVER runs on the user's personal inbox.
- **Unconfirmed selectors = BLOCKED journey, never silently skipped.**
  `config/journeys.json` marks each selector code-confirmed or
  provisional. Pre-Gate-1, the filter-menu journeys (U3.2) and the
  thread/drawer selectors are provisional on the real app; the fixture
  provides them so the machinery is still verifiable.
- **No baseline is fabricated.** `runs/baseline.json` is committed only
  after the first full run on current main. Until then, evidence posts
  say "no baseline" and verdicts bind to budgets only.

## Known measurement notes (from the first fixture run)

- **Vsync quantization:** rAF deltas cluster at ~16.7ms, a hair over the
  16.67ms cutoff, so `% frames ≤16.67ms` reads ~38% on a trivially smooth
  page while `% ≤17ms` reads ~99% and p99 is 16.8ms. The verdict still
  binds to the designed 16.67ms budget (Gate 1 owns the number); the
  ≤17ms figure is reported alongside so Gate 1 can retune with eyes open.
- **Fling wrap hitches:** the 10s fling wraps to the top when it reaches
  the bottom (a test artifact — real flings do not wrap). Occasional
  long frames at wrap points under CPU ×4 are visible in the raw data
  and count against the 0-longtask budget honestly; the median across 3
  runs dampens them.
- **No baseline is fabricated.** The fixture run proves the machinery;
  it is not a baseline for the real app.

## Layout

```
config/devices.json     viewport matrix + throttling (budget device VP-360)
config/budgets.json     all budgets + regression threshold
config/journeys.json    J1–J6 definitions + selector confirmation status
lib/cdp.mjs             minimal CDP client (Node built-in WebSocket)
lib/launch.mjs          ephemeral-port Chrome launch + probe
collect/frames.mjs      rAF sampler + longtask/layout-shift observers
collect/timing.mjs      tap-to-screen marks + EventTiming capture
collect/blankflash.mjs  per-frame rows/skeleton/blank classifier
collect/geometry.mjs    PTR no-push + drawer-close geometric assertions
run.mjs                 orchestrator: launch, emulate, run, write artifacts
report/evidence.mjs     JSON → Slack evidence markdown + regression diff
report/evidence-template.md
fixture/index.html      harness-only self-test surface (NOT app code)
runs/                   committed JSON artifacts (baseline + per-run)
```
