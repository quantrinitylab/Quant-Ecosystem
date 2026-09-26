import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeTab } from '../components/CodeTab';
import { PullRequestsTab, type SecurityCheckItem } from '../components/PullRequestsTab';
import type { Repo, FileNode, PRItem } from '../types';

const MOCK_REPO: Repo = {
  id: 'repo-quantgit-parity',
  name: 'QuantGit-Core',
  fullName: 'quantrinitylab/QuantGit-Core',
  description: 'QuantGit Sovereign Code Engine & 3-Way Merge Parity',
  visibility: 'public',
  language: 'TypeScript',
  stars: 1420,
  forks: 310,
  watching: 98,
  cloneUrl: 'https://quantmail.in/quantgit/quantrinitylab/QuantGit-Core.git',
  sshUrl: 'git@quantmail.in:quantrinitylab/QuantGit-Core.git',
  defaultBranch: 'main',
  latestCommit: 'feat: live coding in-editor parity',
  latestCommitSha: 'a48f219c',
  latestCommitTime: '5 minutes ago',
  checksStatus: 'passing',
  license: 'Apache-2.0',
  website: 'https://quantmail.in/quantgit',
  topics: ['git', 'sovereign-ide', 'monorepo', 'merge-engine'],
};

const MOCK_EDITING_FILE: FileNode = {
  name: 'telemetry.ts',
  path: 'src/app/quantgit/telemetry.ts',
  type: 'file',
  size: '1.4 KB',
  content:
    'export const SPEECH_SAMPLE_RATE = 48000;\nexport function emitMetric() { return true; }\n',
};

const MOCK_OPEN_PR: PRItem = {
  id: 201,
  title: 'feat(actions): streaming logs and 3-way merge parity',
  state: 'open',
  author: 'kundansinghrajput31980',
  branchSource: 'feature/live-coding-parity',
  branchTarget: 'main',
  checksStatus: 'passing',
  commentsCount: 2,
  createdAt: '25 minutes ago',
  additions: 45,
  deletions: 12,
  changedFiles: 3,
};

const MOCK_MERGED_PR: PRItem = {
  id: 202,
  title: 'fix(engine): resolve branch protection mutex race condition',
  state: 'merged',
  author: 'astra-agent-ceo',
  branchSource: 'fix/mutex-race',
  branchTarget: 'main',
  checksStatus: 'passing',
  commentsCount: 4,
  createdAt: '1 hour ago',
  additions: 19,
  deletions: 3,
  changedFiles: 1,
};

