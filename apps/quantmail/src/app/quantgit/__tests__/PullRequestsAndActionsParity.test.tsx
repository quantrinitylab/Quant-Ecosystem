import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PullRequestsTab } from '../components/PullRequestsTab';
import { ActionsTab } from '../components/ActionsTab';
import type { PRItem, WorkflowRunItem } from '../types';

const MOCK_PRS: PRItem[] = [
  {
    id: 101,
    title: 'feat: add real-time speech telemetry streaming',
    state: 'open',
    author: 'kundansinghrajput31980',
    branchSource: 'feat/speech-telemetry',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 3,
    createdAt: '2 hours ago',
    additions: 24,
    deletions: 5,
    changedFiles: 2,
    body: 'Implements live speech telemetry with 3-way merge parity.',
  },
  {
    id: 102,
    title: 'fix: resolve race condition in ci runner job allocation',
    state: 'merged',
    author: 'edward0127',
    branchSource: 'fix/ci-alloc',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 1,
    createdAt: 'Yesterday',
    additions: 12,
    deletions: 2,
    changedFiles: 1,
  },
];

const MOCK_RUNS: WorkflowRunItem[] = [
  {
    id: 'run-901',
    name: 'CI Pipeline & Vitest QA Sentinel',
    workflow: 'CI',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: '948e3612',
    duration: '42s',
    timeAgo: '10 minutes ago',
    createdAt: 'Today at 3:11 PM',
    actor: 'ai-sdk-factory[bot]',
    jobs: [
      { name: 'gate', status: 'success', duration: '3m 33s' },
      { name: 'CodeQL', status: 'success', duration: '1m 12s' },
    ],
  },
  {
    id: 'run-902',
    name: 'Slack Failure Alert Workflow',
    workflow: 'CI',
    status: 'failed',
    branch: 'feat/speech-telemetry',
    event: 'pull_request',
    commitSha: '8910bcae',
    duration: '9s',
    timeAgo: '15 minutes ago',
    createdAt: 'Today at 3:07 PM',
    actor: 'edward0127',
    jobs: [{ name: 'test', status: 'failed', duration: '9s' }],
  },
  {
    id: 'run-903',
    name: 'Background Worker Deploy',
    workflow: 'Release',
    status: 'in_progress',
    branch: 'main',
    event: 'workflow_dispatch',
    commitSha: '417b018e',
    duration: '15s',
    timeAgo: '1 minute ago',
    createdAt: 'Today at 3:15 PM',
    actor: 'kundansinghrajput31980',
    jobs: [],
  },
  {
    id: 'run-904',
    name: 'Scheduled Security Scanner',
    workflow: 'Release',
    status: 'queued',
    branch: 'main',
    event: 'schedule',
    commitSha: '11223344',
    duration: '0s',
    timeAgo: 'Just now',
    createdAt: 'Today at 3:16 PM',
    actor: 'system',
    jobs: [],
  },
];

