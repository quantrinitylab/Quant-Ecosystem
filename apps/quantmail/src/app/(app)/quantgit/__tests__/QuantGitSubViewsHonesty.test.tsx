/**
 * QM-SCREEN-013 (R3) honesty regression tests.
 *
 * Guards against toast/badge theater:
 *  - the PRs landing sub-view must never claim a merge happened — the merge
 *    button delegates to the parent, and "merged" state comes only from the
 *    PR's real status;
 *  - the code tab must show an honest "browsing at commit" banner exactly
 *    when a detached commit SHA is being browsed.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantGitPrsSubView, type PullRequestItem } from '../components/QuantGitSubViews';
import { CodeTab } from '../components/CodeTab';

const openPr: PullRequestItem = {
  id: 'pr-1',
  prNumber: 101,
  title: 'Fix login redirect',
  author: 'astra',
  sourceBranch: 'fix/login',
  targetBranch: 'main',
  status: 'approved_ready',
  statusText: 'Ready to merge',
  diffStats: { additions: 10, deletions: 2, filesChanged: 1 },
  labels: [],
  createdAt: '2h ago',
};

const mergedPr: PullRequestItem = {
  ...openPr,
  id: 'pr-2',
  prNumber: 102,
  status: 'merged',
  statusText: 'Merged',
};

const closedPr: PullRequestItem = {
  ...openPr,
  id: 'pr-3',
  prNumber: 103,
  status: 'closed',
  statusText: 'Closed',
};

describe('QuantGitPrsSubView merge honesty', () => {
  it('renders an open PR with an active merge button, not a fabricated merged badge', () => {
    const html = renderToStaticMarkup(
      <QuantGitPrsSubView prs={[openPr]} onMergePR={vi.fn()} showToast={vi.fn()} />,
    );
    expect(html).toContain('1-Click 3-Way Merge');
    expect(html).not.toContain('Merged (Fast-Forward)');
  });

  it('shows the merged badge only from the real PR status, never local theater', () => {
    const html = renderToStaticMarkup(
      <QuantGitPrsSubView prs={[openPr, mergedPr]} onMergePR={vi.fn()} showToast={vi.fn()} />,
    );
    const mergedBadges = html.match(/Merged \(Fast-Forward\)/g) || [];
    expect(mergedBadges.length).toBe(1);
  });

  it('counts open/merged/closed from real status only', () => {
    const html = renderToStaticMarkup(
      <QuantGitPrsSubView
        prs={[openPr, mergedPr, closedPr]}
        onMergePR={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    expect(html).toContain('Open (1)');
    expect(html).toContain('Merged (1)');
    expect(html).toContain('Closed (1)');
  });
});

describe('CodeTab browse-at-commit banner', () => {
  const baseProps = {
    selectedRepo: {
      id: 'repo-1',
      name: 'demo',
      fullName: 'user/demo',
      description: '',
      visibility: 'private' as const,
      language: '',
      stars: 0,
      forks: 0,
      watching: 0,
      cloneUrl: '',
      defaultBranch: 'main',
      latestCommit: '',
      latestCommitSha: '',
      latestCommitTime: '',
      checksStatus: 'unknown' as const,
      license: '',
    },
    currentBranch: 'main',
    files: [],
    setModalState: vi.fn(),
    openBlobEditor: vi.fn(async () => {}),
    showToast: vi.fn(),
  };

  it('shows the honest banner when browsing at a commit', () => {
    const html = renderToStaticMarkup(
      <CodeTab
        {...baseProps}
        browsingCommitSha="abc1234def5678"
        onExitBrowseCommit={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="browse-commit-banner"');
    expect(html).toContain('abc1234');
    expect(html).toContain('Back to branch');
  });

  it('shows no banner when browsing the branch head', () => {
    const html = renderToStaticMarkup(<CodeTab {...baseProps} />);
    expect(html).not.toContain('data-testid="browse-commit-banner"');
  });
});
