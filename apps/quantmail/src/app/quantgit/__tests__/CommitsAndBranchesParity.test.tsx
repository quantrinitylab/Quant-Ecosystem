import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommitsTab } from '../components/CommitsTab';
import { BranchesTab } from '../components/BranchesTab';
import { INITIAL_COMMITS, INITIAL_BRANCHES, INITIAL_REPOS } from '../constants';

describe('QuantGit Commits & Branches Deep Parity Suite', () => {
  const mockRepo = INITIAL_REPOS[0];

  it('renders commits timeline, verified badge, SHA, and branch selector', () => {
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={mockRepo}
        commits={INITIAL_COMMITS}
        currentBranch="main"
        repoBranches={['main', 'feat/sprint-7-github-parity']}
      />,
    );

    expect(html).toContain('Commits on Sep 26, 2026');
    expect(html).toContain('feat(quantgit): implement full GitHub commits history tree');
    expect(html).toContain('Verified');
    expect(html).toContain('c4e6121');
    expect(html).toContain('Branch:');
    expect(html).toContain('main');
  });

  it('renders branches listing, default branch badge, protection badge, ahead/behind stats, and new branch action', () => {
    const html = renderToStaticMarkup(
      <BranchesTab
        repo={mockRepo}
        branches={INITIAL_BRANCHES}
        currentBranch="main"
        onSelectBranch={vi.fn()}
        onCreateBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
      />,
    );

    expect(html).toContain('main');
    expect(html).toContain('Default branch');
    expect(html).toContain('Protected');
    expect(html).toContain('feat/sprint-7-github-parity');
    expect(html).toContain('behind 0');
    expect(html).toContain('ahead 2');
    expect(html).toContain('+ New branch');
  });
});
