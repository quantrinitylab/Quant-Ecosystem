// @vitest-environment jsdom
// /search mail-scope failure honesty.
//
// The hook's queryFn now throws on backend failure (ApiRequestError), so the
// page's ErrorState branch is reachable again and local FTS5 hits render
// honestly labeled as offline/partial. Pins:
//  1. backend fails + empty local index -> ErrorState (no false "No results")
//  2. backend fails + local hits      -> offline banner + "N offline results",
//     never the ErrorState, never an unqualified count
//  3. backend succeeds                -> plain "N results", no offline copy
//  4. backend succeeds empty          -> the honest "Nothing matched" state
//  5. the ErrorState retry actually refetches (the old onRetry={handleSearch}
//     was a no-op when the query text was unchanged)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApiRequestError } from '../lib/query-retry';
import type { Email } from '../types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerReplace = vi.hoisted(() => vi.fn());

// Next's real useRouter() returns a STABLE router object across renders.
// Returning a fresh object literal per call (the old mock) recreates the
// page's runSearchString useCallback on every render, which re-fires the
// ?q= seed effect on every render — and that effect calls
// setRecentSearches(getRecentSearches()), a brand-new array each time, so
// React never bails out: render -> effect -> setState -> render, forever.
// The test worker hung/OOMed in CI (gate + full-sweep) without a single
// assertion failing. Hoist one stable router, exactly like the real router.
const stableRouter = vi.hoisted(() => ({
  replace: (...args: unknown[]) => routerReplace(...args),
  push: vi.fn(),
  prefetch: vi.fn(),
}));

const mailSearchState = vi.hoisted(() => ({
  data: undefined as Email[] | undefined,
  isLoading: false,
  error: null as Error | null,
  localHits: [] as Email[],
  refetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
}));

// The page calls useAuth() at render (account-scoped recent-search
// persistence needs the immutable user id). The test shell has no
// AuthProvider, so the real hook throws — mock it like the sibling suites
// (person-thread-page-load.test.tsx) with a stable test account.
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@quantmail.in' } }),
}));

vi.mock('../hooks/useSearchEmails', () => ({
  useSearchEmails: () => ({ ...mailSearchState }),
}));

vi.mock('../hooks/useUniversalSearch', () => ({
  useUniversalSearch: () => ({ data: null, isLoading: false, error: null }),
}));

// The page reads the user's real labels for the as-you-type suggestion
// dropdown's Labels section. The test shell has no QueryClientProvider, so
// mock it like the other page hooks — an empty label list simply means the
// section renders nothing.
vi.mock('../hooks/useLabels', () => ({
  useLabels: () => ({ data: [], isLoading: false, error: null }),
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
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Skeleton: () => <div className="skeleton" />,
  ErrorState: ({
    title,
    message,
    onRetry,
  }: {
    title?: string;
    message: string;
    onRetry?: () => void;
  }) => (
    <div data-testid="error-state" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" data-testid="error-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  ),
  EmptyState: ({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

// Keep the import graph light: framer-motion + brand tokens + motion
// variants are irrelevant to search-failure honesty, and the full graph
// OOMs vitest workers on small CI containers.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => (
      <div {...(rest as Record<string, unknown>)}>{children}</div>
    ),
    // The page renders each result row as <motion.button>; the mock used to
    // define only motion.div, so any test with visible results crashed with
    // "Element type is invalid: ... got: undefined" once the render loop
    // above was fixed and the tests could actually reach the results branch.
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
  // The page seeds its search from ?q= in an effect.
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

beforeEach(() => {
  vi.clearAllMocks();
  mailSearchState.data = undefined;
  mailSearchState.isLoading = false;
  mailSearchState.error = null;
  mailSearchState.localHits = [];
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

describe('search page mail-scope failure honesty', () => {
  it('backend failure with an empty local index renders ErrorState, not the false "No results" claim', () => {
    mailSearchState.error = new ApiRequestError('Search backend is down', 503, 'SEARCH_DOWN');

    const c = renderOnMailTab();
    const html = c.innerHTML;

    expect(c.querySelector('[data-testid="error-state"]')).toBeTruthy();
    expect(html).toContain('Search unavailable');
    expect(html).toContain('Search backend is down');
    expect(c.querySelector('[data-testid="empty-state"]')).toBeNull();
    expect(html).not.toContain('Nothing matched');
  });

  it('backend failure with local hits labels them offline/partial instead of silent full results', () => {
    mailSearchState.error = new ApiRequestError('Search backend is down', 503, 'SEARCH_DOWN');
    mailSearchState.localHits = [
      makeEmail('local-1', 'Local invoice one'),
      makeEmail('local-2', 'Local invoice two'),
    ];

    const c = renderOnMailTab();
    const html = c.innerHTML;

    expect(c.querySelector('[data-testid="error-state"]')).toBeNull();
    expect(html).toContain('Server search unavailable');
    expect(html).toContain('offline index');
    expect(html).toContain('2 offline results');
    expect(html).toContain('Local invoice one');
    expect(html).toContain('Local invoice two');
    expect(c.querySelector('[data-testid="empty-state"]')).toBeNull();
  });

  it('successful search renders a plain result count with no offline copy', () => {
    mailSearchState.data = [makeEmail('srv-1', 'Server invoice')];

    const c = renderOnMailTab();
    const html = c.innerHTML;

    expect(html).toContain('1 result for');
    expect(html).not.toContain('offline');
    expect(html).toContain('Server invoice');
    expect(c.querySelector('[data-testid="error-state"]')).toBeNull();
  });

  it('successful empty search keeps the honest "Nothing matched" empty state', () => {
    mailSearchState.data = [];

    const c = renderOnMailTab();
    const html = c.innerHTML;

    expect(c.querySelector('[data-testid="empty-state"]')).toBeTruthy();
    expect(html).toContain('Nothing matched');
    expect(c.querySelector('[data-testid="error-state"]')).toBeNull();
  });

  it('the ErrorState retry actually refetches', () => {
    mailSearchState.error = new ApiRequestError('Search backend is down', 503, 'SEARCH_DOWN');

    const c = renderOnMailTab();
    const retry = c.querySelector('[data-testid="error-retry"]') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    act(() => {
      retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mailSearchState.refetch).toHaveBeenCalledTimes(1);
  });
});
