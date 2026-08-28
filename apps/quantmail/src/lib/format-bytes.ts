// ============================================================================
// One byte formatter for the whole app.
//
// There were four copies of this function — `app/drive/page.tsx`,
// `components/EmailComposer.tsx`, `components/QuantDrivePickerModal.tsx` and
// `components/FileManager.tsx` — and the fourth disagreed with the other three:
// it printed `-` for zero and two decimals for gigabytes, so one file read
// `1 GB` in Drive and `1.00 GB` in the file manager, and an empty folder read
// `0 B` in one place and `-` in another. Sizes are the kind of detail a user
// checks twice; they should not change between screens.
// ============================================================================

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Human-readable size, binary units, one decimal above kilobytes.
 *
 * `formatBytes(0)` → `'0 B'`, `formatBytes(1536)` → `'1.5 KB'`,
 * `formatBytes(1073741824)` → `'1 GB'`.
 *
 * Non-finite and negative inputs collapse to `'0 B'` rather than `'NaN undefined'`,
 * which is what the old copies produced when a `size` field was missing.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  // Bytes are always whole; everything above gets one decimal, trailing zero
  // trimmed so `1.0 GB` reads `1 GB`.
  const rendered =
    exponent === 0 ? String(Math.round(value)) : String(parseFloat(value.toFixed(1)));
  return `${rendered} ${UNITS[exponent]}`;
}
