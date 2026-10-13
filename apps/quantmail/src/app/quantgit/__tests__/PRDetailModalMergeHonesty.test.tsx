// @vitest-environment jsdom

// Silence React's "not configured to support act" warning in this jsdom
// harness — act() flushes effects synchronously here by design.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, waitFor } from '@testing-library/react';

// The modal hits the same-origin Next proxy via @quant/api-client.
// Stub it so the mergeable pre-check outcomes are controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@quant/api-client';
import {
  QuantGitModals,
  PRDetailMergeActionBox,
  fetchPRDetailMergeable,
  mergeBlockedByConflict,
  type QuantGitModalsProps,
} from '../components/QuantGitModals';
import type { PRItem } from '../types';

/**
 * Regression proof for the PR-detail modal unverified-conflict-claim finding
 * (fix/qm-modal-no-conflicts): the modal reachable via setModalState('pr-detail')
 * must NEVER render "This branch has no conflicts with the base branch."
 * from client-side guesswork. That sentence may appear ONLY after the backend
 * dry-run (GET /:id/pulls/:number/mergeable) reports mergeable === true, and
 * a detected conflict must block the merge button.
 */

const MOCK_PR: PRItem = {
  id: 777,
  title: 'fix: honest pr-detail merge box',
  state: 'open',
  author: 'tester',
  branchSource: 'fix/modal-no-conflicts',
  branchTarget: 'main',
  checksStatus: 'unknown',
  commentsCount: 0,
  createdAt: '2 minutes ago',
  additions: 4,
  deletions: 2,
  changedFiles: 1,
};

const MOCK_REPO = {
  id: 'quant-ecosystem',
  name: 'quant-ecosystem',
  fullName: 'quantrinitylab/quant-ecosystem',
  description: '',
  visibility: 'private' as const,
  language: 'TypeScript',
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
  website: '',
  topics: [],
};

const NO_CONFLICT_CLAIM = 'This branch has no conflicts with the base branch.';

function modalProps(): QuantGitModalsProps {
  return {
    modalState: 'pr-detail',
    setModalState: vi.fn(),
    newBranchInput: '',
    setNewBranchInput: vi.fn(),
    repoBranches: [],
    currentBranch: 'main',
    setCurrentBranch: vi.fn(),
    handleCreateBranch: vi.fn(),
    fileSearchQuery: '',
    setFileSearchQuery: vi.fn(),
    filteredFiles: [],
    setViewingFile: vi.fn(),
    viewingFile: null,
    selectedRepo: MOCK_REPO,
    viewingBlobSha: null,
    closeBlobEditor: vi.fn(),
    handleCommitBlob: vi.fn(),
    selectedOfficeAgent: null,
    setSelectedOfficeAgent: vi.fn(),
    newIssueTitle: '',
    setNewIssueTitle: vi.fn(),
    newIssueBody: '',
    setNewIssueBody: vi.fn(),
    newIssueLabel: '',
    setNewIssueLabel: vi.fn(),
    handleCreateIssue: vi.fn(),
    newPrBranch: '',
    newPrTitle: '',
    setNewPrTitle: vi.fn(),
    newPrBody: '',
    setNewPrBody: vi.fn(),
    handleCreatePR: vi.fn(),
    newRepoName: '',
    setNewRepoName: vi.fn(),
    newRepoDesc: '',
    setNewRepoDesc: vi.fn(),
    newRepoVisibility: 'private',
    setNewRepoVisibility: vi.fn(),
    handleCreateRepo: vi.fn(),
    newAgentName: '',
    setNewAgentName: vi.fn(),
    newAgentRole: '',
    setNewAgentRole: vi.fn(),
    newAgentPod: '',
    setNewAgentPod: vi.fn(),
    handleDeployAgent: vi.fn(),
    selectedActionRun: null,
    selectedPr: MOCK_PR,
    closePullDetail: vi.fn(),
    handleMergePR: vi.fn(),
    selectedIssue: null,
    closeIssueDetail: vi.fn(),
    issueComments: [],
    isLoadingComments: false,
    commentError: null,
    commentDraft: '',
    setCommentDraft: vi.fn(),
    handleSubmitIssueComment: vi.fn(),
    isSubmittingComment: false,
    handleToggleIssue: vi.fn(),
    currentUsername: 'tester',
    isPersonalizeOpen: false,
    setIsPersonalizeOpen: vi.fn(),
    selectedAccessory: 'none' as never,
    setSelectedAccessory: vi.fn(),
    quantyName: '',
    setQuantyName: vi.fn(),
    quantyInstructions: '',
    setQuantyInstructions: vi.fn(),
    showToast: vi.fn(),
  };
}

// apiFetch envelope: { success, data } — never throws on HTTP errors.
const mergeableEnvelope = (data: unknown) => ({
  success: true,
  data,
  error: undefined,
});

