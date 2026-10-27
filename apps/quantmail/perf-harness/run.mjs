/**
 * Perf harness runner (design §2–§6). CDP-only, no dependencies.
 *
 * Usage:
 *   node run.mjs --fixture                       # self-test vs bundled fixture
 *   node run.mjs --url http://localhost:3000     # real app build (needs test account for authed journeys)
 *   node run.mjs --url <url> --devices VP-360 --journeys J1,J2
 *
 * Journeys whose selectors do not resolve against the live DOM are reported
 * as BLOCKED with a reason — never silently skipped (design §6).
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { CDPSession, newTarget, closeTarget } from './lib/cdp.mjs';
import { launchChrome } from './lib/launch.mjs';
import {
  installSampler, startSampler, stopSampler, summarizeFrames, median, p95,
} from './collect/frames.mjs';
import { tapAndWait, elementPresentAndNonEmpty, drawerFullyOpen } from './collect/timing.mjs';
import { startClassifier, stopClassifier, summarizeClassifier } from './collect/blankflash.mjs';
import {
  listOffsetTop, elementTransform, ptrNoPushVerdict, drawerCloseVerdict,
} from './collect/geometry.mjs';
import { buildEvidence } from './report/evidence.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = HERE; // perf-harness/ itself: config/, runs/, fixture/ live here

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/* ---------------- page-side functions (serialized into the page) ---------------- */

// Fling-style scroll: large jumps per frame for durationMs, wrapping to top
// at the bottom so a short list still fills the window.
function flingScroll(containerSelector, durationMs) {
  return new Promise((resolve) => {
    const el = document.querySelector(containerSelector);
    if (!el) {
      resolve({ error: 'no-container' });
      return;
    }
    const start = performance.now();
    let wraps = 0;
    function step() {
      const now = performance.now();
      if (now - start >= durationMs) {
        resolve({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, wraps });
        return;
      }
      const before = el.scrollTop;
      el.scrollTop += Math.max(200, el.clientHeight * 0.6);
      if (el.scrollTop === before && el.scrollHeight > el.clientHeight) {
        el.scrollTop = 0;
        wraps++;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// Resolve the scroll container: first candidate with scrollable overflow.
function resolveScrollContainer(candidates) {
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el && el.scrollHeight > el.clientHeight + 1) {
      return { selector: sel, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    }
  }
  // Fallback: scroll parent of the first list.
  const list = document.querySelector("ul[role='list']");
  if (list) {
    let el = list.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1) {
        return { selector: 'scroll-parent-of-list', scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
      }
      el = el.parentElement;
    }
  }
  return null;
}

// Find a lens tab's center by label (exact match preferred, prefix fallback
// because tabs may render a count badge after the label).
function findTabCenter(label) {
  const tabs = [...document.querySelectorAll("[role='tablist'] [role='tab']")];
  const exact = tabs.find((t) => t.textContent.trim() === label);
  const prefixed = tabs.find((t) => t.textContent.trim().startsWith(label));
  const tab = exact || prefixed;
  if (!tab) return null;
  const r = tab.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

// Center of the first row inside the container.
function firstRowCenter(containerSelector, rowSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return null;
  const row = container.querySelector(rowSelector);
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

// Center of an element by selector (generic trigger finder).
function centerOfSelector(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function rowCountIn(containerSelector, rowSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return -1;
  return container.querySelectorAll(rowSelector).length;
}

function emptyStateInfo(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return { found: false };
  const text = (container.textContent || '').trim();
  const actions = container.querySelectorAll('button, a[href]').length;
  return { found: true, textLength: text.length, textHead: text.slice(0, 200), actions };
}

function pageReady() {
  return document.readyState === 'complete';
}

/* ---------------- node-side helpers ---------------- */

async function waitFor(session, fn, args, timeoutMs, pollMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await session.evaluate(fn, ...args)) return true;
    } catch { /* page not ready yet */ }
    await sleep(pollMs);
  }
  return false;
}

async function applyEmulation(session, profile) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.deviceScaleFactor || 2,
    mobile: true,
  });
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottlingRate || 1 });
}

/* ---------------- journeys ---------------- */

