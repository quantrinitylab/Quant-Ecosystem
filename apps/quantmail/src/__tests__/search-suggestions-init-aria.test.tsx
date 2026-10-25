// @vitest-environment jsdom
// ===========================================================================
// PR #1503 CODEX block "init-state + aria" — the live suggestion dropdown
// on /search must be correct in its INITIAL state and fully accessible.
//
// INIT-STATE (the dropdown must be honestly closed/empty):
//   1. mount with no query        -> no listbox, aria-expanded=false,
//      no activedescendant, no stale options.
//   2. clear via the ✕ button     -> closed/empty, no stale suggestions.
//   3. clear via backspace to ''  -> closed/empty.
//   4. the ?q= seed runs ONCE: an auth-hydration re-render (accountKey
//      change, the exact shape that re-fired the seed pre-fix) must NOT
//      resurrect the seeded query over text the user has since typed.
//   5. remount (revisit) with no ?q= -> no previous-query flash.
//
// ARIA (a real combobox/listbox pattern, not divs that look like one):
//   6. input: role=combobox, aria-expanded tracks open/closed truthfully,
//      aria-controls points at the rendered listbox id while open.
//   7. options: id "<listbox>-option-<flatIndex>", role=option,
//      aria-selected on exactly the highlighted one, tabIndex=-1 so focus
//      stays in the input (arrow keys, not Tab, move the highlight).
//   8. aria-activedescendant tracks the highlighted option id through
//      ArrowDown/ArrowUp and is cleared when nothing is highlighted, when
//      the list closes (Escape/blur), and when the list shrinks below the
//      highlight (clamp).
//   9. ArrowUp from no highlight lands on the LAST option (pre-fix it
//      wrapped to len-2); ArrowDown/ArrowUp on a closed-but-nonempty list
//      reopens it instead of doing nothing.
//  10. Enter picks the highlighted option, else submits the raw text;
//      Escape/blur dismisses and keeps focus on the input.
//
// Negative-control status (verified by running this file against the
// pre-fix head f3a80d1c1 before editing source): tests 4, 7, 8, 9 and the
// shrink-clamp test FAIL pre-fix at exactly the defect they pin; the
// rest are pins for behaviour that was already correct and must not
// regress. Live keyboard + screen-reader verification is owed to the
// merge pipeline / QA loop — this file proves DOM semantics, not a
// screen reader run.
// ===========================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Email } from '../types';
import { SearchSuggestions } from '../app/search/SearchSuggestions';
import type { SuggestionSections } from '../lib/searchSuggestions';

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
  error: null as Error | null,
  localHits: [] as Email[],
  refetch: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  user: { id: 'u1', email: 'me@quantmail.in' } as { id: string; email: string } | null,
}));
const labelsState = vi.hoisted(() => ({
  data: [] as Array<{ name?: string | null }>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
}));
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock('../hooks/useSearchEmails', () => ({
  useSearchEmails: () => ({ ...mailSearchState }),
}));
vi.mock('../hooks/useUniversalSearch', () => ({
  useUniversalSearch: () => ({ data: null, isLoading: false, error: null }),
}));
vi.mock('../hooks/useLabels', () => ({
  useLabels: () => ({ data: labelsState.data, isLoading: false, error: null }),
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
  SearchClearButton: ({ onClear }: { onClear: () => void }) => (
    <button type="button" aria-label="Clear search" onClick={onClear}>
      Clear
    </button>
  ),
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
  ErrorState: ({ title, message }: { title?: string; message: string }) => (
    <div data-testid="error-state" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  ),
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

const LISTBOX_ID = 'search-suggestions-listbox';
const RECENT_KEY_U1 = 'quantmail_searches.v2.u1';
const RECENT_KEY_U2 = 'quantmail_searches.v2.u2';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPage(url: string): HTMLDivElement {
  window.history.replaceState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<SearchPage />);
  });
  return container!;
}

function rerenderPage(): void {
  act(() => {
    root!.render(<SearchPage />);
  });
}

