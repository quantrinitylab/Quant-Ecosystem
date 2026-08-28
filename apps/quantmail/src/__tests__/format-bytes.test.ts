import { describe, it, expect } from 'vitest';
import { formatBytes } from '../lib/format-bytes';

/**
 * `formatBytes` replaced four divergent copies of `formatFileSize` that lived in
 * `app/drive/page.tsx`, `EmailComposer.tsx`, `QuantDrivePickerModal.tsx` and
 * `components/FileManager.tsx`. They disagreed about zero, about rounding, and
 * about how many decimals a gigabyte gets, so the same file could read `1 GB` on
 * one screen and `1.00 GB` on another. These cases pin the single answer.
 */
describe('formatBytes', () => {
  it('renders bytes with no decimal point', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('steps up a unit at each 1024 boundary', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 ** 2)).toBe('1 MB');
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
    expect(formatBytes(1024 ** 4)).toBe('1 TB');
    expect(formatBytes(1024 ** 5)).toBe('1 PB');
  });

  it('drops trailing zeros rather than padding to a fixed width', () => {
    // The FileManager copy rendered exactly one gigabyte as `1.00 GB` while the
    // Drive page rendered `1 GB`. One answer now: no trailing zeros anywhere.
    expect(formatBytes(1024 ** 3)).not.toContain('.00');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 2 * 2.5)).toBe('2.5 MB');
  });

  it('keeps one decimal of precision above the byte range', () => {
    expect(formatBytes(1024 * 1.25)).toBe('1.3 KB');
    expect(formatBytes(1024 ** 2 * 10.44)).toBe('10.4 MB');
  });

  it('clamps past the largest known unit instead of producing an undefined suffix', () => {
    // `Math.log` would index past the units array for absurd inputs; the result
    // must still be a readable string, not `1 undefined`.
    expect(formatBytes(1024 ** 8)).toBe('1073741824 PB');
  });

  it('treats missing, negative and non-finite input as zero', () => {
    // A quota response that omits `used` must not render `NaN B` in the sidebar.
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});