describe('pr-detail modal — no unverified no-conflict claim', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('first paint shows "Checking for merge conflicts…" instead of the claim', () => {
    // renderToStaticMarkup does not run effects, so the mergeable fetch never
    // fires: this is exactly the first-paint state a user sees.
    const html = renderToStaticMarkup(<QuantGitModals {...modalProps()} />);
    expect(html).toContain('pr-detail-merge-box');
    expect(html).toContain('Checking for merge conflicts…');
    expect(html).not.toContain(NO_CONFLICT_CLAIM);
  });

  it('the merge button is enabled while the check is pending', () => {
    const html = renderToStaticMarkup(<QuantGitModals {...modalProps()} />);
    expect(html).toContain('Merge pull request');
    // The button carries Tailwind `disabled:*` variant classes, so assert on
    // the disabled *attribute* (followed by space, = or >) rather than the
    // substring.
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:[\s=>]|$)/);
  });
});

describe('fetchPRDetailMergeable — honest 4-state mapping', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('hits the mergeable dry-run endpoint for the right repo/PR', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mergeableEnvelope({ mergeable: true }) as never);
    await fetchPRDetailMergeable('quant-ecosystem', 777);
    expect(apiFetch).toHaveBeenCalledWith('/api/repos/quant-ecosystem/pulls/777/mergeable');
  });

  it('mergeable:true → mergeable (only state where the claim is allowed)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mergeableEnvelope({ mergeable: true }) as never);
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({ status: 'mergeable' });
  });

  it('mergeable:false → conflict, with the conflicted files', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      mergeableEnvelope({ mergeable: false, conflicts: ['src/a.ts', 'src/b.ts'] }) as never,
    );
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({
      status: 'conflict',
      conflicts: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('mergeable:false with no conflicts array → conflict with empty list', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mergeableEnvelope({ mergeable: false }) as never);
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({
      status: 'conflict',
      conflicts: [],
    });
  });

  it('mergeable:null → unknown (claims neither outcome)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mergeableEnvelope({ mergeable: null }) as never);
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({ status: 'unknown' });
  });

  it('non-ok response → unknown', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      success: false,
      data: undefined,
      error: { code: 'REQUEST_FAILED', message: 'boom', statusCode: 500 },
    } as never);
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({ status: 'unknown' });
  });

  it('malformed body → unknown', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true, data: null, error: undefined } as never);
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({ status: 'unknown' });
  });

  it('network failure → unknown', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));
    expect(await fetchPRDetailMergeable('quant-ecosystem', 777)).toEqual({ status: 'unknown' });
  });
});

describe('mergeBlockedByConflict — only a real conflict blocks the merge', () => {
  it('conflict blocks', () => {
    expect(mergeBlockedByConflict({ status: 'conflict', conflicts: ['a.ts'] })).toBe(true);
  });

  it('checking / mergeable / unknown never block', () => {
    expect(mergeBlockedByConflict({ status: 'checking' })).toBe(false);
    expect(mergeBlockedByConflict({ status: 'mergeable' })).toBe(false);
    expect(mergeBlockedByConflict({ status: 'unknown' })).toBe(false);
  });
});

describe('PRDetailMergeActionBox — end-to-end states', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('verified clean: claim appears, merge button stays enabled', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mergeableEnvelope({ mergeable: true }) as never);
    render(
      <PRDetailMergeActionBox repoId="quant-ecosystem" pr={MOCK_PR} onMerge={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('merge-conflict-clean')).toBeDefined();
    });
    expect(screen.getByText(NO_CONFLICT_CLAIM)).toBeDefined();
    expect(screen.getByRole('button', { name: /merge pull request/i }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('conflict detected: names the conflict, lists files, disables merge', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      mergeableEnvelope({ mergeable: false, conflicts: ['src/x.ts'] }) as never,
    );
    render(
      <PRDetailMergeActionBox repoId="quant-ecosystem" pr={MOCK_PR} onMerge={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('merge-conflict-detected')).toBeDefined();
    });
    expect(screen.getByText(/has conflicts with the base branch/)).toBeDefined();
    expect(screen.getByText('src/x.ts')).toBeDefined();
    expect(screen.getByRole('button', { name: /merge pull request/i }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByText(NO_CONFLICT_CLAIM)).toBeNull();
  });

  it('unknown: admits the check is unavailable, claims neither outcome, merge not blocked', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    render(
      <PRDetailMergeActionBox repoId="quant-ecosystem" pr={MOCK_PR} onMerge={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('merge-conflict-unknown')).toBeDefined();
    });
    expect(screen.getByText(/Merge-conflict status is unknown/)).toBeDefined();
    expect(screen.queryByText(NO_CONFLICT_CLAIM)).toBeNull();
    expect(screen.getByRole('button', { name: /merge pull request/i }).hasAttribute('disabled')).toBe(
      false,
    );
  });
});