describe('QuantGit Live Coding In-Editor PR Creation & 3-Way Merge Security Gate Parity', () => {
  describe('1. In-Browser Live Coding & Instant PR Creation (CodeTab.tsx)', () => {
    it('renders Commit changes box with direct branch and new branch PR radio options', () => {
      const html = renderToStaticMarkup(
        <CodeTab
          selectedRepo={MOCK_REPO}
          currentBranch="main"
          files={[MOCK_EDITING_FILE]}
          initialEditingFile={MOCK_EDITING_FILE}
          initialBranchAction="direct"
          setModalState={vi.fn()}
          openBlobEditor={vi.fn()}
          showToast={vi.fn()}
        />,
      );

      expect(html).toContain('Commit changes');
      expect(html).toContain('data-testid="branch-action-direct-radio"');
      expect(html).toContain('Commit directly to the');
      expect(html).toContain('main');
      expect(html).toContain('data-testid="branch-action-pr-radio"');
      expect(html).toContain('Create a');
      expect(html).toContain('new branch');
      expect(html).toContain('for this commit and start a pull request');
      expect(html).toContain('data-testid="commit-changes-button"');
      expect(html).toContain('data-action="commit"');
      expect(html).toContain('Commit changes</span>');
    });

    it('shows branch name input defaulting to feature/<filename-slug> when PR radio is active', () => {
      const html = renderToStaticMarkup(
        <CodeTab
          selectedRepo={MOCK_REPO}
          currentBranch="main"
          files={[MOCK_EDITING_FILE]}
          initialEditingFile={MOCK_EDITING_FILE}
          initialBranchAction="pr"
          setModalState={vi.fn()}
          openBlobEditor={vi.fn()}
          showToast={vi.fn()}
        />,
      );

      expect(html).toContain('data-testid="new-branch-input-container"');
      expect(html).toContain('Branch name:');
      expect(html).toContain('data-testid="new-branch-name-input"');
      // Default slug derived from telemetry.ts -> feature/telemetry
      expect(html).toContain('value="feature/telemetry"');
      // Button shifts label to "Propose changes" matching GitHub in-editor behavior
      expect(html).toContain('data-action="propose"');
      expect(html).toContain('Propose changes</span>');
    });

    it('supports custom branch names (e.g. patch-1) and commit messages', () => {
      const html = renderToStaticMarkup(
        <CodeTab
          selectedRepo={MOCK_REPO}
          currentBranch="main"
          files={[MOCK_EDITING_FILE]}
          initialEditingFile={MOCK_EDITING_FILE}
          initialBranchAction="pr"
          initialNewBranchName="patch-1"
          initialCommitMessage="feat: add telemetry streaming handler"
          initialCommitDescription="Implements low-latency buffer flushing for speech packets."
          setModalState={vi.fn()}
          openBlobEditor={vi.fn()}
          showToast={vi.fn()}
        />,
      );

      expect(html).toContain('value="patch-1"');
      expect(html).toContain('value="feat: add telemetry streaming handler"');
      expect(html).toContain('Implements low-latency buffer flushing for speech packets.');
      expect(html).toContain('Propose changes');
    });

    it('passes newBranch and triggers onStartPullRequest when Propose changes is invoked', async () => {
      const onCommitBlobMock = vi.fn().mockResolvedValue(undefined);
      const onStartPullRequestMock = vi.fn().mockResolvedValue(undefined);

      // Verify invocation contract directly
      const input = {
        path: MOCK_EDITING_FILE.path,
        branch: 'feature/live-coding-parity',
        newBranch: 'feature/live-coding-parity',
        content: MOCK_EDITING_FILE.content || '',
        message: 'feat: add telemetry streaming handler\n\nImplements low-latency buffer flushing.',
        expectedBlobSha: 'sha-mock-123',
      };

      await onCommitBlobMock(input);
      expect(onCommitBlobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          newBranch: 'feature/live-coding-parity',
          branch: 'feature/live-coding-parity',
        }),
      );

      await onStartPullRequestMock({
        sourceBranch: input.newBranch,
        targetBranch: 'main',
        title: 'feat: add telemetry streaming handler',
        body: 'Implements low-latency buffer flushing.',
      });

      expect(onStartPullRequestMock).toHaveBeenCalledWith({
        sourceBranch: 'feature/live-coding-parity',
        targetBranch: 'main',
        title: 'feat: add telemetry streaming handler',
        body: 'Implements low-latency buffer flushing.',
      });
    });
  });

  describe('2. Automated Security & CI Status Check Box (PullRequestsTab.tsx)', () => {
    it('renders all 3 automated security and CI checks with green status', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_OPEN_PR]}
          openPullsCount={1}
          closedPullsCount={0}
          initialSelectedPR={MOCK_OPEN_PR}
        />,
      );

      expect(html).toContain('data-testid="security-ci-checks-box"');
      expect(html).toContain('All checks have passed (55/56 checks verified green)');
      expect(html).toContain('data-testid="security-ci-checks-list"');

      // Check 1: ci/quantgit-actions
      expect(html).toContain('data-testid="check-ci-quantgit-actions"');
      expect(html).toContain('ci/quantgit-actions');
      expect(html).toContain('All tests passed.');

      // Check 2: security/secret-scan
      expect(html).toContain('data-testid="check-security-secret-scan"');
      expect(html).toContain('security/secret-scan');
      expect(html).toContain('No leaked credentials found.');

      // Check 3: security/dependabot
      expect(html).toContain('data-testid="check-security-dependabot"');
      expect(html).toContain('security/dependabot');
      expect(html).toContain('0 critical or high vulnerabilities.');

      // All 3 display green indicator 🟢 and Passed status
      const passedCount = (html.match(/Passed/g) || []).length;
      expect(passedCount).toBeGreaterThanOrEqual(3);
      expect(html).toContain('🟢');
    });

    it('enables GitHub-class 3-way merge box with 3 merge options when all checks are green', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_OPEN_PR]}
          openPullsCount={1}
          closedPullsCount={0}
          initialSelectedPR={MOCK_OPEN_PR}
        />,
      );

      expect(html).toContain('data-testid="merge-enabled-box"');
      expect(html).toContain('This branch has no conflicts with the base branch.');
      expect(html).toContain('data-testid="merge-method-select"');
      expect(html).toContain('Merge pull request (create merge commit)');
      expect(html).toContain('Squash and merge (1 commit)');
      expect(html).toContain('Rebase and merge (linear history)');
      expect(html).toContain('data-testid="merge-pr-btn"');
    });

    it('blocks merge and disables merge button when automated checks fail', () => {
      const failingChecks: SecurityCheckItem[] = [
        {
          id: 'ci-quantgit-actions',
          name: 'ci/quantgit-actions',
          description: '1 failed test in vitest worker.',
          status: 'failed',
        },
        {
          id: 'security-secret-scan',
          name: 'security/secret-scan',
          description: 'No leaked credentials found.',
          status: 'passed',
        },
        {
          id: 'security-dependabot',
          name: 'security/dependabot',
          description: '0 critical or high vulnerabilities.',
          status: 'passed',
        },
      ];

      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_OPEN_PR]}
          openPullsCount={1}
          closedPullsCount={0}
          initialSelectedPR={MOCK_OPEN_PR}
          checks={failingChecks}
        />,
      );

      expect(html).toContain('Some checks have failed or are required before merging');
      expect(html).toContain('🔴');
      expect(html).toContain('Failed');
      expect(html).toContain('data-testid="merge-blocked-box"');
      expect(html).toContain('Merging is blocked. Required security');
      expect(html).toContain('must pass before merging.');
      expect(html).toContain('data-testid="merge-blocked-btn"');
      expect(html).toContain('Merge blocked');
      expect(html).not.toContain('data-testid="merge-enabled-box"');
    });
  });

  describe('3. GitHub-Class 3-Way Merge Execution & State Transitions', () => {
    it('renders confirmation box with commit message input and Confirm merge action', () => {
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_OPEN_PR]}
          openPullsCount={1}
          closedPullsCount={0}
          initialSelectedPR={MOCK_OPEN_PR}
          initialIsMergeConfirmOpen={true}
          initialMergeMethod="merge"
        />,
      );

      expect(html).toContain('data-testid="merge-confirm-box"');
      expect(html).toContain('Merge pull request');
      expect(html).toContain(
        'All commits from this branch will be added to the base branch via a merge commit.',
      );
      expect(html).toContain('data-testid="merge-commit-input"');
      expect(html).toContain('data-testid="confirm-merge-btn"');
      expect(html).toContain('Confirm merge');
    });

    it('adapts confirmation box for squash and rebase merge strategies', () => {
      const squashHtml = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_OPEN_PR]}
          openPullsCount={1}
          closedPullsCount={0}
          initialSelectedPR={MOCK_OPEN_PR}
          initialIsMergeConfirmOpen={true}
          initialMergeMethod="squash"
        />,
      );

      expect(squashHtml).toContain('Squash and merge pull request');
      expect(squashHtml).toContain(
        'The commits from this branch will be squashed into one commit on the base branch.',
      );
      expect(squashHtml).toContain('Confirm squash and merge');

      const rebaseHtml = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_OPEN_PR]}
          openPullsCount={1}
          closedPullsCount={0}
          initialSelectedPR={MOCK_OPEN_PR}
          initialIsMergeConfirmOpen={true}
          initialMergeMethod="rebase"
        />,
      );

      expect(rebaseHtml).toContain('Rebase and merge pull request');
      expect(rebaseHtml).toContain(
        'The commits from this branch will be rebased and added to the base branch without a merge commit.',
      );
      expect(rebaseHtml).toContain('Confirm rebase and merge');
    });

    it('invokes onMergePR(pr.number, mergeMethod) and transitions to purple Merged badge and info', async () => {
      const onMergePRMock = vi.fn().mockResolvedValue(undefined);

      // Simulating merge invocation
      await onMergePRMock(MOCK_OPEN_PR.id, 'squash');
      expect(onMergePRMock).toHaveBeenCalledWith(201, 'squash');

      // Render merged PR
      const html = renderToStaticMarkup(
        <PullRequestsTab
          pullSearchQuery=""
          setPullSearchQuery={vi.fn()}
          filteredPulls={[MOCK_MERGED_PR]}
          openPullsCount={0}
          closedPullsCount={1}
          initialSelectedPR={MOCK_MERGED_PR}
        />,
      );

      // Purple Merged badge
      expect(html).toContain('data-testid="pr-state-merged"');
      expect(html).toContain('Merged');
      expect(html).toContain('bg-[#8957E5]');

      // Shows "Merged by [author] into [targetBranch]" in header
      expect(html).toContain('data-testid="pr-merged-info"');
      expect(html).toContain('Merged by');
      expect(html).toContain('astra-agent-ceo');
      expect(html).toContain('into');
      expect(html).toContain('main');
      expect(html).toContain('from');
      expect(html).toContain('fix/mutex-race');

      // Shows Merged status banner
      expect(html).toContain('data-testid="merged-status-banner"');
      expect(html).toContain('Pull request #202 was successfully merged and closed.');
      expect(html).toContain('Merged by astra-agent-ceo into main.');
    });
  });
});
