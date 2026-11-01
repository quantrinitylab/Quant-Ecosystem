import { describe, expect, it } from 'vitest';
import {
  dateGroupLabelFor,
  matchesFocusedRule,
  splitMentionSegments,
} from '../inbox-focused';

describe('inbox-focused: date group labels', () => {
  const now = new Date(2026, 9, 31, 12, 0, 0); // 2026-10-31 local

  it('labels today, yesterday, this week, last month, and year', () => {
    expect(dateGroupLabelFor(new Date(2026, 9, 31, 9, 0, 0), now)).toBe('Today');
    expect(dateGroupLabelFor(new Date(2026, 9, 30, 9, 0, 0), now)).toBe('Yesterday');
    expect(dateGroupLabelFor(new Date(2026, 9, 28, 9, 0, 0), now)).toBe('This Week');
    expect(dateGroupLabelFor(new Date(2026, 9, 15, 9, 0, 0), now)).toBe('Last Month');
    expect(dateGroupLabelFor(new Date(2025, 10, 17, 9, 0, 0), now)).toBe('2025');
  });

  it('puts unparseable and missing dates in Earlier, never crashing', () => {
    expect(dateGroupLabelFor('not-a-date', now)).toBe('Earlier');
    expect(dateGroupLabelFor(undefined, now)).toBe('Earlier');
    expect(dateGroupLabelFor(null, now)).toBe('Earlier');
  });

  it('treats a future date as Today, not a negative bucket', () => {
    expect(dateGroupLabelFor(new Date(2026, 10, 2, 9, 0, 0), now)).toBe('Today');
  });
});

describe('inbox-focused: Focused/Other rule', () => {
  it('focuses primary-category mail', () => {
    expect(matchesFocusedRule({ category: 'primary' })).toBe(true);
  });

  it('focuses contact and important mail even when categorized elsewhere', () => {
    expect(matchesFocusedRule({ category: 'promotions', isContact: true })).toBe(true);
    expect(matchesFocusedRule({ category: 'updates', isImportant: true })).toBe(true);
  });

  it('sends categorized, non-contact, non-important mail to Other', () => {
    expect(matchesFocusedRule({ category: 'promotions' })).toBe(false);
    expect(matchesFocusedRule({ category: 'social' })).toBe(false);
    expect(matchesFocusedRule({ category: 'updates' })).toBe(false);
    expect(matchesFocusedRule({ category: 'forums' })).toBe(false);
  });
});

describe('inbox-focused: @-mention segments', () => {
  it('splits @handle tokens out of preview text', () => {
    expect(splitMentionSegments('Hey @sam, see this')).toEqual([
      { text: 'Hey ', mention: false },
      { text: '@sam', mention: true },
      { text: ', see this', mention: false },
    ]);
  });

  it('returns plain segments untouched when there is no mention', () => {
    expect(splitMentionSegments('plain preview')).toEqual([
      { text: 'plain preview', mention: false },
    ]);
    expect(splitMentionSegments('')).toEqual([]);
  });
});
