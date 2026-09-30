/**
 * Human-readable formatters for the QuantMail admin console KPI cards.
 *
 * Pure functions, no React — the display logic that's most bug-prone (byte
 * scaling, percent rounding) lives here so it can be unit-tested without a DOM.
 * Every formatter returns an em dash for absent/invalid input so a card never
 * renders `NaN`, `undefined`, or `Infinity`.
 */

const EM_DASH = '—';

/** Locale-grouped integer, e.g. 1234567 → "1,234,567". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return EM_DASH;
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Bytes → the largest binary unit under which the value is ≥ 1, e.g.
 * 987654321 → "941.9 MB", 512 → "512 B", 0 → "0 B". Whole bytes get no
 * decimal; larger units read better with one.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return EM_DASH;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const rendered = exponent === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${rendered} ${units[exponent]}`;
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