describe('QuantGit GitHub Sovereign Parity: PR 3-Way Merge & Actions Streaming Logs', () => {
  describe('PullRequestsTab (Task W39-GIT06)', () => {
    it('renders PR list view with search filter, open/closed counts, and PR items', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery="is:pr state:open"
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          setModalState={vi.fn()}
          openPullDetail={vi.fn()}
        />,
      );

      expect(html).toContain('data-testid="pull-requests-tab"');
      expect(html).toContain('data-testid="pr-list-view"');
      expect(html).toContain('data-testid="pull-search-input"');
      expect(html).toContain('1 Open');
      expect(html).toContain('1 Closed');
      expect(html).toContain('feat: add real-time speech telemetry streaming');
      expect(html).toContain('fix: resolve race condition in ci runner job allocation');
      expect(html).toContain('New pull request');
    });

    it('renders PR details view with interactive Diff Viewer showing additions and deletions', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          initialSelectedPR={MOCK_PRS[0]}
        />,
      );

      expect(html).toContain('data-testid="pr-detail-view"');
      expect(html).toContain('feat: add real-time speech telemetry streaming');
      expect(html).toContain('#101');
      expect(html).toContain('+24');
      expect(html).toContain('-5');
      expect(html).toContain('data-testid="diff-viewer"');
      expect(html).toContain('Files changed (2)');
      expect(html).toContain('apps/quantmail/src/app/quantgit/telemetry.ts');
      expect(html).toContain('apps/quantmail/src/app/quantgit/components/SpeechSynthesizer.tsx');

      // Verify additions (green) and deletions (red)
      expect(html).toContain('+export const TELEMETRY_SAMPLE_RATE = 1.0;');
      expect(html).toContain('+export function recordSpeechMetric(event: SpeechEvent): void;');
      expect(html).toContain('-const legacyRecordingEnabled = false;');
      expect(html).toContain('-function sendLegacyTelemetry(): void {}');
    });

    it('renders hunk headers, line numbers, and unified vs split view modes', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          initialSelectedPR={MOCK_PRS[0]}
        />,
      );

      expect(html).toContain('@@ -14,8 +14,21 @@ export interface SpeechTelemetryConfig');
      expect(html).toContain('data-testid="diff-mode-unified"');
      expect(html).toContain('data-testid="diff-mode-split"');
      expect(html).toContain('Unified');
      expect(html).toContain('Split');
    });

    it('renders inline review comments and "+ Add comment" hover triggers on diff lines', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          initialSelectedPR={MOCK_PRS[0]}
        />,
      );

      // Verify line comment buttons and existing comment by edward0127
      expect(html).toContain('Add comment');
      expect(html).toContain('data-testid="add-comment-btn-diff-1-l6"');
      expect(html).toContain('data-testid="diff-comment-c-1"');
      expect(html).toContain('edward0127');
      expect(html).toContain(
        'Make sure speech metric telemetry handles zero-latency web socket disconnects.',
      );
    });

    it('enforces Author Restriction in Review Decision Box (author cannot approve own PR)', () => {
      // Current user is the author of PR #101 ('kundansinghrajput31980')
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          currentUsername="kundansinghrajput31980"
          initialSelectedPR={MOCK_PRS[0]}
        />,
      );

      expect(html).toContain('data-testid="review-changes-btn"');
      expect(html).toContain('Review changes');
      expect(html).toContain('All checks have passed (55/56 checks verified green)');
      expect(html).toContain('Review decisions:');
      expect(html).toContain('ai-sdk-factory[bot]');
      expect(html).toContain('✓ Approved');
    });

    it('renders Merge Box with 3 merge options (merge, squash, rebase) and conflict detection', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          initialSelectedPR={MOCK_PRS[0]}
        />,
      );

      expect(html).toContain('This branch has no conflicts with the base branch.');
      expect(html).toContain('data-testid="merge-method-select"');
      expect(html).toContain('Merge pull request (create merge commit)');
      expect(html).toContain('Squash and merge (1 commit)');
      expect(html).toContain('Rebase and merge (linear history)');
      expect(html).toContain('data-testid="merge-pr-btn"');
    });

    it('renders purple badge and merged status banner when PR is merged', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={MOCK_PRS}
          openPullsCount={1}
          closedPullsCount={1}
          initialSelectedPR={MOCK_PRS[1]} // PR #102 is 'merged'
        />,
      );

      expect(html).toContain('data-testid="pr-state-merged"');
      expect(html).toContain('Merged');
      expect(html).toContain('bg-[#8957E5]');
      expect(html).toContain('data-testid="merged-status-banner"');
      expect(html).toContain('Pull request #102 was successfully merged and closed.');
    });
  });

  describe('ActionsTab Live Streaming Logs (Task W39-GIT07)', () => {
    it('renders actions workflows sidebar, search filter, and workflow runs list', () => {
      const html = renderToStaticMarkup(
        <ActionsTab
          actions={MOCK_RUNS}
          handleTriggerWorkflow={vi.fn()}
          setSelectedActionRun={vi.fn()}
        />,
      );

      expect(html).toContain('data-testid="actions-tab"');
      expect(html).toContain('Workflows');
      expect(html).toContain('CI');
      expect(html).toContain('Copilot');
      expect(html).toContain('Release');
      expect(html).toContain('data-testid="actions-search-input"');
      expect(html).toContain('data-testid="run-workflow-btn"');
      expect(html).toContain('Run workflow');
      expect(html).toContain('data-testid="workflow-runs-list"');
      expect(html).toContain('CI Pipeline &amp; Vitest QA Sentinel');
      expect(html).toContain('Slack Failure Alert Workflow');
    });

    it('renders step-by-step live terminal streaming log viewer with all 5 accordion steps', () => {
      const html = renderToStaticMarkup(
        <ActionsTab
          actions={MOCK_RUNS}
          handleTriggerWorkflow={vi.fn()}
          setSelectedActionRun={vi.fn()}
          initialSelectedRun={MOCK_RUNS[0]}
        />,
      );

      expect(html).toContain('data-testid="workflow-run-detail"');
      expect(html).toContain('data-testid="back-to-runs-btn"');
      expect(html).toContain('CI Pipeline &amp; Vitest QA Sentinel');
      expect(html).toContain('#run-901');

      // Verify all 5 workflow steps
      expect(html).toContain('data-testid="step-accordion-step-1"');
      expect(html).toContain('Set up job');
      expect(html).toContain('data-testid="step-accordion-step-2"');
      expect(html).toContain('Run actions/checkout@v4');
      expect(html).toContain('data-testid="step-accordion-step-3"');
      expect(html).toContain('Run pnpm install');
      expect(html).toContain('data-testid="step-accordion-step-4"');
      expect(html).toContain('Run test suite');
      expect(html).toContain('data-testid="step-accordion-step-5"');
      expect(html).toContain('Complete job');
    });

    it('expands step terminal output with line numbers, duration, and ANSI log styling', () => {
      const html = renderToStaticMarkup(
        <ActionsTab
          actions={MOCK_RUNS}
          handleTriggerWorkflow={vi.fn()}
          setSelectedActionRun={vi.fn()}
          initialSelectedRun={MOCK_RUNS[0]}
        />,
      );

      // Step 4 (Run test suite) is expanded by default
      expect(html).toContain('data-testid="terminal-logs-step-4"');
      expect(html).toContain('42s');
      expect(html).toContain('RUN v4.1.11 /home/runner/work/Quant-Ecosystem/apps/quantmail');
      expect(html).toContain('GitHubSovereignParity.test.tsx');
      expect(html).toContain('All test suites verified green in 42.1s');
      expect(html).toContain('text-[#3FB950]'); // Green styling
    });

    it('displays error highlights in logs when workflow run is failed', () => {
      const html = renderToStaticMarkup(
        <ActionsTab
          actions={MOCK_RUNS}
          handleTriggerWorkflow={vi.fn()}
          setSelectedActionRun={vi.fn()}
          initialSelectedRun={MOCK_RUNS[1]} // run-902 is failed
        />,
      );

      expect(html).toContain('data-testid="workflow-status-badge"');
      expect(html).toContain('failed');
      expect(html).toContain('data-testid="terminal-logs-step-4"');
      expect(html).toContain('✕ src/app/quantgit/telemetry.test.ts (1 failed, 4 passed)');
      expect(html).toContain('FAIL src/app/quantgit/telemetry.test.ts');
      expect(html).toContain('Command failed with exit code 1.');
      expect(html).toContain('text-[#F85149]'); // Red error styling
    });

    it('renders live monotonic log auto-scroll toggle and "Copy full logs" button', () => {
      const html = renderToStaticMarkup(
        <ActionsTab
          actions={MOCK_RUNS}
          handleTriggerWorkflow={vi.fn()}
          setSelectedActionRun={vi.fn()}
          initialSelectedRun={MOCK_RUNS[0]}
        />,
      );

      expect(html).toContain('data-testid="log-autoscroll-toggle"');
      expect(html).toContain('Auto-scroll: ON');
      expect(html).toContain('data-testid="copy-full-logs-btn"');
      expect(html).toContain('Copy full logs');
    });

    it('renders live workflow status badges for all run states (success, failed, in_progress, queued)', () => {
      const states: Array<{ run: WorkflowRunItem; expectedBadge: string; expectedColor: string }> =
        [
          { run: MOCK_RUNS[0], expectedBadge: 'success', expectedColor: 'text-[#3FB950]' },
          { run: MOCK_RUNS[1], expectedBadge: 'failed', expectedColor: 'text-[#F85149]' },
          { run: MOCK_RUNS[2], expectedBadge: 'in_progress', expectedColor: 'text-[#D29922]' },
          { run: MOCK_RUNS[3], expectedBadge: 'queued', expectedColor: 'text-[#8B949E]' },
        ];

      for (const item of states) {
        const html = renderToStaticMarkup(
          <ActionsTab
            actions={MOCK_RUNS}
            handleTriggerWorkflow={vi.fn()}
            setSelectedActionRun={vi.fn()}
            initialSelectedRun={item.run}
          />,
        );

        expect(html).toContain('data-testid="workflow-status-badge"');
        expect(html).toContain(item.expectedBadge);
        expect(html).toContain(item.expectedColor);
      }
    });
  });
});
