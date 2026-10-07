import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  isExempt,
  findInlineFetches,
  compareToBaseline,
  hitsToBaseline,
  scanUiSurfaces,
  loadBaseline,
  type FetchHit,
} from '../inline-fetch-guard';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'inline-fetch-baseline.json');

describe('isExempt', () => {
  it('exempts Next App Router proxy route handlers', () => {
    expect(isExempt('apps/quantai/src/app/api/models/route.ts')).toBe(true);
  });

  it('exempts Pages Router api routes', () => {
    expect(isExempt('apps/quantads/src/pages/api/track.ts')).toBe(true);
  });

  it('exempts test and declaration files', () => {
    expect(isExempt('apps/quantai/src/services/foo.test.ts')).toBe(true);
    expect(isExempt('apps/quantai/src/__tests__/foo.ts')).toBe(true);
    expect(isExempt('apps/quantai/src/global.d.ts')).toBe(true);
  });

  it('does NOT exempt ordinary UI surfaces (pages, components, services)', () => {
    expect(isExempt('apps/quantai/src/app/page.tsx')).toBe(false);
    expect(isExempt('apps/quantai/src/components/Chat.tsx')).toBe(false);
    expect(isExempt('apps/quantai/src/services/api-client.ts')).toBe(false);
  });
});

describe('findInlineFetches', () => {
  it('flags a bare inline fetch call', () => {
    expect(findInlineFetches('const r = await fetch("/api/x");')).toEqual([1]);
  });

  it('flags fetch with whitespace before the paren', () => {
    expect(findInlineFetches('fetch ("/api/x")')).toEqual([1]);
  });

  it('does NOT flag react-query refetch / prefetch helpers', () => {
    expect(findInlineFetches('query.refetch(); client.prefetchQuery();')).toEqual([]);
  });

  it('does NOT flag method-access .fetch (e.g. window.fetch / client.fetch)', () => {
    expect(findInlineFetches('window.fetch("/api/x"); client.fetch();')).toEqual([]);
  });

  it('reports correct line numbers across multiple lines', () => {
    const src = ['import x;', 'const a = fetch(url);', 'noop();', 'await fetch(url2);'].join('\n');
    expect(findInlineFetches(src)).toEqual([2, 4]);
  });
});

describe('compareToBaseline', () => {
  const hits: FetchHit[] = [
    { file: 'apps/a/src/p.tsx', lines: [1, 2] },
    { file: 'apps/b/src/q.tsx', lines: [3] },
  ];

  it('passes when current is a subset of the baseline', () => {
    const baseline = { 'apps/a/src/p.tsx': 2, 'apps/b/src/q.tsx': 1 };
    const cmp = compareToBaseline(hits, baseline);
    expect(cmp.ok).toBe(true);
    expect(cmp.newViolations).toHaveLength(0);
    expect(cmp.increased).toHaveLength(0);
  });

  it('flags a file absent from the baseline as a NEW violation', () => {
    const baseline = { 'apps/a/src/p.tsx': 2 };
    const cmp = compareToBaseline(hits, baseline);
    expect(cmp.ok).toBe(false);
    expect(cmp.newViolations.map((v) => v.file)).toEqual(['apps/b/src/q.tsx']);
  });

  it('flags an increased count as a violation', () => {
    const baseline = { 'apps/a/src/p.tsx': 1, 'apps/b/src/q.tsx': 1 };
    const cmp = compareToBaseline(hits, baseline);
    expect(cmp.ok).toBe(false);
    expect(cmp.increased).toEqual([{ file: 'apps/a/src/p.tsx', was: 1, now: 2 }]);
  });

  it('records resolved files (burndown) without failing', () => {
    const baseline = { 'apps/a/src/p.tsx': 2, 'apps/b/src/q.tsx': 1, 'apps/c/src/r.tsx': 5 };
    const cmp = compareToBaseline(hits, baseline);
    expect(cmp.ok).toBe(true);
    expect(cmp.resolved).toEqual([{ file: 'apps/c/src/r.tsx', was: 5, now: 0 }]);
  });

  it('round-trips hits -> baseline map', () => {
    expect(hitsToBaseline(hits)).toEqual({ 'apps/a/src/p.tsx': 2, 'apps/b/src/q.tsx': 1 });
  });
});

describe('repo ratchet (Requirement 1.4: api-client only)', () => {
  it('introduces no inline fetch in UI surfaces beyond the documented baseline', () => {
    const hits = scanUiSurfaces(ROOT);
    const baseline = loadBaseline(BASELINE_PATH);
    const cmp = compareToBaseline(hits, baseline);

    // Surface offending files in the assertion message for fast diagnosis.
    const detail = [
      ...cmp.newViolations.map((v) => `NEW ${v.file} (lines ${v.lines.join(', ')})`),
      ...cmp.increased.map((i) => `MORE ${i.file} (${i.was} -> ${i.now})`),
    ].join('\n');
    expect(cmp.ok, `Inline-fetch guard regressions:\n${detail}`).toBe(true);
  });
});
