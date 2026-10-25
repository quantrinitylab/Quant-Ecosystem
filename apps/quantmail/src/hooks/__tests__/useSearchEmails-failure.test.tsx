// @vitest-environment jsdom
// useSearchEmails failure honesty.
//
// The queryFn must THROW on backend failure (ApiRequestError, per the repo's
// lib/query-retry convention) so react-query's `error` surfaces and the
// /search page's ErrorState / offline-partial banner can render. It previously
// returned localHits on both `!response.success` and catch, which made `error`
// permanently undefined: the ErrorState was dead code and an empty local
// index produced the false "No results" claim about a search that never ran.
//
// The assertions read the query cache state (the source of truth) rather than
// the hook's observer snapshot: with placeholderData set, the observer keeps
// reporting the placeholder as `data`/`status: 'success'` until React's
// notification batching flushes, which makes observer-level polling flaky in
// jsdom. The cache transitions fetch -> error deterministically.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchEmails } from '../useMail';
import { ApiRequestError, shouldRetryQuery, queryRetryDelay } from '../../lib/query-retry';
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

function Harness({ params }: { params: { query: string } | null }) {
  captured = useSearchEmails(params);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderHook(params: { query: string } | null) {
  captured = null;
  client = new QueryClient({
    defaultOptions: {
      queries: {
        // The app's real retry policy: a non-retryable 4xx surfaces
        // immediately, so these tests stay fast and deterministic.
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

/** Wait until the search query's own fetch settles (cache-level truth). */
async function settleQuery() {
  for (let i = 0; i < 120; i++) {
    // findAll (not find): find() defaults to exact key matching.
    const query = client
      ?.getQueryCache()
      .findAll({ queryKey: ['inbox', 'search'] })[0];
    if (query && query.state.fetchStatus === 'idle') return query;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  throw new Error('search query did not settle');
}

function makeEmail(id: string, subject: string): Email {
  return {
    id,
    threadId: `t-${id}`,
    subject,
    snippet: `${subject} snippet`,
    from: { email: 'sender@quantmail.in', name: 'Sender' },
    to: [{ email: 'me@quantmail.in', name: 'Me' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Email;
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

describe('useSearchEmails backend-failure honesty', () => {
  it('throws ApiRequestError (surfaces query error) instead of silently returning local hits', async () => {
    searchEmailsMock.mockResolvedValue({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Bad search syntax', statusCode: 400 },
    });

    renderHook({ query: 'invoice' });
    const query = await settleQuery();

    expect(searchEmailsMock).toHaveBeenCalledTimes(1);
    // The queryFn threw: the query is in error state, not silently resolved
    // with local-only data.
    expect(query.state.status).toBe('error');
    expect(query.state.error).toBeInstanceOf(ApiRequestError);
    expect((query.state.error as Error).message).toBe('Bad search syntax');
    expect(query.state.data).toBeUndefined();
  });

  it('exposes localHits alongside the error so the UI can label them offline/partial', async () => {
    ftsSearchMock.mockReturnValue([
      {
        id: 'local-1',
        threadId: 't-local-1',
        subject: 'Local invoice',
        snippet: 'local snippet',
        fromAddress: 'a@b.c',
        toAddress: 'me@quantmail.in',
        receivedAt: '2026-10-14T00:00:00.000Z',
      },
    ]);
    searchEmailsMock.mockResolvedValue({
      success: false,
      error: { code: 'SEARCH_DOWN', message: 'Search backend is down', statusCode: 400 },
    });

    renderHook({ query: 'invoice' });
    const query = await settleQuery();

    expect(query.state.status).toBe('error');
    expect(query.state.error).toBeInstanceOf(ApiRequestError);
    // The hook still exposes the instant local hits for the offline banner —
    // they are just no longer presented as a successful result set.
    expect(captured!.localHits).toHaveLength(1);
    expect(captured!.localHits[0].id).toBe('local-1');
    expect(query.state.data).toBeUndefined();
  });

  it('still returns combined server results and indexes them on success', async () => {
    const serverEmail = makeEmail('srv-1', 'Server invoice');
    searchEmailsMock.mockResolvedValue({ success: true, data: [serverEmail] });

    renderHook({ query: 'invoice' });
    const query = await settleQuery();

    expect(query.state.status).toBe('success');
    expect(query.state.error).toBeNull();
    // The cache entry is now the page object (emails + backend envelope),
    // not the bare array — the hook's `data` still exposes just the emails.
    expect(query.state.data).toEqual({
      emails: [serverEmail],
      totalCount: null,
      totalPages: null,
      page: 1,
      pageSize: 50,
      hasMore: false,
    });
    expect(ftsIndexMock).toHaveBeenCalledWith([serverEmail]);
  });

  it('falls back to a generic message when the error envelope is empty', async () => {
    // No message in the envelope, but a non-retryable status so the failure
    // surfaces on the first attempt.
    searchEmailsMock.mockResolvedValue({
      success: false,
      error: { statusCode: 400 },
    });

    renderHook({ query: 'invoice' });
    const query = await settleQuery();

    expect(query.state.status).toBe('error');
    expect(query.state.error).toBeInstanceOf(ApiRequestError);
    expect((query.state.error as Error).message).toBe('Mail search failed');
  });
});
