// @vitest-environment node
// ============================================================================
// QuantMail Drive — search operator parsing tests (finding: no search
// operators or metadata filters; Google-Drive-style type:/owner:/before:).
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  formatDriveSearchFilters,
  parseDriveSearchQuery,
  removeDriveSearchOperator,
} from '../components/drive/drive-search-operators';
import {
  afterCutoff,
  beforeCutoff,
  mimePatternsForDriveType,
  parseDriveDateParam,
} from '../../backend/lib/drive-search-filters';

describe('parseDriveSearchQuery', () => {
  it('returns plain text untouched when no operators are present', () => {
    const parsed = parseDriveSearchQuery('quarterly report 2026');
    expect(parsed.text).toBe('quarterly report 2026');
    expect(parsed.filters).toEqual({});
    expect(parsed.hasOperators).toBe(false);
  });

  it('parses type: and keeps the residual free text', () => {
    const parsed = parseDriveSearchQuery('type:pdf quarterly report');
    expect(parsed.filters.type).toBe('pdf');
    expect(parsed.text).toBe('quarterly report');
    expect(parsed.hasOperators).toBe(true);
  });

  it('parses owner:, before: and after: together', () => {
    const parsed = parseDriveSearchQuery(
      'owner:me before:2025-01-01 after:2024-06-01 budget',
    );
    expect(parsed.filters.owner).toBe('me');
    expect(parsed.filters.before).toBe('2025-01-01');
    expect(parsed.filters.after).toBe('2024-06-01');
    expect(parsed.text).toBe('budget');
  });

  it('parses owner:shared and owner:<email>', () => {
    expect(parseDriveSearchQuery('owner:shared x').filters.owner).toBe('shared');
    expect(parseDriveSearchQuery('owner:Alice@Example.com x').filters.owner).toBe(
      'alice@example.com',
    );
  });

  it('supports double-quoted values with spaces', () => {
    const parsed = parseDriveSearchQuery('name:"quarterly report" type:pdf');
    expect(parsed.filters.name).toBe('quarterly report');
    expect(parsed.filters.type).toBe('pdf');
    expect(parsed.text).toBe('');
  });

  it('is case-insensitive on operator names', () => {
    const parsed = parseDriveSearchQuery('TYPE:PDF Owner:Me');
    expect(parsed.filters.type).toBe('pdf');
    expect(parsed.filters.owner).toBe('me');
    expect(parsed.text).toBe('');
  });

  it('leaves unknown type keywords in the free text instead of eating them', () => {
    const parsed = parseDriveSearchQuery('type:pdff report');
    expect(parsed.filters.type).toBeUndefined();
    expect(parsed.hasOperators).toBe(false);
    expect(parsed.text).toBe('type:pdff report');
  });

  it('leaves malformed dates in the free text instead of sending bad filters', () => {
    const parsed = parseDriveSearchQuery('before:2025-02-30 report');
    expect(parsed.filters.before).toBeUndefined();
    expect(parsed.text).toBe('before:2025-02-30 report');
  });

  it('leaves non-operator colon text (times, ratios) untouched', () => {
    const parsed = parseDriveSearchQuery('meeting notes 10:30');
    expect(parsed.hasOperators).toBe(false);
    expect(parsed.text).toBe('meeting notes 10:30');
  });

  it('leaves unknown operators in the free text', () => {
    const parsed = parseDriveSearchQuery('author:alice report');
    expect(parsed.hasOperators).toBe(false);
    expect(parsed.text).toBe('author:alice report');
  });

  it('handles an operator-only query', () => {
    const parsed = parseDriveSearchQuery('type:pdf');
    expect(parsed.filters.type).toBe('pdf');
    expect(parsed.text).toBe('');
    expect(parsed.hasOperators).toBe(true);
  });
});

describe('removeDriveSearchOperator', () => {
  it('removes one operator family and keeps the rest', () => {
    expect(removeDriveSearchOperator('type:pdf owner:me report', 'type')).toBe(
      'owner:me report',
    );
  });

  it('removes quoted operators cleanly', () => {
    expect(removeDriveSearchOperator('name:"my report" type:pdf', 'name')).toBe(
      'type:pdf',
    );
  });

  it('is a no-op for operators that are not present', () => {
    expect(removeDriveSearchOperator('plain query', 'type')).toBe('plain query');
  });
});

describe('formatDriveSearchFilters', () => {
  it('round-trips filters back to operator syntax', () => {
    expect(
      formatDriveSearchFilters({
        type: 'pdf',
        owner: 'me',
        before: '2025-01-01',
        after: '2024-01-01',
      }),
    ).toBe('type:pdf owner:me before:2025-01-01 after:2024-01-01');
  });
});

describe('backend drive-search-filters lib', () => {
  it('maps type keywords to mime substrings', () => {
    expect(mimePatternsForDriveType('pdf')).toContain('pdf');
    expect(mimePatternsForDriveType('image')).toContain('image/');
    expect(mimePatternsForDriveType('spreadsheet')).toContain('spreadsheet');
    expect(mimePatternsForDriveType('document')).toContain('msword');
  });

  it('returns an empty list for the virtual folder keyword', () => {
    expect(mimePatternsForDriveType('folder')).toEqual([]);
  });

  it('returns null for unknown keywords (callers return honest-empty)', () => {
    expect(mimePatternsForDriveType('pdff')).toBeNull();
  });

  it('validates ISO dates strictly', () => {
    expect(parseDriveDateParam('2025-01-01')).toBeInstanceOf(Date);
    expect(parseDriveDateParam('2025-02-30')).toBeNull();
    expect(parseDriveDateParam('2025-13-01')).toBeNull();
    expect(parseDriveDateParam('not-a-date')).toBeNull();
    expect(parseDriveDateParam(undefined)).toBeNull();
  });

  it('before: is exclusive of the whole UTC day, after: is inclusive', () => {
    const before = beforeCutoff('2025-01-01');
    const after = afterCutoff('2025-01-01');
    expect(before?.toISOString()).toBe('2025-01-02T00:00:00.000Z');
    expect(after?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(beforeCutoff('bogus')).toBeNull();
  });
});
