// @vitest-environment jsdom
// /search mail-scope pagination (P2 fix).
//
// The page used to print `{results.length} results` as if the page length
// were the total, with no way to reach deeper pages. Pins:
//   1. With a backend total, the count reads "Showing X of N results" and a
//      Load more button is offered while more pages exist.
//   2. Clicking Load more re-requests the search with page 2.
//   3. Once every result is loaded, the count is the plain total.
//   4. With no backend total, the count falls back to the loaded length
//      with no total claim — never a faked total.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Email } from '../types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerReplace = vi.hoisted(() => vi.fn());
const stableRouter = vi.hoisted(() => ({
  replace: (...args: unknown[]) => routerReplace(...args),
  push: vi.fn(),
  prefetch: vi.fn(),
}));

const mailSearchState = vi.hoisted(() => ({
  data: undefined as Email[] | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null as Error | null,
  localHits: [] as Email[],
  refetch: vi.fn(),
  totalCount: undefined as number | undefined,
  hasMore: undefined as boolean | undefined,
}));

const capturedParams = vi.hoisted(() => [] as unknown[]);

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@quantmail.in' } }),
}));

vi.mock('../hooks/useSearchEmails', () => ({
  useSearchEmails: (params: unknown) => {
    capturedParams.push(params);
    return { ...mailSearchState };
  },
}));

