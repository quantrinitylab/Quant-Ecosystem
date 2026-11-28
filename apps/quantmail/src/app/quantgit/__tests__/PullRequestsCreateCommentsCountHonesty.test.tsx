import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM-FIX — QuantGit PR create handlers must never invent comment counts.
 *
 * Regression: the backend PR endpoints were fixed to return the real
 * review-comment count (or null when unknown), and the PR list mapping
 * passes it through honestly — but both PR-creation handlers in page.tsx
 * (`handleCreatePR` and `handleStartPullRequest`) still built their local
 * row with a hardcoded `commentsCount: 0`, discarding the server value.
 * That matters on the idempotent dedup path: the backend returns an
 * already-open PR that may already have discussion, and the row then
 * claimed "0 comments" despite real review comments existing.
 *
 * Contract pinned here:
 * 1. Neither create handler hardcodes `commentsCount: 0` in its local row.
 * 2. Both pass the server value through: `item.commentsCount ?? null`
 *    (null = unknown, rendered as '—' by PullRequestsTab — never an
 *    invented 0), matching the diff-stats passthrough convention.
 */

const QUANTGIT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGE = path.join(QUANTGIT_ROOT, 'page.tsx');

function readSource(p: string): string {
  return readFileSync(p, 'utf8');
}

function handlerBody(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('QuantGit PR create handlers pass through the real comment count', () => {
  const page = readSource(PAGE);
  const createPr = handlerBody(
    page,
    'const handleCreatePR = async',
    'const handleStartPullRequest = useCallback(',
  );
  const startPr = handlerBody(
    page,
    'const handleStartPullRequest = useCallback(',
    'const handleCreateRepo = async',
  );

  it.each([
    ['handleCreatePR', createPr],
    ['handleStartPullRequest', startPr],
  ])('%s does not hardcode commentsCount: 0 in its local row', (_name, body) => {
    expect(body).not.toMatch(/commentsCount:\s*0\b/);
  });

  it.each([
    ['handleCreatePR', createPr],
    ['handleStartPullRequest', startPr],
  ])('%s passes the server comment count through (null when unknown)', (_name, body) => {
    expect(body).toContain('commentsCount: item.commentsCount ?? null');
  });
});
