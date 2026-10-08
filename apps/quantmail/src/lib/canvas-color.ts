/**
 * Canvas color resolution.
 *
 * The Canvas 2D API (`addColorStop`, `fillStyle`, `strokeStyle`, `shadowColor`)
 * only accepts real CSS colors — a raw `var(--quant-primary)` token throws
 * `SyntaxError: Failed to execute 'addColorStop' on 'CanvasGradient'`, which
 * crashes the whole view behind an error boundary. The QM-UIUX-004 color-token
 * codemod leaked such raw tokens into canvas code (P0 regression on /login).
 *
 * Always wrap a token before handing it to canvas:
 *   g.addColorStop(1, resolveCanvasColor('var(--quant-accent-faint)'));
 *
 * Resolution reads the live computed value off `document.documentElement`, so
 * theme switches (dark/light) keep working — the color is resolved at draw
 * time, not import time. Where there is no DOM (SSR, unit tests), a
 * design-system fallback from `globals.css` is used so drawing never throws.
 */

/* eslint-disable surface-hex/no-raw-surface-hex -- QM-UIUX-071: these literals ARE the
 * design-token values from globals.css (the source of truth the rule exempts for token
 * definitions). They are the no-DOM/unknown-token fallbacks for canvas, which cannot
 * consume var() at all — using the tokens here would reintroduce the crash. */
const FALLBACKS: Record<string, string> = {
  '--quant-primary': '#FF8C42',
  '--quant-primary-hover': '#FF9B5A',
  '--quant-accent-faint': 'rgba(255, 140, 66, 0.08)',
  '--quant-accent-soft': 'rgba(255, 140, 66, 0.12)',
  '--quant-background': '#090A0C',
  '--quant-surface-elevated': '#16181D',
  '--quant-foreground': '#F5F5F5',
  '--brand-primary': '#FF8C42',
  '--brand-primary-hover': '#FF9B5A',
  '--brand-primary-pressed': '#E8752F',
  '--brand-accent': '#FFB875',
};
/* eslint-enable surface-hex/no-raw-surface-hex */

/** Matches the first `var(--token)` (with optional whitespace). */
const VAR_RE = /var\(\s*(--[\w-]+)\s*\)/;

function fallbackFor(value: string): string {
  const m = VAR_RE.exec(value);
  const token = m?.[1];
  if (token && FALLBACKS[token]) return FALLBACKS[token];
  // Final safety net: brand orange — a visible, honest default rather than a throw.
  return FALLBACKS['--quant-primary'];
}

/**
 * Resolve a CSS color value for canvas use. Non-`var()` values pass through
 * untouched. `var(--token)` resolves against the document's computed style,
 * falling back to design-system literals when the token is unknown or there
 * is no DOM. Never throws; never returns an unparseable color.
 */
export function resolveCanvasColor(value: string): string {
  if (!value || !value.includes('var(')) return value;
  if (typeof document === 'undefined') return fallbackFor(value);
  let resolved = value;
  // Resolve nested/fallback chains defensively (e.g. --quant-primary →
  // var(--brand-primary)). getComputedStyle already flattens var() chains, so
  // one pass normally suffices; loop for chained fallbacks.
  for (let i = 0; i < 4 && resolved.includes('var('); i++) {
    const next = resolved.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_match, token: string) => {
      const computed = getComputedStyle(document.documentElement)
        .getPropertyValue(token)
        .trim();
      return computed || FALLBACKS[token] || '';
    });
    if (next === resolved) break;
    resolved = next;
  }
  if (resolved.includes('var(')) return fallbackFor(value);
  const trimmed = resolved.trim();
  return trimmed === '' ? fallbackFor(value) : trimmed;
}
