/**
 * Templates picker search matches the shortcut badge (fix/qm-templates-shortcut-search).
 *
 * Regression: filteredTemplates matched only name/subject, so typing ":intro"
 * in the picker search never matched the ":intro" badge shown on the row.
 * The predicate is the pure helper exported from EmailTemplates.tsx; these
 * tests assert it directly (no DOM rendering needed — the component renders
 * the same filtered list).
 */
import { describe, it, expect } from 'vitest';
import { matchesTemplateSearch } from '../EmailTemplates';
import type { EmailTemplate } from '../EmailTemplates';

function makeTemplate(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: 'tpl-1',
    name: 'Introduction',
    subject: 'Hello and welcome',
    body: 'Hi there',
    category: 'custom',
    createdAt: '2026-10-11T00:00:00Z',
    shortcut: ':intro',
    usageCount: 0,
    ...overrides,
  };
}

describe('matchesTemplateSearch', () => {
  it('matches the exact shortcut query ":intro"', () => {
    expect(matchesTemplateSearch(makeTemplate(), ':intro')).toBe(true);
  });

  it('matches the shortcut without the colon ("intro" is a substring of ":intro")', () => {
    expect(matchesTemplateSearch(makeTemplate(), 'intro')).toBe(true);
  });

  it('matches the shortcut case-insensitively', () => {
    expect(matchesTemplateSearch(makeTemplate(), ':INTRO')).toBe(true);
  });

  it('still matches by name and by subject', () => {
    expect(matchesTemplateSearch(makeTemplate(), 'introduction')).toBe(true);
    expect(matchesTemplateSearch(makeTemplate(), 'welcome')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(matchesTemplateSearch(makeTemplate(), 'farewell')).toBe(false);
  });

  it('empty query matches everything', () => {
    expect(matchesTemplateSearch(makeTemplate(), '   ')).toBe(true);
  });

  it('a template with a null shortcut does not crash and still matches by name', () => {
    const template = makeTemplate({ shortcut: null });
    expect(matchesTemplateSearch(template, ':intro')).toBe(false);
    expect(matchesTemplateSearch(template, 'introduction')).toBe(true);
  });

  it('a shortcut-only match does not leak into other templates', () => {
    const other = makeTemplate({ id: 'tpl-2', name: 'Follow up', subject: 'Checking in', shortcut: ':follow' });
    expect(matchesTemplateSearch(other, ':intro')).toBe(false);
    expect(matchesTemplateSearch(other, ':follow')).toBe(true);
  });
});
