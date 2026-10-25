// @vitest-environment jsdom
// useSearchEmails pagination (P2 fix).
//
// The hook used to return only the Email[] and discard the backend's
// pagination envelope, so the /search page printed the page length as if it
// were the total ("50 results" for a 200-hit query) and deeper pages were
// unreachable. Pins:
//   1. totalCount is the backend's full match count, not the page length.
//   2. hasMore follows the backend's hasNext/totalPages/total.
//   3. Fetching page 2 APPENDS to `data` instead of replacing page 1.
//   4. A new query resets the accumulation.
//   5. An envelope with no total leaves totalCount null — never faked
//      from the page length.
//   6. searchPageMeta's precedence: hasNext > totalPages > total > full page.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchEmails, searchPageMeta } from '../useMail';
import { shouldRetryQuery, queryRetryDelay } from '../../lib/query-retry';
import type { Email } from '../../types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const searchEmailsMock = vi.hoisted(() => vi.fn());
const ftsSearchMock = vi.hoisted(() => vi.fn((): unknown[] => []));
const ftsIndexMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/api-client', () => ({
  apiClient: { searchEmails: searchEmailsMock },
}));

vi.mock('../../lib/sqlite-fts5', () => ({
  getFts5Indexer: () => ({ search: ftsSearchMock, indexEmails: ftsIndexMock }),
}));

type HookResult = ReturnType<typeof useSearchEmails>;
let captured: HookResult | null = null;
let client: QueryClient | null = null;

function Harness({ params }: { params: { query: string; page?: number } }) {
  captured = useSearchEmails(params);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderHook(params: { query: string; page?: number }) {
  captured = null;
  client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
      },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      <QueryClientProvider client={client}>
        <Harness params={params} />
      </QueryClientProvider>,
    );
  });
}

function rerenderHook(params: { query: string; page?: number }) {
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <Harness params={params} />
      </QueryClientProvider>,
    );
  });
}