vi.mock('../hooks/useUniversalSearch', () => ({
  useUniversalSearch: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock('../app/search/UniversalSearchResults', () => ({
  UniversalSearchResults: () => null,
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => null,
}));
vi.mock('../components/SearchClearButton', () => ({
  SearchClearButton: () => null,
}));
vi.mock('../components/UnreadDot', () => ({
  UnreadDot: () => null,
}));

vi.mock('@quant/shared-ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Skeleton: () => <div className="skeleton" />,
  ErrorState: () => <div data-testid="error-state" />,
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => (
      <div {...(rest as Record<string, unknown>)}>{children}</div>
    ),
    button: ({
      children,
      variants: _variants,
      ...rest
    }: {
      children?: React.ReactNode;
      variants?: unknown;
    }) => <button {...(rest as Record<string, unknown>)}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@quant/brand', () => ({ spring: {} }));
vi.mock('../lib/motion-variants', () => ({
  listContainerVariants: {},
  listItemVariants: {},
}));

import SearchPage from '../app/search/page';

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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderOnMailTab() {
  window.history.replaceState({}, '', '/search?q=invoice');
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<SearchPage />);
  });
  const tab = Array.from(container!.querySelectorAll('[role="tab"]')).find(
    (el) => el.textContent?.trim() === 'Mail',
  );
  expect(tab).toBeTruthy();
  act(() => {
    tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return container!;
}

function findButton(c: HTMLElement, label: string) {
  return Array.from(c.querySelectorAll('button')).find(
    (el) => el.textContent?.trim() === label,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedParams.length = 0;
  mailSearchState.data = undefined;
  mailSearchState.isLoading = false;
  mailSearchState.isFetching = false;
  mailSearchState.isError = false;
  mailSearchState.error = null;
  mailSearchState.localHits = [];
  mailSearchState.totalCount = undefined;
  mailSearchState.hasMore = undefined;
  window.history.replaceState({}, '', '/search');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('search page mail-scope pagination', () => {
  it('shows "Showing X of N results" and Load more while more pages exist', () => {
    mailSearchState.data = Array.from({ length: 50 }, (_, i) =>
      makeEmail(`srv-${i}`, `Server invoice ${i}`),
    );
    mailSearchState.totalCount = 200;
    mailSearchState.hasMore = true;

    const c = renderOnMailTab();
    const html = c.innerHTML;

    // The old copy claimed the page length was the total ("50 results").
    expect(html).toContain('Showing 50 of 200 results');
    expect(html).not.toContain('>50 results<');
    expect(findButton(c, 'Load more')).toBeTruthy();
  });

  it('clicking Load more re-requests the search with page 2', () => {
    mailSearchState.data = Array.from({ length: 50 }, (_, i) =>
      makeEmail(`srv-${i}`, `Server invoice ${i}`),
    );
    mailSearchState.totalCount = 200;
    mailSearchState.hasMore = true;

    const c = renderOnMailTab();
    const loadMore = findButton(c, 'Load more');
    expect(loadMore).toBeTruthy();
    act(() => {
      loadMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const lastParams = capturedParams[capturedParams.length - 1] as {
      page?: number;
    };
    expect(lastParams.page).toBe(2);
  });

  it('shows the plain total once every result is loaded', () => {
    mailSearchState.data = Array.from({ length: 5 }, (_, i) =>
      makeEmail(`srv-${i}`, `Server invoice ${i}`),
    );
    mailSearchState.totalCount = 5;
    mailSearchState.hasMore = false;

    const c = renderOnMailTab();
    const html = c.innerHTML;

    expect(html).toContain('5 results for');
    expect(html).not.toContain('Showing');
    expect(findButton(c, 'Load more')).toBeFalsy();
  });

  it('page-2 failure keeps page 1, shows the error, and Retry appends exactly page 2', () => {
    // Snippets are neutral on purpose: makeEmail's default snippet repeats the
    // subject, which would make "exactly once" counts read 2 per row.
    const page1 = [
      { ...makeEmail('p1a', 'Page one A'), snippet: 'first page alpha' },
      { ...makeEmail('p1b', 'Page one B'), snippet: 'first page beta' },
    ];
    const page2 = [
      { ...makeEmail('p2a', 'Page two A'), snippet: 'second page alpha' },
      { ...makeEmail('p2b', 'Page two B'), snippet: 'second page beta' },
    ];
    const countOccurrences = (html: string, text: string) =>
      html.split(text).length - 1;

    mailSearchState.data = page1;
    mailSearchState.totalCount = 4;
    mailSearchState.hasMore = true;

    const c = renderOnMailTab();
    const loadMore = findButton(c, 'Load more');
    expect(loadMore).toBeTruthy();
    act(() => {
      loadMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(
      (capturedParams[capturedParams.length - 1] as { page?: number }).page,
    ).toBe(2);

    // Page 2 fails with a 500 while page 1 is on screen. The hook's data
    // stays the accumulated page 1; local hits exist, which is exactly what
    // the old code replaced page 1 with.
    mailSearchState.isError = true;
    mailSearchState.error = new Error('Mail search failed');
    mailSearchState.isFetching = false;
    mailSearchState.localHits = [
      { ...makeEmail('local-1', 'Local only hit'), snippet: 'local snippet' },
    ];
    act(() => {
      root!.render(<SearchPage />);
    });

    const failedHtml = c.innerHTML;
    // Page 1 stays — it is not replaced by local hits or an ErrorState.
    expect(failedHtml).toContain('Page one A');
    expect(failedHtml).toContain('Page one B');
    expect(failedHtml).not.toContain('Local only hit');
    expect(failedHtml).not.toContain('Server search unavailable');
    expect(c.querySelector('[data-testid="error-state"]')).toBeFalsy();
    // Partial/error provenance: the banner plus the honest partial count.
    expect(failedHtml).toContain('Couldn’t load the next page');
    expect(failedHtml).toContain('Showing 2 of 4 results');
    // Retry stays reachable, in its retry label, not hidden by offline gating.
    const retry = findButton(c, 'Try loading more again');
    expect(retry).toBeTruthy();
    act(() => {
      retry!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mailSearchState.refetch).toHaveBeenCalledTimes(1);
    // Same page retried — the click must not advance past the failed page.
    expect(
      (capturedParams[capturedParams.length - 1] as { page?: number }).page,
    ).toBe(2);

    // The retry resolves page 2; the hook's accumulated data is pages 1+2.
    mailSearchState.isError = false;
    mailSearchState.error = null;
    mailSearchState.isFetching = false;
    mailSearchState.localHits = [];
    mailSearchState.data = [...page1, ...page2];
    mailSearchState.totalCount = 4;
    mailSearchState.hasMore = false;
    act(() => {
      root!.render(<SearchPage />);
    });

    const retriedHtml = c.innerHTML;
    // Page 2 appended exactly once, page 1 intact and never duplicated.
    for (const subject of ['Page one A', 'Page one B', 'Page two A', 'Page two B']) {
      expect(countOccurrences(retriedHtml, subject)).toBe(1);
    }
    expect(retriedHtml).toContain('4 results for');
    expect(findButton(c, 'Load more')).toBeFalsy();
    expect(findButton(c, 'Try loading more again')).toBeFalsy();
  });

  it('falls back to the loaded count with no total claim when the backend reports none', () => {
    mailSearchState.data = Array.from({ length: 50 }, (_, i) =>
      makeEmail(`srv-${i}`, `Server invoice ${i}`),
    );

    const c = renderOnMailTab();
    const html = c.innerHTML;

    expect(html).toContain('50 results for');
    expect(html).not.toContain('Showing');
    expect(findButton(c, 'Load more')).toBeFalsy();
  });
});
