// @vitest-environment jsdom
// useUniversalSearch scope gating (qm-search-scope-queries).
//
// A narrowed scope must fire ONLY the source(s) its tab renders. Previously
// the hook ran mail+people+calendar+drive in parallel for any non-empty
// query and left scope filtering to the renderer — picking "People" still
// sent authenticated requests to the mail, calendar, and drive backends on
// every keystroke batch (3 wasted round-trips per search).
//
// The assertions read the apiClient mocks (the network boundary), not the
// rendered sections: a disabled source must never even start its queryFn.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUniversalSearch, type UniversalSearchScope } from '../useUniversalSearch';
import type { Contact, CalendarEvent } from '../../types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const searchEmailsMock = vi.hoisted(() => vi.fn());
const searchContactsMock = vi.hoisted(() => vi.fn());
const searchCalendarEventsMock = vi.hoisted(() => vi.fn());
const searchAllMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/api-client', () => ({
  apiClient: {
    searchEmails: searchEmailsMock,
    searchContacts: searchContactsMock,
    searchCalendarEvents: searchCalendarEventsMock,
    searchAll: searchAllMock,
  },
}));

type HookResult = ReturnType<typeof useUniversalSearch>;
let captured: HookResult | null = null;
let client: QueryClient | null = null;

function Harness({ query, scope }: { query: string | null; scope?: UniversalSearchScope }) {
  captured = scope === undefined ? useUniversalSearch(query) : useUniversalSearch(query, scope);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderHook(query: string | null, scope?: UniversalSearchScope) {
  captured = null;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      <QueryClientProvider client={client}>
        <Harness query={query} scope={scope} />
      </QueryClientProvider>,
    );
  });
}

/** Wait until the expected number of source fetches fired and all settle. */
async function settle(expectedCalls: number) {
  for (let i = 0; i < 120; i++) {
    const calls =
      searchEmailsMock.mock.calls.length +
      searchContactsMock.mock.calls.length +
      searchCalendarEventsMock.mock.calls.length +
      searchAllMock.mock.calls.length;
    const queries = client?.getQueryCache().findAll({ queryKey: ['universal-search'] }) ?? [];
    const allIdle = queries.every((q) => q.state.fetchStatus === 'idle');
    if (calls >= expectedCalls && allIdle) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  throw new Error('universal-search queries did not settle');
}

beforeEach(() => {
  vi.clearAllMocks();
  searchEmailsMock.mockResolvedValue({
    success: true,
    data: [{ id: 'm1', subject: 'Mail hit' }],
  });
  searchContactsMock.mockResolvedValue({
    success: true,
    data: [{ id: 'p1', name: 'Person hit', email: 'p@quantmail.in' } as Contact],
  });
  searchCalendarEventsMock.mockResolvedValue({
    success: true,
    data: [{ id: 'c1', title: 'Event hit' } as CalendarEvent],
  });
  searchAllMock.mockResolvedValue({
    success: true,
    data: {
      files: [{ id: 'f1', name: 'File hit' }],
      documents: [{ id: 'd1', title: 'Doc hit' }],
    },
  });
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

describe('useUniversalSearch scope gating', () => {
  it('scope=people fires ONLY the people query', async () => {
    renderHook('invoice', 'people');
    await settle(1);

    expect(searchContactsMock).toHaveBeenCalledTimes(1);
    expect(searchContactsMock).toHaveBeenCalledWith('invoice');
    expect(searchEmailsMock).not.toHaveBeenCalled();
    expect(searchCalendarEventsMock).not.toHaveBeenCalled();
    expect(searchAllMock).not.toHaveBeenCalled();

    expect(captured!.data?.people.items).toHaveLength(1);
    expect(captured!.data?.mail.items).toEqual([]);
    expect(captured!.data?.mail.error).toBeNull();
    expect(captured!.data?.calendar.items).toEqual([]);
    expect(captured!.data?.drive.files).toEqual([]);
    expect(captured!.isLoading).toBe(false);
  });

  it('scope=drive fires ONLY the drive query', async () => {
    renderHook('invoice', 'drive');
    await settle(1);

    expect(searchAllMock).toHaveBeenCalledTimes(1);
    expect(searchEmailsMock).not.toHaveBeenCalled();
    expect(searchContactsMock).not.toHaveBeenCalled();
    expect(searchCalendarEventsMock).not.toHaveBeenCalled();
  });

  it('scope=calendar fires ONLY the calendar query', async () => {
    renderHook('invoice', 'calendar');
    await settle(1);

    expect(searchCalendarEventsMock).toHaveBeenCalledTimes(1);
    expect(searchEmailsMock).not.toHaveBeenCalled();
    expect(searchContactsMock).not.toHaveBeenCalled();
    expect(searchAllMock).not.toHaveBeenCalled();
  });

  it('scope=all fires all four sources', async () => {
    renderHook('invoice', 'all');
    await settle(4);

    expect(searchEmailsMock).toHaveBeenCalledTimes(1);
    expect(searchContactsMock).toHaveBeenCalledTimes(1);
    expect(searchCalendarEventsMock).toHaveBeenCalledTimes(1);
    expect(searchAllMock).toHaveBeenCalledTimes(1);
    expect(captured!.data?.mail.items).toHaveLength(1);
    expect(captured!.data?.people.items).toHaveLength(1);
    expect(captured!.data?.calendar.items).toHaveLength(1);
    expect(captured!.data?.drive.files).toHaveLength(1);
    expect(captured!.data?.drive.documents).toHaveLength(1);
  });

  it('omitted scope defaults to all (existing callers unchanged)', async () => {
    renderHook('invoice');
    await settle(4);

    expect(searchEmailsMock).toHaveBeenCalledTimes(1);
    expect(searchContactsMock).toHaveBeenCalledTimes(1);
    expect(searchCalendarEventsMock).toHaveBeenCalledTimes(1);
    expect(searchAllMock).toHaveBeenCalledTimes(1);
  });

  it('null query fires nothing regardless of scope', async () => {
    renderHook(null, 'people');
    await settle(0);

    expect(searchEmailsMock).not.toHaveBeenCalled();
    expect(searchContactsMock).not.toHaveBeenCalled();
    expect(searchCalendarEventsMock).not.toHaveBeenCalled();
    expect(searchAllMock).not.toHaveBeenCalled();
    expect(captured!.data).toBeUndefined();
  });
});
