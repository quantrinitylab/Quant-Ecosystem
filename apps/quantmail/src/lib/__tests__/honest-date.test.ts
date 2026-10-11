// ===========================================================================
// QM-FIX: thread-view "Date:" field must never show non-date text.
//
// Regression pins for the 2026-10-11 customer-audit P2: the thread details
// "Date:" row displayed message body text instead of a date. The renderers
// now resolve the best real date (receivedAt → createdAt → updatedAt) via
// `resolveMessageDate`/`formatDetailDate` and degrade to an honest fallback —
// they never emit "Invalid Date", never echo the raw field, and never
// fabricate a date.
// ===========================================================================

import { describe, it, expect } from 'vitest';
import { resolveMessageDate, formatDetailDate } from '../honest-date';

const BODY_TEXT = 'This is an automated QA send test. Please ignore this message.';
const RECEIVED_ISO = '2026-10-11T05:40:00.000Z';
const CREATED_ISO = '2026-10-10T08:00:00.000Z';
const UPDATED_ISO = '2026-10-09T08:00:00.000Z';

describe('resolveMessageDate', () => {
  it('prefers receivedAt when it is a valid date', () => {
    const date = resolveMessageDate({ receivedAt: RECEIVED_ISO });
    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe(RECEIVED_ISO);
  });

  it('accepts Date instances and numeric timestamps', () => {
    const asDate = resolveMessageDate({ receivedAt: new Date(RECEIVED_ISO) });
    expect(asDate?.toISOString()).toBe(RECEIVED_ISO);
    const asNumber = resolveMessageDate({ receivedAt: Date.parse(RECEIVED_ISO) });
    expect(asNumber?.toISOString()).toBe(RECEIVED_ISO);
  });

  it('falls back to createdAt, then updatedAt, when receivedAt is unusable', () => {
    expect(
      resolveMessageDate({ receivedAt: undefined, createdAt: CREATED_ISO })?.toISOString(),
    ).toBe(CREATED_ISO);
    expect(
      resolveMessageDate({
        receivedAt: undefined,
        createdAt: undefined,
        updatedAt: UPDATED_ISO,
      })?.toISOString(),
    ).toBe(UPDATED_ISO);
  });

  it('returns null when no field holds a usable date', () => {
    expect(resolveMessageDate({})).toBeNull();
    expect(
      resolveMessageDate({ receivedAt: undefined, createdAt: null, updatedAt: '' }),
    ).toBeNull();
  });
});

describe('formatDetailDate', () => {
  it('renders a real date for a valid receivedAt', () => {
    const out = formatDetailDate({ receivedAt: RECEIVED_ISO });
    expect(out).not.toBe('Invalid Date');
    expect(out).toBe(new Date(RECEIVED_ISO).toLocaleString());
  });

  it('never shows body text when receivedAt holds non-date text (the audit P2)', () => {
    // The exact failure shape from the finding: body text in the date field.
    const out = formatDetailDate({
      receivedAt: BODY_TEXT,
      createdAt: CREATED_ISO,
      updatedAt: UPDATED_ISO,
    });
    expect(out).not.toContain(BODY_TEXT);
    expect(out).not.toBe('Invalid Date');
    // Falls back to the next real date — the created-at stamp.
    expect(out).toBe(new Date(CREATED_ISO).toLocaleString());
  });

  it('never shows "Invalid Date" when every date field is garbage', () => {
    const out = formatDetailDate({
      receivedAt: BODY_TEXT,
      createdAt: 'not a date either',
    });
    expect(out).not.toContain(BODY_TEXT);
    expect(out).not.toBe('Invalid Date');
    expect(out).toBe('Unknown date');
  });

  it('uses the caller-supplied fallback when no real date exists', () => {
    expect(formatDetailDate({}, 'N/A')).toBe('N/A');
    expect(formatDetailDate({ receivedAt: null }, 'N/A')).toBe('N/A');
  });

  it('does not echo the raw input for empty-string receivedAt', () => {
    const out = formatDetailDate({ receivedAt: '', createdAt: CREATED_ISO });
    expect(out).toBe(new Date(CREATED_ISO).toLocaleString());
  });
});
