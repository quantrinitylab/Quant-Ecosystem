import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveBranchSelectorLists } from '../components/CodeTab';
import { BranchSelectorModal } from '../components/BranchSelectorModal';
import { RepoSidebarMetadata } from '../components/RepoSidebarMetadata';

// QM-UIUX-063 — QuantGit must never fabricate repo stats or selector entries.
// Regression: a repo with 0/missing stats renders honest values (never
// "111,000 stars"), and the branch/tag selector offers only branches and
// tags that are actually known for the repo — no invented example branches
// ('feat/speech-telemetry', 'feat/mcp-registry') and no invented release
// tags ('v1.0.5', 'v1.0.4', 'v1.0.0').

const INVENTED_BRANCHES = ['feat/speech-telemetry', 'feat/mcp-registry'];
const INVENTED_TAGS = ['v1.0.5', 'v1.0.4', 'v1.0.0'];

describe('QM-UIUX-063: resolveBranchSelectorLists (known-only selector data)', () => {
  it('with no branch data at all, offers only the current/default branch and zero tags', () => {
    const lists = resolveBranchSelectorLists({
      currentBranch: 'main',
      defaultBranch: 'main',
    });

    expect(lists.branches).toEqual(['main']);
    expect(lists.tags).toEqual([]);
    for (const invented of [...INVENTED_BRANCHES, ...INVENTED_TAGS]) {
      expect(lists.branches).not.toContain(invented);
      expect(lists.tags).not.toContain(invented);
    }
  });

  it('with an empty repoBranches array, falls back to the repo record branches', () => {
    const lists = resolveBranchSelectorLists({
      repoBranches: [],
      repoBranchesFromRepo: ['main', 'dev'],
      currentBranch: 'main',
      defaultBranch: 'main',
    });

    expect(lists.branches).toEqual(['main', 'dev']);
    expect(lists.tags).toEqual([]);
  });

  it('prefers the API branch list over the repo record and de-duplicates', () => {
    const lists = resolveBranchSelectorLists({
      repoBranches: ['main', 'release/2.0', 'release/2.0'],
      repoBranchesFromRepo: ['main', 'dev'],
      currentBranch: 'main',
      defaultBranch: 'main',
      repoTags: ['v2.0.0', 'v2.0.0'],
    });

    expect(lists.branches).toEqual(['main', 'release/2.0']);
    expect(lists.tags).toEqual(['v2.0.0']);
  });

  it('keeps current and default branch when they differ and no lists exist', () => {
    const lists = resolveBranchSelectorLists({
      currentBranch: 'hotfix/login',
      defaultBranch: 'main',
    });

    expect(lists.branches).toEqual(['hotfix/login', 'main']);
    expect(lists.tags).toEqual([]);
  });
});

describe('QM-UIUX-063: BranchSelectorModal fed by the resolver (no data case)', () => {
  it('renders "Tags (0)" and none of the invented branches/tags', () => {
    const lists = resolveBranchSelectorLists({
      currentBranch: 'main',
      defaultBranch: 'main',
    });
    const html = renderToStaticMarkup(
      <BranchSelectorModal
        isOpen
        onClose={vi.fn()}
        currentBranch="main"
        branches={lists.branches}
        tags={lists.tags}
        defaultBranch="main"
        onSelectBranch={vi.fn()}
        onSelectTag={vi.fn()}
      />,
    );

    expect(html).toContain('Tags (0)');
    expect(html).toContain('Branches (1)');
    for (const invented of [...INVENTED_BRANCHES, ...INVENTED_TAGS]) {
      expect(html).not.toContain(invented);
    }
  });
});

describe('QM-UIUX-063: RepoSidebarMetadata honest stats', () => {
  it('a repo with 0 stars/forks/watchers renders 0 — never the fabricated 111,000', () => {
    const html = renderToStaticMarkup(
      <RepoSidebarMetadata
        repoOwner="quantrinitylab"
        repoName="brand-new-repo"
        starsCount={0}
        forksCount={0}
        watchersCount={0}
      />,
    );

    expect(html).not.toContain('111');
    expect(html).not.toContain('111,000');
    // No releases / used-by / contributors / languages widgets without real data.
    expect(html).not.toContain('Releases');
    expect(html).not.toContain('Used by');
    expect(html).not.toContain('Contributors');
    expect(html).not.toContain('Languages');
    expect(html).not.toContain('28144');
    expect(html).not.toContain('28,144');
    expect(html).not.toContain('110K');
    expect(html).not.toContain('v1.0.5');
  });

  it('still renders real release/language data when it is actually provided', () => {
    const html = renderToStaticMarkup(
      <RepoSidebarMetadata
        repoOwner="quantrinitylab"
        repoName="real-repo"
        starsCount={42}
        forksCount={3}
        watchersCount={7}
        releasesCount={2}
        latestReleaseTag="v2.3.1"
        usedByCount="17"
        languages={[{ name: 'TypeScript', percentage: 100, color: '#3178c6' }]}
      />,
    );

    expect(html).toContain('42');
    expect(html).toContain('v2.3.1');
    expect(html).toContain('Used by 17');
    expect(html).toContain('TypeScript');
    expect(html).not.toContain('v1.0.5');
  });
});