async function journeyJ1(session, ctx) {
  const { container, budgets, reps } = ctx;
  await session.evaluate(installSampler);
  // Warm-up run (JIT, caches) — discarded.
  await session.evaluate(startSampler);
  await session.evaluate(flingScroll, container.selector, 10000);
  await session.evaluate(stopSampler);
  const runs = [];
  for (let i = 0; i < reps; i++) {
    await session.evaluate(startSampler);
    const scroll = await session.evaluate(flingScroll, container.selector, 10000);
    const payload = await session.evaluate(stopSampler);
    runs.push({ ...summarizeFrames(payload), scroll });
  }
  const metric = (key) => median(runs.map((r) => r[key]));
  return {
    status: 'run',
    runs,
    median: {
      p50Ms: metric('p50Ms'),
      p95Ms: metric('p95Ms'),
      p99Ms: metric('p99Ms'),
      maxMs: metric('maxMs'),
      pctWithinBudget: metric('pctWithinBudget'),
      pctWithin17Ms: metric('pctWithin17Ms'),
      framesOver33Ms: metric('framesOver33Ms'),
      longtaskCount: metric('longtaskCount'),
      maxLongtaskMs: metric('maxLongtaskMs'),
      layoutShiftCount: metric('layoutShiftCount'),
      layoutShiftScore: metric('layoutShiftScore'),
    },
    budget: {
      pctWithinBudget: budgets.frame.pctWithinBudget,
      p99MaxMs: budgets.frame.p99MaxMs,
      maxLongtasks: budgets.frame.maxLongtasks,
    },
  };
}

async function journeyJ2(session, ctx) {
  const { container, rowSelector, skeletonPatterns, emptySelector, budgets, filterReps, pills } = ctx;
  const perFilter = {};
  for (const pill of pills) {
    const center = await session.evaluate(findTabCenter, pill);
    if (!center) {
      perFilter[pill] = { status: 'BLOCKED', reason: `lens tab '${pill}' not found in live DOM` };
      continue;
    }
    const runs = [];
    for (let i = 0; i < filterReps; i++) {
      const started = await session.evaluate(
        startClassifier, container.selector, rowSelector, skeletonPatterns, emptySelector,
      );
      const tapMarkAbs = await session.evaluate(() => performance.now());
      try {
        await session.tap(center.x, center.y);
      } catch {
        await session.click(center.x, center.y);
      }
      await sleep(2000);
      const trace = await session.evaluate(stopClassifier, started.id);
      runs.push(summarizeClassifier(trace, tapMarkAbs - started.t0));
    }
    const firstPaints = runs.map((r) => r.tFirstPaintMs);
    const rowsTimes = runs.map((r) => r.tRowsMs);
    perFilter[pill] = {
      status: 'run',
      tFirstPaintMedianMs: median(firstPaints),
      tRowsMedianMs: median(rowsTimes),
      blankFramesMax: runs.length ? Math.max(...runs.map((r) => r.blankFrames)) : null,
      runs,
    };
    // Clear back to All for the next filter.
    const allCenter = await session.evaluate(findTabCenter, 'All');
    if (allCenter) {
      try { await session.tap(allCenter.x, allCenter.y); } catch { await session.click(allCenter.x, allCenter.y); }
      await sleep(800);
    }
  }
  return {
    status: 'run',
    perFilter,
    menuFilters: {
      status: 'BLOCKED',
      reason: 'U3.2 filter menu not built pre-Gate-1; menu filters (Flagged, Pinned, Has files, Mentions me, Events, Categories) measured after U3.2 lands.',
    },
    budget: {
      firstPaintMedianMaxMs: budgets.filter.firstPaintMedianMaxMs,
      maxBlankFrames: budgets.filter.maxBlankFrames,
    },
  };
}

async function journeyJ3(session, ctx) {
  const { container, rowSelector } = ctx;
  // Spam is the fixture's empty filter; on the real app it may hold rows.
  const center = await session.evaluate(findTabCenter, 'Spam');
  if (!center) return { status: 'BLOCKED', reason: "lens tab 'Spam' not found in live DOM" };
  try { await session.tap(center.x, center.y); } catch { await session.click(center.x, center.y); }
  await sleep(1500);
  const rows = await session.evaluate(rowCountIn, container.selector, rowSelector);
  if (rows > 0) {
    return { status: 'skipped', reason: `Spam filter holds ${rows} rows on this target — empty state not observable; skipped with reason, not failed.` };
  }
  const info = await session.evaluate(emptyStateInfo, container.selector);
  return {
    status: 'run',
    filter: 'Spam',
    rows,
    emptyState: info,
    structurePresent: info.found && info.textLength > 0 && info.actions >= 1,
    note: 'Copy/art verdicts await Gate 1 D3; this journey asserts U4.1 structure presence only.',
  };
}

