import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * fix/qm-commit-double-pr — commit-to-new-branch created the pull request
 * TWICE (PRs N and N+1 for one commit).
 *
 * Root cause: two creation call sites fired for the same user action —
 * `handleCommitBlob` in page.tsx created the PR whenever `input.newBranch`
 * was set, and the CodeTab commit modal ALSO created it via
 * `onStartPullRequest` right after `onCommitBlob` resolved. The second call
 * slipped past `handleStartPullRequest`'s local-state dedupe because React
 * state had not re-rendered between the two awaits.
 *
 * Contract pinned here (single creation site + backend idempotency):
 * 1. `handleCommitBlob` (page.tsx) must NOT invoke `handleStartPullRequest`
 *    or POST /pulls — it is a commit primitive, not a PR factory.
 * 2. The CodeTab commit modal remains the single PR-creation site: it calls
 *    `onStartPullRequest` after `onCommitBlob` when the user chose
 *    "commit to a new branch and start a pull request".
 * 3. `handleStartPullRequest` keeps its pre-POST local-state dedupe so a
 *    retried call reuses the already-open PR row instead of posting again.
 */

const QUANTGIT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGE = path.join(QUANTGIT_ROOT, 'page.tsx');
const CODETAB = path.join(QUANTGIT_ROOT, 'components', 'CodeTab.tsx');

function readSource(p: string): string {
  return readFileSync(p, 'utf8');
}

/** Extracts the `handleCommitBlob` callback body from page.tsx source. */
function handleCommitBlobBody(src: string): string {
  const startMarker = 'const handleCommitBlob = useCallback(';
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  // handleCommitBlob is immediately followed by the handleDeleteBlob
  // declaration — the region between is the full callback.
  const endMarker = 'const handleDeleteBlob = useCallback(';
  const end = src.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('commit-to-new-branch creates exactly one pull request', () => {
  const page = readSource(PAGE);
  const codetab = readSource(CODETAB);
  const commitBlob = handleCommitBlobBody(page);

  it('handleCommitBlob does not create pull requests — the modal is the single creation site', () => {
    // No PR creation call inside the commit primitive.
    expect(commitBlob).not.toContain('handleStartPullRequest(');
    expect(commitBlob).not.toContain('/pulls');
    // The stale comment about the removed block must not promise the old
    // behavior either.
    expect(commitBlob).not.toMatch(/create the PR here/i);
  });

  it('the CodeTab commit modal is the single PR-creation site after onCommitBlob', () => {
    // The modal commits first, then (only for the propose-PR branch action)
    // creates the pull request through the page-level handler.
    expect(codetab).toContain('await onCommitBlob({');
    expect(codetab).toContain('if (isNewBranchPR && onStartPullRequest && chosenNewBranch)');
    expect(codetab).toContain('await onStartPullRequest({');
  });

  it('handleStartPullRequest keeps its pre-POST local-state dedupe', () => {
    // Before posting, an already-open PR for the same source/target pair is
    // reused (navigated to) instead of creating another row.
    expect(page).toContain('p.branchSource === params.sourceBranch');
    expect(page).toContain("p.state === 'open'");
  });

  it('no second commit-to-new-branch PR path exists elsewhere in page.tsx', () => {
    // Exactly three /pulls endpoints are referenced in page.tsx:
    //   1. the PR list fetch (GET),
    //   2. the deliberate new-PR modal (handleCreatePR, POST),
    //   3. the shared handleStartPullRequest implementation (POST).
    // Any additional /pulls reference means a new creation path crept in —
    // the double-creation bug class this test guards against.
    const prRefs = page.match(/\/pulls['"`]/g) ?? [];
    expect(prRefs.length).toBe(3);
    const postCount = (page.match(/\/pulls`,\s*\{\s*\n?\s*method:\s*'POST'/g) ?? []).length;
    expect(postCount).toBe(2);
  });
});
