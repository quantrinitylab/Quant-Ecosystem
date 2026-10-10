// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxCursorPager } from '../lib/inbox-cursor-pager';
import {
  SwipeHintBar,
  dismissSwipeHint,
  isSwipeHintDismissed,
  SWIPE_HINT_STORAGE_KEY,
} from '../components/SwipeHint';
import { QuantMailApiClient } from '../services/api-client';
import type { Email } from '../types';

// QM-UIUX-040: inbox P1s — swipe hint, cursor pagination, dead-hook removal.
//
// The DOM-free harness in this repo cannot mount hooks, so the behaviour is
// pinned where it lives: the pager state machine the hook drives, the hint's
// storage contract + rendered markup, and the apiClient's cursor plumbing.
// The server half of the cursor contract is pinned end-to-end in
// backend/__tests__/emails-list-cursor.routes.test.ts.

const email = (id: string) => ({ id }) as unknown as Email;

describe('InboxCursorPager (QM-UIUX-040)', () => {
  it('starts empty: no tail, no next page', () => {
    const pager = new InboxCursorPager();
    expect(pager.hasMore).toBe(false);
    expect(pager.cursor).toBeNull();
    expect(pager.tailEmails).toEqual([]);
  });

  it('syncFirstPage publishes the chain head', () => {
    const pager = new InboxCursorPager();
    pager.syncFirstPage('c1');
    expect(pager.hasMore).toBe(true);
    expect(pager.cursor).toBe('c1');
  });

  it('merge returns the first page untouched until the tail grows', () => {
    const pager = new InboxCursorPager();
    const firstPage = [email('a'), email('b')];
    expect(pager.merge(firstPage)).toBe(firstPage);
    pager.extend([email('c')], 'c2');
    expect(pager.merge(firstPage).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('a first-page refetch cannot rewind a chain the user already extended', () => {
    const pager = new InboxCursorPager();
    pager.syncFirstPage('c1');
    pager.extend([email('c')], 'c2');
    // The 30s poll reloads page 1 and reports its own head cursor.
    pager.syncFirstPage('c1-again');
    expect(pager.cursor).toBe('c2');
  });

  it('merge dedupes a row that drifted from the tail into the first page', () => {
    const pager = new InboxCursorPager();
    pager.syncFirstPage('c1');
    pager.extend([email('b'), email('c')], null);
    const merged = pager.merge([email('a'), email('b')]);
    expect(merged.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(pager.hasMore).toBe(false);
  });

  it('reset restarts the chain', () => {
    const pager = new InboxCursorPager();
    pager.syncFirstPage('c1');
    pager.extend([email('c')], 'c2');
    pager.reset();
    expect(pager.hasMore).toBe(false);
    expect(pager.tailEmails).toEqual([]);
    pager.syncFirstPage('fresh');
    expect(pager.cursor).toBe('fresh');
  });
});

describe('SwipeHint (QM-UIUX-040)', () => {
  function fakeStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      map,
    };
  }

  it('is undismissed until the dismissal is persisted, then stays dismissed', () => {
    const storage = fakeStorage();
    expect(isSwipeHintDismissed(storage)).toBe(false);
    dismissSwipeHint(storage);
    expect(storage.map.get(SWIPE_HINT_STORAGE_KEY)).toBe('1');
    expect(isSwipeHintDismissed(storage)).toBe(true);
  });

  it('treats unreadable storage as dismissed instead of nagging forever', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(isSwipeHintDismissed(broken)).toBe(true);
    expect(() => dismissSwipeHint(broken)).not.toThrow();
  });

  it('renders the honest swipe copy with a labelled dismiss button', () => {
    const html = renderToStaticMarkup(createElement(SwipeHintBar, { onDismiss: () => {} }));
    expect(html).toContain('Swipe a conversation left to archive it, or right to snooze it.');
    expect(html).toContain('mail-swipe-hint');
    expect(html).toContain('aria-label="Dismiss swipe tip"');
    expect(html).toContain('<button');
  });
});

describe('apiClient cursor plumbing (QM-UIUX-040)', () => {
  const fetchMock = vi.fn();
  let client: QuantMailApiClient;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        success: true,
        data: [],
        page: 1,
        pageSize: 50,
        totalPages: 3,
        totalCount: 120,
        nextCursor: 'cursor-2',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    client = new QuantMailApiClient('https://mail.test/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the cursor as a query param and surfaces nextCursor', async () => {
    const res = await client.getEmails({ folderType: 'INBOX', pageSize: 50, cursor: 'cursor-1' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/emails?');
    expect(url).toContain('cursor=cursor-1');
    expect(res.nextCursor).toBe('cursor-2');
    expect(res.totalCount).toBe(120);
  });
});

describe('dead hook removal (QM-UIUX-040)', () => {
  it('useInfiniteInbox.ts no longer exists', () => {
    const path = fileURLToPath(new URL('../hooks/useInfiniteInbox.ts', import.meta.url));
    expect(existsSync(path)).toBe(false);
  });

  it('useMail no longer exports useInfiniteInbox, and useInbox is intact', async () => {
    const useMail = await import('../hooks/useMail');
    expect('useInfiniteInbox' in useMail).toBe(false);
    expect(typeof useMail.useInbox).toBe('function');
  });
});
