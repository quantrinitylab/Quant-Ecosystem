import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantGitSubViews,
  QuantGitFeedSubView,
  QuantGitReposSubView,
  QuantGitPrsSubView,
  QuantGitIssuesSubView,
  QuantGitActionsSubView,
  QuantGitCopilotSubView,
  type FeedEventItem,
  type RepositoryItem,
  type PullRequestItem,
  type IssueTrackItem,
  type WorkflowRun,
  type ContextSubViewTab,
} from '../app/quantgit/components/QuantGitSubViews';

// Explicit test fixtures (passed as props — never fabricated component defaults).
const FIXTURE_FEED_EVENTS: FeedEventItem[] = [
  {
    id: 'feed-test-1',
    actor: 'tester',
    action: 'pushed to',
    target: 'test-repo-alpha/main',
    createdAt: '10 mins ago',
  },
];

// Explicit test fixtures (passed as props — never fabricated component defaults).
const FIXTURE_REPOS: RepositoryItem[] = [
  {
    id: 'repo-test-1',
    name: 'test-repo-alpha',
    fullName: 'tester/test-repo-alpha',
    description: 'Fixture repo for rendering tests',
    language: 'TypeScript',
    languageColor: '#3178C6',
    stars: 42,
    forks: 3,
    branches: [{ name: 'main', isProtected: true }],
    defaultBranch: 'main',
    isPrivate: false,
    updatedAt: 'yesterday',
  },
];

const FIXTURE_PRS: PullRequestItem[] = [
  {
    id: 'pr-test-1',
    prNumber: 101,
    title: 'Fixture: add empty-state tests',
    author: 'tester',
    sourceBranch: 'test/empty-states',
    targetBranch: 'main',
    status: 'approved_ready',
    statusText: 'Approved · Ready to Merge',
    diffStats: { additions: 120, deletions: 30, filesChanged: 4 },
    labels: ['test'],
    createdAt: '1 hour ago',
  },
];

const FIXTURE_ISSUES: IssueTrackItem[] = [
  {
    id: 'issue-test-1',
    issueNumber: 11,
    title: 'Fixture: verify empty states',
    priority: 'P1 High',
    priorityColor: 'var(--quant-destructive)',
    labels: ['test'],
    state: 'open',
    author: 'tester',
    createdAt: '2 hours ago',
    commentsCount: 2,
  },
  {
    id: 'issue-test-2',
    issueNumber: 12,
    title: 'Fixture: closed issue',
    priority: 'P3 Low',
    priorityColor: '#10B981',
    labels: ['test'],
    state: 'closed',
    author: 'tester',
    createdAt: '3 days ago',
    commentsCount: 0,
  },
];

const FIXTURE_WORKFLOWS: WorkflowRun[] = [
  {
    id: 'wf-test-1',
    name: 'Fixture CI Gate',
    branch: 'main',
    status: 'success',
    duration: '3m 20s',
    commitSha: 'abcdef12',
    author: 'tester',
    triggerEvent: 'push',
    createdAt: '10 mins ago',
    jobs: [{ id: 'job-t1', name: 'lint: pass', status: 'pass', duration: '1m 00s' }],
  },
];

