/**
 * Tap-to-screen timing (design §4) + interaction latency capture.
 * Node-side timing: t0 is recorded immediately before the tap dispatch;
 * the predicate is polled via CDP evaluate until true on two consecutive
 * polls (~one frame apart) — DOM presence alone is not paint.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Tap at (x, y) via the real touch path (mouse fallback when touch throws),
 * then wait for predicateFn(...predicateArgs) to hold on two consecutive
 * polls. predicateFn is a page-side function; args are JSON-serialized.
 * Returns { ms, usedFallback, eventTiming }.
 */
export async function tapAndWait(session, x, y, predicateFn, predicateArgs = [], { timeoutMs = 10000, pollMs = 16 } = {}) {
  const t0 = performance.now();
  let usedFallback = false;
  try {
    await session.tap(x, y);
  } catch {
    usedFallback = true;
    await session.click(x, y);
  }
  const deadline = t0 + timeoutMs;
  let confirmedAt = null;
  let lastTrueAt = null;
  while (performance.now() < deadline) {
    const ok = await session.evaluate(predicateFn, ...predicateArgs);
    if (ok) {
      if (lastTrueAt !== null) {
        confirmedAt = performance.now();
        break;
      }
      lastTrueAt = performance.now();
    } else {
      lastTrueAt = null;
    }
    await sleep(pollMs);
  }
  if (confirmedAt === null) {
    throw new Error(`tap-to-screen predicate never confirmed within ${timeoutMs}ms`);
  }
  const eventTiming = await session.evaluate(() => {
    try {
      const entries = performance.getEntriesByType('event');
      const recent = entries.slice(-5).map((e) => ({
        name: e.name,
        duration: Math.round(e.duration * 100) / 100,
        processingStart: Math.round(e.processingStart * 100) / 100,
      }));
      return recent;
    } catch {
      return [];
    }
  });
  return { ms: confirmedAt - t0, usedFallback, eventTiming };
}

/** Page-side helpers (serialized into the page by session.evaluate). */
export function elementPresentAndNonEmpty(selector) {
  const el = document.querySelector(selector);
  return Boolean(el) && (el.textContent || '').trim().length > 0;
}

export function drawerFullyOpen(selector) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const style = getComputedStyle(el);
  const transform = style.transform;
  // translate-x-0 means matrix(1,0,0,1,0,0) or none; anything with a
  // negative X offset is still sliding in.
  if (transform === 'none') return true;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
  return Math.abs(parts[4] || 0) < 0.5;
}