async function journeyJ4(session, ctx) {
  const { container, rowSelector, threadSelector, backSelector, budgets, tapReps, targetUrl } = ctx;
  // Reset to the unfiltered list first: a prior journey (J3 Spam) may have
  // left the list empty, leaving no rows to open a thread from.
  const allCenter = await session.evaluate(findTabCenter, 'All');
  if (allCenter) {
    try { await session.tap(allCenter.x, allCenter.y); } catch { await session.click(allCenter.x, allCenter.y); }
    await sleep(1200);
  }
  const threadExists = await session.evaluate(
    (sel) => Boolean(document.querySelector(sel)), threadSelector,
  );
  if (!threadExists) {
    // Thread view only exists after opening; check the open path instead
    // by attempting one tap and re-checking. If still absent, BLOCKED.
    const center = await session.evaluate(firstRowCenter, container.selector, rowSelector);
    if (!center) return { status: 'BLOCKED', reason: 'no rows to open a thread from' };
    try { await session.tap(center.x, center.y); } catch { await session.click(center.x, center.y); }
    await sleep(1500);
    const nowExists = await session.evaluate(
      (sel) => Boolean(document.querySelector(sel)), threadSelector,
    );
    if (!nowExists) {
      return { status: 'BLOCKED', reason: `thread view selector '${threadSelector}' never resolved in live DOM` };
    }
    // Return to list for the measured reps. NEVER history.back(): on a
    // CDP-created target that navigates back to about:blank and kills
    // every later journey. Back-button tap, else a clean reload.
    const probeBack = await session.evaluate(centerOfSelector, backSelector);
    if (probeBack) {
      try { await session.tap(probeBack.x, probeBack.y); } catch { await session.click(probeBack.x, probeBack.y); }
      await sleep(1000);
    } else {
      await session.send('Page.navigate', { url: targetUrl });
      await waitFor(session, pageReady, [], 30000, 500);
      await sleep(1500);
    }
  }
  const opens = [];
  const backs = [];
  const backBlockedReasons = [];
  let maxOpenFrame = null;
  for (let i = 0; i < tapReps + 1; i++) {
    const isWarmup = i === 0;
    const center = await session.evaluate(firstRowCenter, container.selector, rowSelector);
    if (!center) throw new Error('J4: row vanished mid-run');
    await session.evaluate(installSampler);
    await session.evaluate(startSampler);
    const open = await tapAndWait(
      session, center.x, center.y, elementPresentAndNonEmpty, [threadSelector],
    );
    const payload = await session.evaluate(stopSampler);
    const summary = summarizeFrames(payload);
    if (!isWarmup) {
      opens.push(open.ms);
      if (maxOpenFrame === null || (summary.maxMs !== null && summary.maxMs > maxOpenFrame)) {
        maxOpenFrame = summary.maxMs;
      }
    }
    // Back to list — ONLY via the thread view's own back control. There
    // is no history.back() fallback: on CDP-created targets it navigates
    // to about:blank and kills later journeys. No back control = the back
    // metric is BLOCKED (open metric still reported).
    const backCenter = backSelector
      ? await session.evaluate(centerOfSelector, backSelector) : null;
    let backMs = null;
    let backBlocked = null;
    if (backCenter) {
      const back = await tapAndWait(
        session, backCenter.x, backCenter.y,
        (c, r) => {
          const containerEl = document.querySelector(c);
          return containerEl && containerEl.querySelectorAll(r).length > 0;
        },
        [container.selector, rowSelector],
      );
      backMs = back.ms;
    } else {
      backBlocked = `no back control '${backSelector}' resolved in live DOM`;
      // Reset for the next rep without history games.
      await session.send('Page.navigate', { url: targetUrl });
      await waitFor(session, pageReady, [], 30000, 500);
      await sleep(1500);
    }
    if (!isWarmup) {
      if (backMs !== null) backs.push(backMs);
      if (backBlocked) backBlockedReasons.push(backBlocked);
    }
  }
  return {
    status: 'run',
    open: { medianMs: median(opens), p95Ms: p95(opens), maxMs: opens.length ? Math.max(...opens) : null },
    back: { medianMs: median(backs), p95Ms: p95(backs), maxMs: backs.length ? Math.max(...backs) : null },
    backBlocked: backBlockedReasons.length ? backBlockedReasons[0] : null,
    maxFrameDuringOpenMs: maxOpenFrame,
    budget: {
      medianMaxMs: budgets.tap.medianMaxMs,
      p95MaxMs: budgets.tap.p95MaxMs,
      threadOpenMaxFrameMs: budgets.frame.threadOpenMaxFrameMs,
    },
  };
}

