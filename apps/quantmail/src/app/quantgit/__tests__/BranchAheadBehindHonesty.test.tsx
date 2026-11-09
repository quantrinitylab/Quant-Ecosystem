import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchesTab } from '../components/BranchesTab';
import { mapBackendBranchToItem } from '../components/mapBackendBranch';
import type { BranchItem, Repo } from '../types';

// Regression suite for the "always behind 0 / ahead 0" defect: the branches
// endpoints hardcoded `aheadBy: 0, behindBy: 0` in every payload row and the
// mapper defaulted missing values to 0 (`?? 0`), so BranchesTab rendered a
// "behind 0 / ahead 0" badge with tooltip "0 commits behind, 0 commits ahead
// of main" on EVERY branch row — presenting uncomputed values as a measured
// ahead/behind signal, even for diverged branches.
//
// Fix contract: the backend omits the fields (it computes nothing), the
// mapper passes through only real finite numbers (missing/non-numeric
// degrades to undefined), and BranchesTab renders an honest "not computed"
// slot when either value is absent. A present number is a real measurement
// and still renders as the behind/ahead badge.

const TEST_REPO: Repo = {
  id: 'test-repo',
  name: 'test-repo',
  fullName: 'tester/test-repo',
  description: 'Test repo for branch ahead/behind honesty tests',
  visibility: 'private',
  language: '',
  stars: 0,
  forks: 0,
  watching: 0,
  cloneUrl: '',
  defaultBranch: 'main',
  latestCommit: '',
  latestCommitSha: '',
  latestCommitTime: '',
  checksStatus: 'unknown',
  license: '',
  website: '',
  topics: [],
};

function makeBackendBranch(overrides: Record<string, unknown> = {}) {
  // Current real backend shape (backend/routes/repos.ts branches payload):
  // NO aheadBy/behindBy — the endpoint does not compute them.
  return {
    name: 'feature/one',
    sha: 'a1b2c3d4e5f6000000000000000000000000000001',
    isDefault: false,
    isProtected: false,
    protection: 'none',
    ...overrides,
  };
}

function branchesForTab(items: BranchItem[]): BranchItem[] {
  return items;
}

describe('mapBackendBranchToItem — ahead/behind never invented', () => {
  it('maps a real backend payload (no aheadBy/behindBy) to undefined, not 0', () => {
    const item = mapBackendBranchToItem(makeBackendBranch(), 'main');
    expect(item.aheadBy).toBeUndefined();
    expect(item.behindBy).toBeUndefined();
    // The old `?? 0` fallback would have produced a fake measured 0/0.
    expect(JSON.stringify(item)).not.toContain('"aheadBy":0');
    expect(JSON.stringify(item)).not.toContain('"behindBy":0');
  });

  it('degrades non-numeric ahead/behind values to undefined, never 0', () => {
    for (const bad of [undefined, null, '3', Number.NaN, Number.POSITIVE_INFINITY]) {
      const item = mapBackendBranchToItem(
        makeBackendBranch({ aheadBy: bad, behindBy: bad }),
        'main',
      );
      expect(item.aheadBy).toBeUndefined();
      expect(item.behindBy).toBeUndefined();
    }
  });

  it('preserves real computed counts verbatim when the backend provides them', () => {
    const item = mapBackendBranchToItem(
      makeBackendBranch({ aheadBy: 3, behindBy: 2 }),
      'main',
    );
    expect(item.aheadBy).toBe(3);
    expect(item.behindBy).toBe(2);
  });

  it('preserves a real measured 0/0 (a genuinely in-sync branch) as 0', () => {
    // 0 is only honest when the backend actually measured it. The mapper
    // must not rewrite a real measurement into "not computed".
    const item = mapBackendBranchToItem(
      makeBackendBranch({ aheadBy: 0, behindBy: 0 }),
      'main',
    );
    expect(item.aheadBy).toBe(0);
    expect(item.behindBy).toBe(0);
  });
});

describe('BranchesTab — uncomputed ahead/behind renders honestly', () => {
  function renderBranches(items: BranchItem[]): string {
    return renderToStaticMarkup(
      <BranchesTab repo={TEST_REPO} branches={branchesForTab(items)} currentUsername="tester" />,
    );
  }

  function mappedBranch(name: string, overrides: Record<string, unknown> = {}): BranchItem {
    return mapBackendBranchToItem(makeBackendBranch({ name, ...overrides }), 'main');
  }

  it('renders "not computed" and never "behind 0 / ahead 0" for uncomputed rows', () => {
    const html = renderBranches([
      mappedBranch('main', { isDefault: true }),
      mappedBranch('feature/one'),
    ]);
    expect(html).toContain('ahead/behind not computed');
    expect(html).toContain('not computed yet');
    expect(html).not.toContain('behind 0');
    expect(html).not.toContain('ahead 0');
    expect(html).not.toContain('0 commits behind');
    expect(html).not.toContain('0 commits ahead');
  });

  it('renders the measured badge and tooltip when real counts exist', () => {
    const html = renderBranches([
      mappedBranch('main', { isDefault: true }),
      mappedBranch('feature/diverged', { aheadBy: 3, behindBy: 2 }),
    ]);
    expect(html).toContain('behind 2');
    expect(html).toContain('ahead 3');
    expect(html).toContain('2 commits behind, 3 commits ahead of main');
    expect(html).not.toContain('not computed');
  });

  it('renders "not computed" when only one of the two counts is present', () => {
    // A half-measured pair is still unmeasured: showing "behind 0" for the
    // missing half would reintroduce the invented-value defect.
    const html = renderBranches([
      mappedBranch('main', { isDefault: true }),
      mappedBranch('feature/partial', { aheadBy: 5 }),
    ]);
    expect(html).toContain('ahead/behind not computed');
    expect(html).not.toContain('behind 0');
    expect(html).not.toContain('ahead 5');
  });
});
