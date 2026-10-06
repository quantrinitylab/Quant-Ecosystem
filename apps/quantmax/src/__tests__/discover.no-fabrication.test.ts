// ============================================================================
// QuantMax — no-fabrication regression guard (P0 trust fix, 2026-10-06)
// ============================================================================
// /discover is a PUBLIC page. It once shipped Math.random() engagement counts
// and thumbnails on the dead cdn.quantmax.app host presented as real data.
// This test fails the build if either pattern ever returns to the discover
// data layer or the discover page.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const GUARDED_FILES = ['../pages/discover.tsx', '../services/discover.service.ts'];

const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['Math.random()', /Math\.random\s*\(/],
  ['cdn.quantmax.app', /cdn\.quantmax\.app/],
  ['hardcoded "Trending Track N" names', /Trending Track \$\{/],
  ['hardcoded "Artist N" names', /Artist \$\{/],
  ['hardcoded "Creative Star N" names', /Creative Star \$\{/],
  ['hardcoded "creator_N" usernames', /creator_\$\{/],
];

describe('discover: no fabricated metrics or fake media (P0 regression)', () => {
  for (const file of GUARDED_FILES) {
    describe(file, () => {
      const source = read(file);
      for (const [label, pattern] of FORBIDDEN_PATTERNS) {
        it(`contains no ${label}`, () => {
          expect(source, `forbidden pattern "${label}" found in ${file}`).not.toMatch(pattern);
        });
      }
    });
  }

  it('discover page renders honest empty states', () => {
    const page = read('../pages/discover.tsx');
    expect(page).toMatch(/No trending sounds yet/);
    expect(page).toMatch(/No challenges yet/);
    expect(page).toMatch(/No creator spotlights yet/);
    expect(page).toMatch(/No .* videos yet/);
  });
});