async function journeyJ5(session, ctx) {
  const { drawerTrigger, drawerPanel } = ctx;
  const trigger = await session.evaluate(centerOfSelector, drawerTrigger);
  const panelExists = await session.evaluate(
    (sel) => Boolean(document.querySelector(sel)), drawerPanel,
  );
  if (!trigger || !panelExists) {
    return {
      status: 'BLOCKED',
      reason: `drawer trigger/panel not resolved (trigger=${Boolean(trigger)}, panel=${panelExists}) — confirm against live DOM`,
    };
  }
  const open = await tapAndWait(session, trigger.x, trigger.y, drawerFullyOpen, [drawerPanel]);
  // Close: tap the trigger again, sampling transforms until the panel
  // settles (same transform 3 polls in a row) or the sample window ends.
  const t0 = performance.now();
  try { await session.tap(trigger.x, trigger.y); } catch { await session.click(trigger.x, trigger.y); }
  const transforms = [];
  let settled = false;
  for (let i = 0; i < 60 && !settled; i++) {
    transforms.push(await session.evaluate(elementTransform, drawerPanel));
    await sleep(16);
    const n = transforms.length;
    if (n >= 3 && transforms[n - 1] === transforms[n - 2] && transforms[n - 2] === transforms[n - 3]) {
      settled = true;
    }
  }
  const closeMs = performance.now() - t0;
  return {
    status: 'run',
    openMs: open.ms,
    closeMs,
    closeSettled: settled,
    close: drawerCloseVerdict(transforms),
  };
}

async function journeyJ6(session, ctx) {
  const { container, budgets } = ctx;
  const before = [];
  for (let i = 0; i < 3; i++) {
    before.push(await session.evaluate(listOffsetTop, container.selector));
    await sleep(50);
  }
  // Touch drag from the top of the list downward (real pull gesture).
  const rect = await session.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, top: r.top + 10 };
  }, container.selector);
  if (!rect) return { status: 'BLOCKED', reason: 'list container rect unavailable' };
  const during = [];
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: rect.x, y: rect.top }],
  });
  for (let dy = 10; dy <= 80; dy += 10) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: rect.x, y: rect.top + dy }],
    });
    during.push(await session.evaluate(listOffsetTop, container.selector));
    await sleep(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
  const after = await session.evaluate(listOffsetTop, container.selector);
  const verdict = ptrNoPushVerdict([...before, ...during, after]);
  return {
    status: 'run',
    offsetTop: { before, during, after },
    noPush: verdict,
    thresholds: {
      releaseThresholdPx: budgets.ptr.releaseThresholdPx,
      maxPullPx: budgets.ptr.maxPullPx,
    },
    note: 'Geometric assertion only: list offsetTop must not move during pull. Indicator art/behavior is owned by the W0-3 visual pass.',
  };
}

/* ---------------- main ---------------- */

