/**
 * Live Mail walkthrough (staging, iPhone 14 + desktop):
 * - Trash rows printed `toLocaleDateString()` → "10/13/2026", which on a
 *   phone squeezed the subject into a column that wrapped over 3 lines.
 * - Inbox rows wrote today's time as "01:53 PM" (`hour: '2-digit'`).
 *
 * `formatListDate` is the compact list-row format: time today, "Oct 13" this
 * year, "Oct 13, 2025" before that, '' for bad input (never "Invalid Date").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatListDate, safeISODateTime } from '../lib/honest-date';

const NOW = new Date(2026, 9, 14, 9, 30); // Oct 14 2026, 09:30 local

describe('formatListDate', () => {
  it('shows a time without a leading zero for today', () => {
    const value = new Date(2026, 9, 14, 1, 53);
    const out = formatListDate(value, NOW);
    expect(out).toBe(value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    expect(out).not.toMatch(/^0\d/);
  });

  it('shows month + day earlier this year, with no numeric slashes', () => {
    const out = formatListDate(new Date(2026, 9, 13, 18, 0), NOW);
    expect(out).toBe(new Date(2026, 9, 13).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(out).not.toContain('/');
    expect(out).not.toContain('2026');
  });

  it('adds the year for an older message', () => {
    const out = formatListDate('2025-03-02T10:00:00', NOW);
    expect(out).toContain('2025');
  });

  it('degrades to empty for missing or unparseable input', () => {
    expect(formatListDate(undefined, NOW)).toBe('');
    expect(formatListDate('', NOW)).toBe('');
    expect(formatListDate('not a date', NOW)).toBe('');
  });
});

describe('row time formats (source contract)', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('inbox rows write today as "1:53 PM", not "01:53 PM"', () => {
    const src = read('app/page.tsx');
    const fn = src.slice(src.indexOf('function formatReceivedAt'), src.indexOf('function getFriendlyErrorMessage'));
    expect(fn).toContain("hour: 'numeric'");
    expect(fn).not.toContain("hour: '2-digit'");
  });

  it('Trash rows use the compact list date and keep the date out of the action cluster', () => {
    const src = read('app/trash/page.tsx');
    expect(src).toContain('formatListDate(email.receivedAt)');
    expect(src).not.toContain('toLocaleDateString()');
    // Subject and preview truncate to one line each.
    expect(src).toMatch(/<h3 className="[^"]*\btruncate\b/);
    expect(src).toContain('messagePreviewText(email)');
  });

  it('Scheduled rows do not reuse the pulsing blue "sending" status', () => {
    const src = read('app/scheduled/page.tsx');
    expect(src).toContain('status-scheduled');
    expect(src).not.toContain('status-sending');
    const css = read('app/globals.css');
    expect(css).toMatch(/\.status-scheduled\s*\{[^}]*var\(--quant-primary\)/);
  });
});

describe('safeISODateTime (P1 [thread-people] regression)', () => {
  it('returns a valid ISO string for parseable input', () => {
    expect(safeISODateTime('2026-10-14T09:30:00.000Z')).toBe('2026-10-14T09:30:00.000Z');
    expect(safeISODateTime(new Date(2026, 9, 14))).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(safeISODateTime(1728900000000)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns undefined instead of throwing on unparseable input (React omits the attribute)', () => {
    // This is the inbox crash: toISOString() itself throws a RangeError here.
    expect(() => new Date('not a date').toISOString()).toThrow(RangeError);
    expect(safeISODateTime('not a date')).toBeUndefined();
    expect(safeISODateTime(undefined)).toBeUndefined();
    expect(safeISODateTime(null)).toBeUndefined();
    expect(safeISODateTime('')).toBeUndefined();
  });
});

describe('thread row dateTime contract (source)', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('thread rows write dateTime through the guarded helper, never raw toISOString()', () => {
    const src = read('app/page.tsx');
    expect(src).toContain('dateTime={safeISODateTime(thread.receivedAt)}');
    // Group rows share the same guard.
    expect(src).toMatch(/dateTime=\{safeISODateTime\(\s*matchingThread\.receivedAt/);
    // No remaining unguarded new Date(<x>.receivedAt).toISOString() render calls.
    expect(src).not.toMatch(/new Date\(\s*[\w.]+\.receivedAt[\s\S]{0,40}?\)\.toISOString\(\)/);
  });

  it('formatReceivedAt degrades to empty for unparseable input, never "Invalid Date"', () => {
    const src = read('app/page.tsx');
    const fn = src.slice(src.indexOf('function formatReceivedAt'), src.indexOf('function getFriendlyErrorMessage'));
    expect(fn).toContain('Number.isNaN(date.getTime())');
  });
});
