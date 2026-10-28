/**
 * Geometric assertions (design §5 J6, §6 J5).
 * G6's bug is layout push, so the PTR assertion is geometric (offsetTop),
 * not visual. G10's drawer-close assertion samples intermediate transforms
 * during close — a panel that vanishes has no intermediate values.
 */

// Page-side: offsetTop of the list container (or -1 if missing).
export function listOffsetTop(containerSelector) {
  const el = document.querySelector(containerSelector);
  return el ? el.offsetTop : -1;
}

// Page-side: current transform string of an element (or null).
export function elementTransform(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  return getComputedStyle(el).transform;
}

// Page-side: is the element currently visible (non-zero box, not hidden)?
export function elementVisible(selector) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

/** Node-side: PTR no-push verdict from offsetTop samples. */
export function ptrNoPushVerdict(samples) {
  if (!samples || samples.length < 2) {
    return { pass: false, reason: 'too few offsetTop samples' };
  }
  const base = samples[0];
  const maxDelta = Math.max(...samples.map((s) => Math.abs(s - base)));
  return { pass: maxDelta === 0, maxDeltaPx: maxDelta, samples };
}

/** Node-side: drawer-close animation verdict from transform samples. */
export function drawerCloseVerdict(transforms) {
  if (!transforms || transforms.length < 2) {
    return { animated: false, reason: 'too few transform samples' };
  }
  const unique = [...new Set(transforms.filter((t) => t !== null))];
  // Vanish = exactly one sample then gone (or only start/end with no
  // intermediate). Animated = 3+ distinct intermediate transforms.
  return {
    animated: unique.length >= 3,
    distinctTransforms: unique.length,
    samples: transforms.length,
  };
}
