/**
 * rAF frame-time sampler + longtask / layout-shift observers (design §3).
 * Page-side state lives on window.__perfFrames; node-side helpers start,
 * stop and summarize it. No new dependencies.
 */

// Page-side: install the sampler. Returns true when installed.
export function installSampler() {
  if (window.__perfFrames) return true;
  const state = {
    deltas: [],
    longtasks: [],
    shifts: [],
    running: false,
    last: 0,
    rafId: 0,
  };
  const loop = (now) => {
    if (!state.running) return;
    if (state.last > 0) state.deltas.push(now - state.last);
    state.last = now;
    state.rafId = requestAnimationFrame(loop);
  };
  state.start = () => {
    state.deltas = [];
    state.longtasks = [];
    state.shifts = [];
    state.last = 0;
    // Window filter: buffered observers may deliver entries from BEFORE
    // this run (page load, hydration). Only entries inside the window
    // count — otherwise load-time longtasks contaminate scroll metrics.
    state.windowStart = performance.now();
    state.running = true;
    state.rafId = requestAnimationFrame(loop);
  };
  state.stop = () => {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    const start = state.windowStart || 0;
    return {
      deltas: state.deltas.slice(),
      longtasks: state.longtasks.filter((t) => t.startTime >= start),
      shifts: state.shifts.filter((s) => s.startTime >= start),
    };
  };
  try {
    const longtaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longtasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    });
    longtaskObserver.observe({ type: 'longtask', buffered: true });
    state.longtaskObserver = longtaskObserver;
  } catch { /* longtask unsupported: reported as null by summarize */ }
  try {
    const shiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          state.shifts.push({ startTime: entry.startTime, value: entry.value });
        }
      }
    });
    shiftObserver.observe({ type: 'layout-shift', buffered: true });
    state.shiftObserver = shiftObserver;
  } catch { /* layout-shift unsupported */ }
  window.__perfFrames = state;
  return true;
}

export function startSampler() {
  window.__perfFrames.start();
  return true;
}

export function stopSampler() {
  return window.__perfFrames.stop();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/** Node-side summary from a stopSampler() payload. */
export function summarizeFrames(payload, frameBudgetMs = 16.67) {
  const deltas = (payload.deltas || []).filter((d) => Number.isFinite(d) && d > 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const within = deltas.filter((d) => d <= frameBudgetMs).length;
  // Informational only: rAF deltas quantize to vsync intervals, so a
  // trivially smooth page reports deltas of ~16.7-16.8ms (just over the
  // 16.67 cutoff) while p99 stays ~16.8ms. Gate 1 may retune the budget
  // with this number in view; the verdict still binds to 16.67ms.
  const within17 = deltas.filter((d) => d <= 17).length;
  const longtasks = payload.longtasks || [];
  const shifts = payload.shifts || [];
  return {
    frameCount: deltas.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    pctWithinBudget: deltas.length ? (within / deltas.length) * 100 : null,
    pctWithin17Ms: deltas.length ? (within17 / deltas.length) * 100 : null,
    framesOver33Ms: deltas.filter((d) => d > 33.3).length,
    framesOver50Ms: deltas.filter((d) => d > 50).length,
    longtaskCount: longtasks.length,
    maxLongtaskMs: longtasks.length ? Math.max(...longtasks.map((t) => t.duration)) : 0,
    layoutShiftCount: shifts.length,
    layoutShiftScore: shifts.reduce((sum, s) => sum + (s.value || 0), 0),
  };
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function p95(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums[Math.min(nums.length - 1, Math.ceil(0.95 * nums.length) - 1)];
}
