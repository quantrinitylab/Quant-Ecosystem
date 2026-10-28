/**
 * Per-frame list-container state classifier (design §5).
 * Frames classify as rows / skeleton / blank. One blank frame after the
 * tap = blank flash = FAIL on the no-blank-flash rule, however fast
 * first paint is. Skeleton counts as first paint; blank does not.
 */

// Page-side: classify the container's current state.
// Kinds: rows / empty / skeleton / blank. An empty state (visible
// empty-state region with zero rows) is MEANINGFUL content, never a
// blank flash — counting it blank would fail every genuinely-empty
// filter, which is exactly what the harness must not do.
export function classifyContainer(containerSelector, rowSelector, skeletonPatterns, emptySelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return 'no-container';
  const rows = container.querySelectorAll(rowSelector);
  if (rows.length > 0) return 'rows';
  if (emptySelector) {
    const emptyEl = container.querySelector(emptySelector);
    if (emptyEl && !emptyEl.hidden && emptyEl.getBoundingClientRect().height > 0) return 'empty';
  }
  // Generic fallback (real app has no empty-state test id): a container
  // with substantial text and action controls but zero rows is an empty
  // state, not a blank flash. A true blank flash has no text/buttons.
  const text = (container.textContent || '').trim();
  const actions = container.querySelectorAll('button, a[href]').length;
  if (text.length > 50 && actions >= 1) return 'empty';
  const candidates = container.querySelectorAll('*');
  for (const el of candidates) {
    const cls = (el.className && el.className.baseVal !== undefined)
      ? String(el.className.baseVal)
      : String(el.className || '');
    for (const pat of skeletonPatterns) {
      if (cls.toLowerCase().includes(pat)) return 'skeleton';
    }
    if (el.getAttribute && el.getAttribute('aria-busy') === 'true') return 'skeleton';
  }
  if (container.getAttribute && container.getAttribute('aria-busy') === 'true') return 'skeleton';
  return 'blank';
}

// Page-side: install a rAF sampling loop for one filter switch.
// Returns { id, t0 } where t0 is performance.now() at start; the trace
// records t relative to t0. The runner marks tap time in the same clock
// and passes it to summarizeClassifier so first-paint is tap-relative.
export function startClassifier(containerSelector, rowSelector, skeletonPatterns, emptySelector) {
  const id = `cls-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const trace = [];
  const t0 = performance.now();
  const state = { running: true, trace, t0 };
  const loop = () => {
    if (!state.running) return;
    const container = document.querySelector(containerSelector);
    let kind = 'no-container';
    if (container) {
      const rows = container.querySelectorAll(rowSelector);
      if (rows.length > 0) kind = 'rows';
      else if (emptySelector) {
        const emptyEl = container.querySelector(emptySelector);
        if (emptyEl && !emptyEl.hidden && emptyEl.getBoundingClientRect().height > 0) kind = 'empty';
      }
      if (kind !== 'rows' && kind !== 'empty') {
        const candidates = container.querySelectorAll('*');
        outer: for (const el of candidates) {
          const cls = (el.className && el.className.baseVal !== undefined)
            ? String(el.className.baseVal)
            : String(el.className || '');
          for (const pat of skeletonPatterns) {
            if (cls.toLowerCase().includes(pat)) { kind = 'skeleton'; break outer; }
          }
          if (el.getAttribute && el.getAttribute('aria-busy') === 'true') { kind = 'skeleton'; break; }
        }
        if (kind !== 'skeleton' && container.getAttribute('aria-busy') === 'true') kind = 'skeleton';
        if (kind !== 'skeleton' && kind !== 'rows' && kind !== 'empty') {
          const text = (container.textContent || '').trim();
          const actions = container.querySelectorAll('button, a[href]').length;
          kind = (text.length > 50 && actions >= 1) ? 'empty' : 'blank';
        }
      }
    }
    trace.push({ t: performance.now() - t0, kind });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__perfClassifiers = window.__perfClassifiers || {};
  window.__perfClassifiers[id] = state;
  return { id, t0 };
}

export function stopClassifier(id) {
  const state = (window.__perfClassifiers || {})[id];
  if (!state) return null;
  state.running = false;
  delete window.__perfClassifiers[id];
  return state.trace;
}

/**
 * Node-side summary of a classifier trace. Only frames at or after
 * tapMarkRel (tap time, same relative clock) count: pre-tap frames still
 * show the previous filter's rows and must not fake a fast first paint.
 */
export function summarizeClassifier(trace, tapMarkRel = 0) {
  const frames = (trace || []).filter((f) => f.t >= tapMarkRel);
  if (!frames.length) {
    return { tFirstPaintMs: null, tRowsMs: null, blankFrames: 0, frames: 0, firstKind: null };
  }
  let tFirstPaintMs = null;
  let tRowsMs = null;
  let blankFrames = 0;
  for (const frame of frames) {
    const t = frame.t - tapMarkRel;
    if (frame.kind === 'blank') blankFrames++;
    // Rows, skeleton, AND empty states all count as first paint:
    // an empty state is meaningful content, not a blank flash.
    if (tFirstPaintMs === null && (frame.kind === 'rows' || frame.kind === 'skeleton' || frame.kind === 'empty')) {
      tFirstPaintMs = t;
    }
    if (tRowsMs === null && frame.kind === 'rows') tRowsMs = t;
  }
  return {
    tFirstPaintMs,
    tRowsMs,
    blankFrames,
    frames: frames.length,
    firstKind: frames[0].kind,
  };
}
