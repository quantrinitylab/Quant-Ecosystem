/**
 * Human-readable formatters for the QuantMail admin console KPI cards.
 *
 * Pure functions, no React — the display logic that's most bug-prone (percent
 * rounding) lives here so it can be unit-tested without a DOM. Every formatter
 * returns an em dash for absent/invalid input so a card never renders `NaN`,
 * `undefined`, or `Infinity`.
 *
 * Byte scaling is deliberately NOT here: there is one byte formatter for the
 * whole app in `./format-bytes`, and duplicating it once read `1.0 KB` here and
 * `1 KB` in Drive. The storage KPI imports that single source directly.
 */

const EM_DASH = '—';

/** Locale-grouped integer, e.g. 1234567 → "1,234,567". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return EM_DASH;
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Success-rate fraction (0..1) → integer percent, e.g. 0.9 → "90%".
 * `null`/`undefined` (no attempts resolved yet) → em dash. Clamps to [0,1] so
 * a stray out-of-range value can't render "120%".
 */
export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return EM_DASH;
  const clamped = Math.max(0, Math.min(1, rate));
  return `${Math.round(clamped * 100)}%`;
}