describe('QuantGit Context Sub-Views — no fabricated defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 0. Activity Feed (`feed`)
  // ==========================================================================
  describe('0. Activity Feed (`feed`)', () => {
    it('renders provided events with actor, action, and target', () => {
      const html = renderToStaticMarkup(<QuantGitFeedSubView events={FIXTURE_FEED_EVENTS} />);

      expect(html).toContain('data-testid="quantgit-feed-subview"');
      expect(html).toContain('Activity Feed');
      expect(html).toContain('tester');
      expect(html).toContain('pushed to');
      expect(html).toContain('test-repo-alpha/main');
      expect(html).toContain('1 EVENTS');
      expect(html).not.toContain('data-testid="quantgit-feed-empty"');
    });

    it('shows an honest empty state when no events are provided (no fabricated activity)', () => {
      const html = renderToStaticMarkup(<QuantGitFeedSubView />);

      expect(html).toContain('data-testid="quantgit-feed-subview"');
      expect(html).toContain('data-testid="quantgit-feed-empty"');
      expect(html).toContain('No activity yet');
      expect(html).toContain('0 EVENTS');
      expect(html).not.toContain('pushed to');
      expect(html).not.toContain('merged pull request');
    });
  });

  // ==========================================================================
  // 1. Repositories Sub-View (`repos`)
  // ==========================================================================
  describe('1. Repositories Sub-View (`repos`)', () => {
    it('renders provided repository cards', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView repos={FIXTURE_REPOS} />);

      expect(html).toContain('test-repo-alpha');
      expect(html).toContain('TypeScript');
      expect(html).toContain('42');
      expect(html).not.toContain('data-testid="quantgit-repos-empty"');
    });

    it('shows an honest empty state when no repos are provided (no fabricated repos)', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView />);

      expect(html).toContain('data-testid="quantgit-repos-empty"');
      expect(html).toContain('No repositories yet');
      expect(html).not.toContain('quant-ecosystem');
      expect(html).not.toContain('quant-kernel');
      expect(html).not.toContain('quant-ai-engine');
    });
  });

  // ==========================================================================
  // 2. Pull Requests Dashboard (`prs`)
  // ==========================================================================
  describe('2. Pull Requests Dashboard (`prs`)', () => {
    it('renders provided PRs with real counts', () => {
      const html = renderToStaticMarkup(<QuantGitPrsSubView prs={FIXTURE_PRS} />);

      expect(html).toContain('PR #101: Fixture: add empty-state tests');
      expect(html).toContain('Approved · Ready to Merge');
      expect(html).toContain('@tester');
      expect(html).toContain('Open (1)');
      expect(html).not.toContain('data-testid="quantgit-prs-empty"');
    });

    it('shows an honest empty state by default (no fabricated PRs, authors, or counts)', () => {
      const html = renderToStaticMarkup(<QuantGitPrsSubView />);

      expect(html).toContain('data-testid="quantgit-prs-empty"');
      expect(html).toContain('No pull requests yet');
      expect(html).toContain('Open (0)');
      expect(html).not.toContain('astra-lead');
      expect(html).not.toContain('sarah-chen');
      expect(html).not.toContain('dev-sentinel');
      expect(html).not.toContain('PR #347');
    });
  });

  // ==========================================================================
  // 3. Sovereign Issue Tracker (`issues`)
  // ==========================================================================
  describe('3. Sovereign Issue Tracker (`issues`)', () => {
    it('renders provided issues with computed filter counts', () => {
      const html = renderToStaticMarkup(<QuantGitIssuesSubView issues={FIXTURE_ISSUES} />);

      expect(html).toContain('Issue #11: Fixture: verify empty states');
      expect(html).toContain('P1 High');
      expect(html).toContain('Open (1)');
      expect(html).toContain('Closed (1)');
      expect(html).not.toContain('data-testid="quantgit-issues-empty"');
    });

    it('shows an honest empty state by default (no fabricated issues or fake counts)', () => {
      const html = renderToStaticMarkup(<QuantGitIssuesSubView />);

      expect(html).toContain('data-testid="quantgit-issues-empty"');
      expect(html).toContain('No issues yet');
      expect(html).toContain('Open (0)');
      expect(html).toContain('Closed (0)');
      expect(html).not.toContain('Open (14)');
      expect(html).not.toContain('Closed (82)');
      expect(html).not.toContain('linus-dev');
    });
  });

  // ==========================================================================
  // 4. CI/CD Pipeline Streaming View (`actions`)
  // ==========================================================================
  describe('4. CI/CD Pipeline Streaming View (`actions`)', () => {
    it('renders provided workflow runs', () => {
      const html = renderToStaticMarkup(<QuantGitActionsSubView workflows={FIXTURE_WORKFLOWS} />);

      expect(html).toContain('Fixture CI Gate');
      expect(html).toContain('3m 20s');
      expect(html).toContain('abcdef12');
      expect(html).toContain('lint: pass');
      expect(html).toContain('ALL GATES PASSING');
    });

    it('shows an honest empty state by default (no fabricated CI runs)', () => {
      const html = renderToStaticMarkup(<QuantGitActionsSubView />);

      expect(html).toContain('data-testid="quantgit-actions-empty"');
      expect(html).toContain('No pipeline runs yet');
      expect(html).not.toContain('ALL GATES PASSING');
      expect(html).not.toContain('Master CI Gate on main');
      expect(html).not.toContain('d7192416');
    });
  });

  // ==========================================================================
  // 5. In-Repo Quanty AI Copilot Interactive Panel (`copilot`)
  // ==========================================================================
  describe('5. In-Repo Quanty AI Copilot Interactive Panel (`copilot`)', () => {
    it('renders without claiming fabricated PRs or scan results', () => {
      const html = renderToStaticMarkup(<QuantGitCopilotSubView />);

      expect(html).toContain('Quanty AI In-Repo Copilot');
      expect(html).toContain('Send');
      expect(html).not.toContain('indexed PR #347');
      expect(html).not.toContain('PR #347 diffs');
    });
  });

  // ==========================================================================
  // 6. Master Context Sub-Views Coordinator Synchronization
  // ==========================================================================
  describe('6. Master Sub-Views Container (`QuantGitSubViews`)', () => {
    const tabs: ContextSubViewTab[] = ['feed', 'repos', 'prs', 'issues', 'actions', 'copilot'];

    tabs.forEach((tab) => {
      it(`renders correctly when tab="${tab}" is active`, () => {
        const html = renderToStaticMarkup(<QuantGitSubViews activeTab={tab} />);

        expect(html).toContain('data-testid="quantgit-subviews-container"');

        if (tab === 'feed') {
          expect(html).toContain('data-testid="quantgit-feed-subview"');
          expect(html).toContain('data-testid="quantgit-feed-empty"');
          expect(html).toContain('No activity yet');
          expect(html).not.toContain('data-testid="quantgit-repos-subview"');
        } else if (tab === 'repos') {
          expect(html).toContain('data-testid="quantgit-repos-subview"');
          // Honest empty state — no fabricated repos when none provided
          expect(html).toContain('data-testid="quantgit-repos-empty"');
          expect(html).toContain('No repositories yet');
          expect(html).not.toContain('quant-ecosystem');
        } else if (tab === 'prs') {
          expect(html).toContain('data-testid="quantgit-prs-subview"');
          expect(html).toContain('data-testid="quantgit-prs-empty"');
          expect(html).not.toContain('PR #347');
        } else if (tab === 'issues') {
          expect(html).toContain('data-testid="quantgit-issues-subview"');
          expect(html).toContain('data-testid="quantgit-issues-empty"');
          expect(html).not.toContain('Issue #89');
        } else if (tab === 'actions') {
          expect(html).toContain('data-testid="quantgit-actions-subview"');
          expect(html).toContain('data-testid="quantgit-actions-empty"');
          expect(html).not.toContain('Master CI Gate on main');
        } else if (tab === 'copilot') {
          expect(html).toContain('data-testid="quantgit-copilot-subview"');
          expect(html).not.toContain('Explain PR #347');
        }
      });
    });

    it('defaults to repos subview when activeTab is unspecified', () => {
      const html = renderToStaticMarkup(<QuantGitSubViews />);

      expect(html).toContain('data-testid="quantgit-repos-subview"');
      // Honest empty state — no fabricated repos
      expect(html).toContain('data-testid="quantgit-repos-empty"');
      expect(html).toContain('No repositories yet');
    });

    it('renders real repos when provided via props (no fakes needed)', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView repos={FIXTURE_REPOS} />);

      expect(html).toContain('data-testid="quantgit-repos-subview"');
      expect(html).toContain('test-repo-alpha');
      expect(html).not.toContain('data-testid="quantgit-repos-empty"');
    });
  });
});
