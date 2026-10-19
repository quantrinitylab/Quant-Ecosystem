import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommitsTab } from '../components/CommitsTab';
import { mapBackendCommitToItem } from '../components/mapBackendCommit';
import { INITIAL_REPOS } from '../constants';
import type { CommitItem } from '../types';

// Message/author-honesty regression suite: mapBackendCommitToItem used to map
// the backend payload with `message: c.message || 'Commit update'` and
// `author.name: c.author?.name || c.author || currentUsername` (plus
// `email: c.author?.email || \`${currentUsername}@quantmail.in\``). The commits
// endpoint (git-inspect.service.ts getCommits: sha/parents/author{name,email}/
// timestamp/message) may legitimately return rows with an empty message or no
// usable author — but the old mapper printed the invented text "Commit update"
// as the commit's real message and attributed EVERY author-less commit to the
// VIEWER (even fabricating a @quantmail.in email for them), pre-empting any
// honest rendering. Same invented-data defect family as the Branches tab's
// 'Update branch' fallback (fixed in mapBackendBranch.ts, see
// BranchAuthorHonesty.test.tsx).

const VIEWER = 'sahenoor';
const INVENTED_MESSAGE = 'Commit update';

function makeBackendCommit(overrides: Record<string, unknown> = {}) {
  // Real backend shape (git log --format=%H %P %an %ae %at %s rows).
  return {
    sha: 'a1b2c3d4e5f6000000000000000000000000000001',
    parents: [],
    author: { name: 'devone', email: 'devone@example.com' },
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    message: 'feat: ship the thing',
    ...overrides,
  };
}

function mappedItem(overrides: Record<string, unknown> = {}): CommitItem {
  return mapBackendCommitToItem(makeBackendCommit(overrides), VIEWER);
}

describe('mapBackendCommitToItem — no invented commit messages or authors', () => {
  it('degrades a message-less, author-less backend row to honest empties', () => {
    const item = mapBackendCommitToItem(
      { sha: 'b'.repeat(40), timestamp: Math.floor(Date.now() / 1000) - 60 },
      VIEWER,
    );
    expect(item.message).toBe('');
    expect(item.author.name).toBe('');
    expect(item.author.username).toBe('');
    expect(item.author.email).toBe('');
    expect(item.author.avatarUrl).toBe('');
    // The viewer's identity must never leak into the mapped item.
    const dumped = JSON.stringify(item);
    expect(dumped).not.toContain(VIEWER);
    expect(dumped).not.toContain(INVENTED_MESSAGE);
    expect(dumped).not.toContain('@quantmail.in');
  });

  it('never fabricates a @quantmail.in email or viewer attribution for a string author', () => {
    // The old `email: c.author?.email || `${currentUsername}@quantmail.in``
    // fallback fired on every row whose author had no email.
    const item = mappedItem({ author: { name: 'devone' } });
    expect(item.author.name).toBe('devone');
    expect(item.author.email).toBe('');
    expect(JSON.stringify(item)).not.toContain('@quantmail.in');
  });

  it('preserves a plain-string backend author honestly (no viewer fallback)', () => {
    const item = mappedItem({ author: 'devone' });
    expect(item.author.name).toBe('devone');
    expect(item.author.username).toBe('devone');
    expect(item.author.email).toBe('');
    // A string author must never become the viewer.
    expect(JSON.stringify(item)).not.toContain(VIEWER);
  });

  it('preserves real message and author fields verbatim when the backend provides them', () => {
    const item = mappedItem({
      message: 'fix: real commit',
      author: { name: 'devone', username: 'devone', email: 'devone@example.com', avatarUrl: 'https://x/y.png' },
    });
    expect(item.message).toBe('fix: real commit');
    expect(item.author.name).toBe('devone');
    expect(item.author.username).toBe('devone');
    expect(item.author.email).toBe('devone@example.com');
    expect(item.author.avatarUrl).toBe('https://x/y.png');
  });

  it('keeps an empty-string backend message as empty (never swaps in the invented text)', () => {
    const item = mappedItem({ message: '' });
    expect(item.message).toBe('');
  });

  it('never emits the username as an object (old `|| c.author` object leak)', () => {
    // The old `username: c.author?.username || c.author || currentUsername`
    // handed the whole author OBJECT through when username was absent.
    const item = mappedItem({ author: { name: 'devone', email: 'devone@example.com' } });
    expect(typeof item.author.username).toBe('string');
    expect(item.author.username).toBe('');
  });
});

describe('CommitsTab — commits tab never invents messages or authors', () => {
  const repo = INITIAL_REPOS[0];

  it('renders honest "No message"/"Unknown" slots for a message-less, author-less row', () => {
    const row = mapBackendCommitToItem(
      { sha: 'c'.repeat(40), timestamp: Math.floor(Date.now() / 1000) - 60 },
      VIEWER,
    );
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={repo}
        commits={[row]}
        currentBranch="main"
        repoBranches={['main']}
      />,
    );
    // Honest fallbacks render…
    expect(html).toContain('No message');
    expect(html).toContain('Unknown');
    // …and no invented data or viewer attribution ever appears.
    expect(html).not.toContain(INVENTED_MESSAGE);
    expect(html).not.toContain(VIEWER);
    expect(html).not.toContain('@quantmail.in');
  });

  it('renders honest fallbacks in the expanded commit-diff detail view', () => {
    const row = mapBackendCommitToItem(
      { sha: 'd'.repeat(40), timestamp: Math.floor(Date.now() / 1000) - 60 },
      VIEWER,
    );
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={repo}
        commits={[row]}
        currentBranch="main"
        repoBranches={['main']}
        selectedCommitSha={row.sha}
      />,
    );
    expect(html).toContain('commit-diff-view');
    expect(html).toContain('No message');
    expect(html).toContain('Unknown');
    expect(html).not.toContain(INVENTED_MESSAGE);
    expect(html).not.toContain(VIEWER);
  });

  it('still renders real message and author data supplied by the backend', () => {
    const row = mappedItem();
    const html = renderToStaticMarkup(
      <CommitsTab
        repo={repo}
        commits={[row]}
        currentBranch="main"
        repoBranches={['main']}
      />,
    );
    expect(html).toContain('feat: ship the thing');
    expect(html).toContain('devone');
    expect(html).not.toContain('No message');
    expect(html).not.toContain(INVENTED_MESSAGE);
  });
});