function searchInput(c: HTMLDivElement): HTMLInputElement {
  const el = c.querySelector('input[type="search"]');
  if (!(el instanceof HTMLInputElement)) throw new Error('search input not found');
  return el;
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function keyDown(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function blurToBody(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    );
  });
}

function listbox(c: HTMLDivElement): HTMLElement | null {
  return c.querySelector('[role="listbox"]');
}

function options(c: HTMLDivElement): HTMLElement[] {
  return Array.from(c.querySelectorAll('[role="option"]'));
}

function selectedOption(c: HTMLDivElement): HTMLElement | null {
  return c.querySelector('[role="option"][aria-selected="true"]');
}

beforeEach(() => {
  vi.clearAllMocks();
  mailSearchState.data = undefined;
  mailSearchState.isLoading = false;
  mailSearchState.error = null;
  mailSearchState.localHits = [];
  authState.user = { id: 'u1', email: 'me@quantmail.in' };
  labelsState.data = [];
  window.localStorage.removeItem(RECENT_KEY_U1);
  window.localStorage.removeItem(RECENT_KEY_U2);
  window.localStorage.removeItem('quantmail_recent_searches');
  window.localStorage.setItem(RECENT_KEY_U1, JSON.stringify(['invoice for October']));
  window.history.replaceState({}, '', '/search');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  window.localStorage.removeItem(RECENT_KEY_U1);
  window.localStorage.removeItem(RECENT_KEY_U2);
});

describe('SearchSuggestions options (static markup)', () => {
  const SECTIONS: SuggestionSections = {
    queries: [{ kind: 'query', label: 'invoice for October' }],
    senders: [{ kind: 'sender', label: 'invoices@acme.com' }],
    labels: [],
  };

  it('every option carries a stable id the input activedescendant can point at, in flat order', () => {
    const html = renderToStaticMarkup(
      <SearchSuggestions id="test-listbox" sections={SECTIONS} activeIndex={-1} onSelect={() => {}} />,
    );
    expect(html).toContain('id="test-listbox-option-0"');
    expect(html).toContain('id="test-listbox-option-1"');
    expect(html.indexOf('test-listbox-option-0')).toBeLessThan(
      html.indexOf('test-listbox-option-1'),
    );
  });

  it('options are not tab stops — focus stays in the input, arrows move the highlight', () => {
    const html = renderToStaticMarkup(
      <SearchSuggestions id="test-listbox" sections={SECTIONS} activeIndex={-1} onSelect={() => {}} />,
    );
    const tabStops = html.match(/tabindex="-1"/gi) ?? [];
    expect(tabStops).toHaveLength(2);
  });
});

