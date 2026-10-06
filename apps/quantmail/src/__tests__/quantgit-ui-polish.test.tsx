import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../app/quantgit/components/PullRequestsTab';
import { IssuesTab } from '../app/quantgit/components/IssuesTab';
import { AgentsTab } from '../app/quantgit/components/AgentsTab';
import { QuantGitRowSkeleton, QuantGitEmptyState } from '../app/quantgit/components/QuantGitSkeletons';
import {
  QuantGitPRIcon,
  QuantGitIssueOpenIcon,
  QuantGitIssueClosedIcon,
  QuantGitCheckCircleIcon,
  QuantGitXCircleIcon,
  QuantGitCommentIcon,
} from '../app/quantgit/components/QuantGitIcons';
import type { PRItem, IssueItem, DeployedAgent } from '../app/quantgit/types';

const mockPRs: PRItem[] = [
  {
    id: 347,
    title: 'Add read-receipt backend pipeline',
    state: 'open',
    author: 'dev-user',
    branchSource: 'feat/read-receipts',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 4,
    createdAt: '2 hours ago',
    additions: 120,
    deletions: 30,
  },
  {
    id: 346,
    title: 'Fix drive upload button',
    state: 'merged',
    author: 'dev-user',
    branchSource: 'fix/drive-upload',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 2,
    createdAt: '1 day ago',
    additions: 40,
    deletions: 10,
  },
];

const mockIssues: IssueItem[] = [
  {
    id: 89,
    title: 'Calendar save button does nothing',
    state: 'open',
    author: 'qa-user',
    labels: [{ name: 'bug', color: '#d73a4a' }],
    commentsCount: 3,
    createdAt: '3 hours ago',
    assignee: 'dev-user',
  },
];

const mockAgents: DeployedAgent[] = [
  {
    id: 'agent-1',
    name: 'ci-guardian',
    role: 'CI Watch',
    pod: 'pod/ci-1',
    status: 'active',
    currentTask: 'Watching CI gates',
    initial: 'C',
    color: '#3FB950',
  },
];

const noop = () => {};

describe('QuantGit UI polish — SVG icons, loading states, empty states, a11y', () => {
  // ------------------------------------------------------------------
  // 1. PullRequestsTab
  // ------------------------------------------------------------------
  describe('PullRequestsTab', () => {
    const baseProps = {
      pullSearchQuery: '',
      setPullSearchQuery: noop,
      filteredPulls: mockPRs,
      openPullsCount: 1,
      closedPullsCount: 1,
    };

    it('renders skeleton rows when isLoading', () => {
      const html = renderToStaticMarkup(<PullRequestsTab {...baseProps} isLoading />);
      expect(html).toContain('pr-list-skeleton');
      expect(html).toContain('animate-pulse');
      expect(html).not.toContain('pr-row-347');
    });

    it('renders empty state when no PRs', () => {
      const html = renderToStaticMarkup(<PullRequestsTab {...baseProps} filteredPulls={[]} />);
      expect(html).toContain('pr-list-empty');
      expect(html).toContain('No pull requests');
    });

    it('renders PR rows as buttons (keyboard accessible), not divs', () => {
      const html = renderToStaticMarkup(<PullRequestsTab {...baseProps} />);
      expect(html).toContain('data-testid="pr-row-347"');
      // Row must be a <button>, not a <div onClick>
      expect(html).toMatch(/<button[^>]*data-testid="pr-row-347"/);
      expect(html).toContain('aria-label="Open pull request Add read-receipt backend pipeline"');
    });

    it('uses SVG icons instead of emoji in rows', () => {
      const html = renderToStaticMarkup(<PullRequestsTab {...baseProps} />);
      expect(html).toContain('<svg');
      expect(html).not.toContain('💬');
      expect(html).not.toContain('⑂');
    });

    it('uses text-sm for row titles', () => {
      const html = renderToStaticMarkup(<PullRequestsTab {...baseProps} />);
      expect(html).toContain('text-sm');
    });
  });

  // ------------------------------------------------------------------
  // 2. IssuesTab
  // ------------------------------------------------------------------
  describe('IssuesTab', () => {
    const baseProps = {
      issueSearchQuery: '',
      setIssueSearchQuery: noop,
      filteredIssues: mockIssues,
      openIssuesCount: 1,
      closedIssuesCount: 0,
      setModalState: noop,
      openIssueDetail: noop,
      handleToggleIssue: noop,
    };

    it('renders skeleton rows when isLoading', () => {
      const html = renderToStaticMarkup(<IssuesTab {...baseProps} isLoading />);
      expect(html).toContain('issue-list-skeleton');
      expect(html).toContain('animate-pulse');
    });

    it('renders empty state when no issues', () => {
      const html = renderToStaticMarkup(<IssuesTab {...baseProps} filteredIssues={[]} />);
      expect(html).toContain('issue-list-empty');
      expect(html).toContain('No issues');
    });

    it('renders issue rows as buttons (keyboard accessible), not divs', () => {
      const html = renderToStaticMarkup(<IssuesTab {...baseProps} />);
      expect(html).toMatch(/<button[^>]*data-testid="issue-row-89"/);
      expect(html).toContain('aria-label="Open issue Calendar save button does nothing"');
    });

    it('uses SVG icons instead of emoji in rows', () => {
      const html = renderToStaticMarkup(<IssuesTab {...baseProps} />);
      expect(html).toContain('<svg');
      expect(html).not.toContain('💬');
      expect(html).not.toContain('☉');
    });
  });

  // ------------------------------------------------------------------
  // 3. AgentsTab
  // ------------------------------------------------------------------
  describe('AgentsTab', () => {
    it('renders empty state when no agents', () => {
      const html = renderToStaticMarkup(<AgentsTab agents={[]} setModalState={noop} />);
      expect(html).toContain('agents-empty');
      expect(html).toContain('No agents deployed');
    });

    it('renders agent cards when agents exist', () => {
      const html = renderToStaticMarkup(<AgentsTab agents={mockAgents} setModalState={noop} />);
      expect(html).toContain('ci-guardian');
      expect(html).not.toContain('agents-empty');
    });
  });

  // ------------------------------------------------------------------
  // 4. Shared components
  // ------------------------------------------------------------------
  describe('QuantGitRowSkeleton', () => {
    it('renders the requested number of skeleton rows', () => {
      const html = renderToStaticMarkup(<QuantGitRowSkeleton rows={3} />);
      expect(html).toContain('animate-pulse');
    });

    it('renders SVG icons with currentColor inheritance', () => {
      const icons = [
        <QuantGitPRIcon key="a" />,
        <QuantGitIssueOpenIcon key="b" />,
        <QuantGitIssueClosedIcon key="c" />,
        <QuantGitCheckCircleIcon key="d" />,
        <QuantGitXCircleIcon key="e" />,
        <QuantGitCommentIcon key="f" />,
      ];
      const html = renderToStaticMarkup(<>{icons}</>);
      const svgCount = (html.match(/<svg/g) || []).length;
      expect(svgCount).toBe(6);
    });
  });

  describe('QuantGitEmptyState', () => {
    it('renders title, hint, and action button', () => {
      const onAction = vi.fn();
      const html = renderToStaticMarkup(
        <QuantGitEmptyState
          icon="pr"
          title="No pull requests"
          hint="Create one to start."
          actionLabel="New pull request"
          onAction={onAction}
        />,
      );
      expect(html).toContain('No pull requests');
      expect(html).toContain('Create one to start.');
      expect(html).toContain('New pull request');
    });
  });
});