/** Poll the latest hook snapshot until `check` passes (renders are async). */
async function waitForHook(check: (h: HookResult) => boolean, label: string) {
  for (let i = 0; i < 200; i++) {
    if (captured && check(captured)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  throw new Error(`useSearchEmails never satisfied: ${label}`);
}

function makeEmails(prefix: string, count: number, start = 0): Email[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${start + i}`,
    threadId: `t-${prefix}-${start + i}`,
    subject: `${prefix} ${start + i}`,
    snippet: `${prefix} snippet`,
    from: { email: 'sender@quantmail.in', name: 'Sender' },
    to: [{ email: 'me@quantmail.in', name: 'Me' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as Email[];
}

beforeEach(() => {
  vi.clearAllMocks();
  ftsSearchMock.mockReturnValue([]);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  captured = null;
  client = null;
});

describe('useSearchEmails pagination', () => {
  it('surfaces the backend totalCount, not the page length, and hasMore', async () => {
    searchEmailsMock.mockResolvedValue({
      success: true,
      data: makeEmails('p1', 50),
      totalCount: 200,
      totalPages: 4,
      page: 1,
      pageSize: 50,
      hasNext: true,
    });

    renderHook({ query: 'invoice' });
    await waitForHook(
      (h) => (h.data?.length ?? 0) === 50 && h.totalCount === 200,
      'page 1 with totalCount 200',
    );

    // The bug was total == page length (50). The total is the backend's.
    expect(captured!.data).toHaveLength(50);
    expect(captured!.totalCount).toBe(200);
    expect(captured!.totalPages).toBe(4);
    expect(captured!.hasMore).toBe(true);
    expect(captured!.page).toBe(1);
    expect(captured!.pageSize).toBe(50);
  });

  it('appends page 2 to data instead of replacing page 1', async () => {
    searchEmailsMock.mockImplementation(async (params: { page?: number }) => {
      const page = params?.page ?? 1;
      if (page === 1) {
        return {
          success: true,
          data: makeEmails('p1', 50),
          totalCount: 200,
          totalPages: 4,
          page: 1,
          pageSize: 50,
          hasNext: true,
        };
      }
      return {
        success: true,
        data: makeEmails('p2', 50),
        totalCount: 200,
        totalPages: 4,
        page: 2,
        pageSize: 50,
        hasNext: true,
      };
    });

    renderHook({ query: 'invoice' });
    await waitForHook((h) => (h.data?.length ?? 0) === 50, 'page 1');

    rerenderHook({ query: 'invoice', page: 2 });
    await waitForHook((h) => (h.data?.length ?? 0) === 100, 'pages 1+2');

    const ids = captured!.data!.map((e) => e.id);
    expect(new Set(ids).size).toBe(100);
    expect(ids[0]).toBe('p1-0');
    expect(ids[50]).toBe('p2-0');
    expect(captured!.totalCount).toBe(200);
    expect(searchEmailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it('a failed page 2 keeps page 1 and its envelope; a refetch appends exactly page 2', async () => {
    // The 400 envelope is deliberate: a 500 would auto-retry under
    // shouldRetryQuery and make the failure/success sequencing racy. The
    // hook's failure path (success:false -> throw) is identical either way;
    // the page-level suite covers the 500-shaped error state.
    let page2Down = true;
    searchEmailsMock.mockImplementation(async (params: { page?: number }) => {
      const page = params?.page ?? 1;
      if (page === 1) {
        return {
          success: true,
          data: makeEmails('p1', 2),
          totalCount: 4,
          totalPages: 2,
          page: 1,
          pageSize: 2,
          hasNext: true,
        };
      }
      if (page2Down) {
        return { success: false, error: { statusCode: 400, message: 'Mail search failed' } };
      }
      return {
        success: true,
        data: makeEmails('p2', 2),
        totalCount: 4,
        totalPages: 2,
        page: 2,
        pageSize: 2,
        hasNext: false,
      };
    });

    renderHook({ query: 'invoice' });
    await waitForHook((h) => (h.data?.length ?? 0) === 2, 'page 1');

    rerenderHook({ query: 'invoice', page: 2 });
    await waitForHook((h) => h.isError === true, 'page 2 error');

    // The failed append must not touch page 1 or its envelope: the page
    // component's Retry affordance depends on both surviving.
    expect(captured!.data!.map((e) => e.id)).toEqual(['p1-0', 'p1-1']);
    expect(captured!.totalCount).toBe(4);
    expect(captured!.hasMore).toBe(true);

    // Same-page retry: refetch re-runs page 2 only, and the hook appends
    // it deduped — page 1 appears once, page 2 appears once.
    page2Down = false;
    await act(async () => {
      await captured!.refetch();
    });
    await waitForHook((h) => (h.data?.length ?? 0) === 4, 'pages 1+2 after retry');

    const ids = captured!.data!.map((e) => e.id);
    expect(ids).toEqual(['p1-0', 'p1-1', 'p2-0', 'p2-1']);
    expect(new Set(ids).size).toBe(4);
    expect(captured!.hasMore).toBe(false);
  });

  it('resets the accumulation when the query changes', async () => {
    searchEmailsMock.mockImplementation(async (params: { query?: string }) => {
      if (params?.query === 'invoice') {
        return {
          success: true,
          data: makeEmails('inv', 50),
          totalCount: 200,
          totalPages: 4,
          page: 1,
          pageSize: 50,
          hasNext: true,
        };
      }
      return {
        success: true,
        data: makeEmails('other', 5),
        totalCount: 5,
        totalPages: 1,
        page: 1,
        pageSize: 50,
        hasNext: false,
      };
    });

    renderHook({ query: 'invoice' });
    await waitForHook((h) => (h.data?.length ?? 0) === 50, 'invoice page 1');

    rerenderHook({ query: 'other' });
    await waitForHook(
      (h) => (h.data?.length ?? 0) === 5 && h.totalCount === 5,
      'other query replaces accumulation',
    );

    expect(captured!.data!.map((e) => e.id)).toEqual([
      'other-0',
      'other-1',
      'other-2',
      'other-3',
      'other-4',
    ]);
    expect(captured!.hasMore).toBe(false);
  });

  it('leaves totalCount null when the backend reports no total', async () => {
    searchEmailsMock.mockResolvedValue({
      success: true,
      data: makeEmails('x', 3),
    });

    renderHook({ query: 'invoice' });
    await waitForHook((h) => (h.data?.length ?? 0) === 3, '3 results, no total');

    // Never fake the total from the page length: null means "unknown".
    expect(captured!.totalCount).toBeNull();
    expect(captured!.hasMore).toBe(false);
  });
});

describe('searchPageMeta', () => {
  it('prefers hasNext, then totalPages, then total, then the full-page hint', () => {
    expect(
      searchPageMeta({ hasNext: false, totalPages: 4, page: 1, pageSize: 50 }, 1, 50, 50),
    ).toMatchObject({ hasMore: false });
    expect(
      searchPageMeta({ totalPages: 4, page: 3, pageSize: 50 }, 1, 50, 50),
    ).toMatchObject({ hasMore: true, totalPages: 4 });
    expect(
      searchPageMeta({ totalCount: 120, page: 2, pageSize: 50 }, 1, 50, 50),
    ).toMatchObject({ hasMore: true, totalCount: 120 });
    expect(
      searchPageMeta({ totalCount: 100, page: 2, pageSize: 50 }, 1, 50, 50),
    ).toMatchObject({ hasMore: false });
    // No total anywhere: a full page hints at more, a short page does not.
    expect(searchPageMeta({}, 1, 50, 50)).toMatchObject({
      hasMore: true,
      totalCount: null,
    });
    expect(searchPageMeta({}, 1, 50, 12)).toMatchObject({ hasMore: false });
    // metadata.total is accepted as a total source.
    expect(
      searchPageMeta({ metadata: { total: 75, page: 1, pageSize: 50 } }, 1, 50, 50),
    ).toMatchObject({ totalCount: 75, hasMore: true });
  });
});