describe('init-state: the dropdown is honestly closed/empty', () => {
  it('mount with no query renders no listbox even though account recents exist in storage', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    expect(input.value).toBe('');
    expect(listbox(c)).toBeNull();
    expect(options(c)).toHaveLength(0);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    // No listbox is rendered, so there is no controls target to reference.
    expect(input.getAttribute('aria-controls')).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('typing opens the listbox with expanded=true and controls pointing at it, nothing highlighted yet', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    expect(input.value).toBe('invo');
    const box = listbox(c);
    expect(box).not.toBeNull();
    expect(box!.id).toBe(LISTBOX_ID);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(LISTBOX_ID);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(selectedOption(c)).toBeNull();
    // Recents + quick-start example, both substring-matched on "invo".
    expect(options(c).map((o) => o.textContent)).toContain('invoice for October');
    expect(options(c).map((o) => o.textContent)).toContain('invoice');
  });

  it('clear via the ✕ button closes the dropdown and leaves no stale suggestions', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    expect(listbox(c)).not.toBeNull();
    const clear = c.querySelector('[aria-label="Clear search"]') as HTMLButtonElement;
    expect(clear).toBeTruthy();
    act(() => {
      clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(input.value).toBe('');
    expect(listbox(c)).toBeNull();
    expect(options(c)).toHaveLength(0);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('clearing by backspacing to empty closes the dropdown with no stale suggestions', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    expect(listbox(c)).not.toBeNull();
    type(input, '');
    expect(input.value).toBe('');
    expect(listbox(c)).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('the ?q= seed runs once: auth hydration must not resurrect the seed over typed text', () => {
    const c = renderPage('/search?q=invoice');
    const input = searchInput(c);
    // Seed applied on mount.
    expect(input.value).toBe('invoice');
    // The user types something else.
    type(input, 'typed-later');
    expect(input.value).toBe('typed-later');
    // Auth hydrates: accountKey changes u1 -> u2, which used to re-fire the
    // seed effect (its dep is runSearchString, which depends on accountKey)
    // and clobber the typed text with the stale ?q= value.
    authState.user = { id: 'u2', email: 'other@quantmail.in' };
    rerenderPage();
    expect(searchInput(c).value).toBe('typed-later');
  });

  it('remount with no ?q= shows no flash of the previous mount’s query or suggestions', () => {
    const c1 = renderPage('/search');
    const input1 = searchInput(c1);
    type(input1, 'invo');
    expect(listbox(c1)).not.toBeNull();
    act(() => {
      root!.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    const c2 = renderPage('/search');
    const input2 = searchInput(c2);
    expect(input2.value).toBe('');
    expect(listbox(c2)).toBeNull();
    expect(input2.getAttribute('aria-expanded')).toBe('false');
    expect(input2.getAttribute('aria-activedescendant')).toBeNull();
  });
});

describe('aria: combobox/listbox keyboard contract', () => {
  it('ArrowDown highlights options in order and activedescendant tracks each id', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    keyDown(input, 'ArrowDown');
    expect(selectedOption(c)?.textContent).toContain('invoice for October');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-0`);
    keyDown(input, 'ArrowDown');
    expect(selectedOption(c)?.textContent).toContain('invoice');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-1`);
    expect(options(c).filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('ArrowUp from no highlight lands on the LAST option, not len-2', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    expect(options(c)).toHaveLength(2);
    keyDown(input, 'ArrowUp');
    expect(selectedOption(c)?.textContent).toContain('invoice');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-1`);
  });

  it('ArrowDown on a closed-but-nonempty list reopens it on the first option', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    keyDown(input, 'Escape');
    expect(listbox(c)).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    keyDown(input, 'ArrowDown');
    expect(listbox(c)).not.toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(selectedOption(c)?.textContent).toContain('invoice for October');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-0`);
  });

  it('Escape dismisses, clears activedescendant, and keeps focus on the input', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    keyDown(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-0`);
    keyDown(input, 'Escape');
    expect(listbox(c)).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('blur outside the dropdown dismisses and clears activedescendant', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    keyDown(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-0`);
    blurToBody(input);
    expect(listbox(c)).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('Enter picks the highlighted option; with none highlighted it submits the raw text', () => {
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    keyDown(input, 'ArrowDown');
    keyDown(input, 'Enter');
    expect(input.value).toBe('invoice for October');
    expect(listbox(c)).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();

    type(input, 'invo');
    keyDown(input, 'Enter');
    expect(input.value).toBe('invo');
    expect(listbox(c)).toBeNull();
  });

  it('when the list shrinks below the highlight, the highlight resets and ArrowDown restarts at the first option', () => {
    labelsState.data = [{ name: 'Invoices' }];
    const c = renderPage('/search');
    const input = searchInput(c);
    type(input, 'invo');
    expect(options(c)).toHaveLength(3);
    keyDown(input, 'ArrowDown');
    keyDown(input, 'ArrowDown');
    keyDown(input, 'ArrowDown');
    expect(selectedOption(c)?.textContent).toContain('Invoices');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-2`);
    // Labels unload: the flattened list shrinks from 3 to 2, below the
    // highlight. The stale index must not survive — the next ArrowDown
    // restarts at option 0 instead of skipping to option 1.
    labelsState.data = [];
    rerenderPage();
    expect(options(c)).toHaveLength(2);
    expect(selectedOption(c)).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    keyDown(input, 'ArrowDown');
    expect(selectedOption(c)?.textContent).toContain('invoice for October');
    expect(input.getAttribute('aria-activedescendant')).toBe(`${LISTBOX_ID}-option-0`);
  });
});