async function startFixtureServer() {
  const fixturePath = path.join(ROOT, 'fixture', 'index.html');
  const html = fs.readFileSync(fixturePath, 'utf8');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const devices = loadJson('config/devices.json');
  const budgets = loadJson('config/budgets.json');
  const journeysCfg = loadJson('config/journeys.json');

  const wantedDevices = (args.devices || devices.defaultRun.join(',')).split(',').map((s) => s.trim());
  const wantedJourneys = (args.journeys || 'J1,J2,J3,J4,J5,J6').split(',').map((s) => s.trim().toUpperCase());
  const scrollReps = Number(args['scroll-runs'] || budgets.repetitions.scroll.runs);
  const tapReps = Number(args['tap-runs'] || budgets.repetitions.tap.runs);
  const filterReps = Number(args['filter-runs'] || budgets.repetitions.filter.runsPerFilter);
  const outDir = args.out || path.join(ROOT, 'runs');
  const runName = args.name || new Date().toISOString().replace(/[:.]/g, '-');

  let targetUrl = args.url;
  let fixtureServer = null;
  if (args.fixture || !targetUrl) {
    fixtureServer = await startFixtureServer();
    targetUrl = fixtureServer.url;
    console.log(`[fixture] serving ${targetUrl}`);
  }

  const launch = await launchChrome();
  console.log(`[launch] chrome ${launch.browserVersion} on ephemeral port ${launch.port} (probe OK)`);
  const run = {
    meta: {
      harness: 'perf-harness v1',
      targetUrl,
      fixture: Boolean(fixtureServer),
      chrome: launch.browserVersion,
      startedAt: new Date().toISOString(),
    },
    devices: [],
  };
  try {
    for (const deviceId of wantedDevices) {
      const profile = devices.profiles.find((p) => p.id === deviceId);
      if (!profile) {
        console.log(`[skip] unknown device ${deviceId}`);
        continue;
      }
      console.log(`[device] ${profile.id} ${profile.width}x${profile.height} CPU x${profile.cpuThrottlingRate}`);
      const target = await newTarget(launch.port, 'about:blank');
      const session = new CDPSession(target.webSocketDebuggerUrl);
      await session.connect();
      const deviceResult = { profile, journeys: {}, blocked: [], skipped: [] };
      try {
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        await applyEmulation(session, profile);
        await session.send('Page.navigate', { url: targetUrl });
        const ready = await waitFor(session, pageReady, [], 30000, 500);
        if (!ready) throw new Error('page never reached readyState complete');
        await sleep(1500); // SPA hydration window (Next.js needs 12s+ on slow targets; poll below covers it)
        const container = await session.evaluate(
          resolveScrollContainer, journeysCfg.selectors.listScrollContainer.candidates,
        );
        if (!container) {
          for (const j of wantedJourneys) {
            deviceResult.journeys[j] = { status: 'BLOCKED', reason: 'list scroll container never resolved' };
            deviceResult.blocked.push(j);
          }
          deviceResult.journeys._container = null;
        } else {
          deviceResult.journeys._container = container;
          const ctx = {
            container,
            rowSelector: journeysCfg.selectors.listRows.selector,
            skeletonPatterns: journeysCfg.selectors.skeletonPatterns,
            emptySelector: "[data-testid='empty-state']",
            targetUrl,
            budgets,
            reps: scrollReps,
            tapReps,
            filterReps,
            pills: journeysCfg.filters.lockedPills,
            threadSelector: "[data-testid='thread-view']",
            backSelector: "[data-testid='back-button']",
            drawerTrigger: "[data-testid='drawer-trigger']",
            drawerPanel: "[data-testid='drawer-panel']",
          };
          const runners = { J1: journeyJ1, J2: journeyJ2, J3: journeyJ3, J4: journeyJ4, J5: journeyJ5, J6: journeyJ6 };
          for (const j of wantedJourneys) {
            try {
              console.log(`  [journey] ${j} ...`);
              const result = await runners[j](session, ctx);
              deviceResult.journeys[j] = result;
              if (result.status === 'BLOCKED') deviceResult.blocked.push(j);
              if (result.status === 'skipped') deviceResult.skipped.push(j);
              console.log(`  [journey] ${j} -> ${result.status}`);
            } catch (err) {
              deviceResult.journeys[j] = { status: 'ERROR', error: err.message };
              console.log(`  [journey] ${j} -> ERROR: ${err.message}`);
            }
          }
        }
      } finally {
        session.close();
        await closeTarget(launch.port, target.id);
      }
      run.devices.push(deviceResult);
    }
  } finally {
    launch.kill();
    if (fixtureServer) fixtureServer.server.close();
  }

  run.meta.finishedAt = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${runName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2));
  const evidence = buildEvidence(run, budgets, null);
  const mdPath = path.join(outDir, `${runName}.md`);
  fs.writeFileSync(mdPath, `${evidence}\n`);
  console.log(`[done] ${jsonPath}`);
  console.log(`[done] ${mdPath}`);
  console.log(evidence.split('\n').slice(0, 30).join('\n'));
}

main().catch((err) => {
  console.error(`[fatal] ${err.stack || err.message}`);
  process.exit(1);
});
