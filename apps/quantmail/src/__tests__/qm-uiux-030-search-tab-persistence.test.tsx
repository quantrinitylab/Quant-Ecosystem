// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-030 — Search text must not persist across app tabs (regression pins).
//
// Ledger finding (2026-10-08 customer audit): QuantPillarTopBar held
// `internalSearch` via one-time useState and lives in layout-level AppShell,
// which does not remount on tab switches — so Mail → Calendar → Drive left
// the previous tab's query sitting in the search box while the new page's
// own searchQuery was empty.
//
// PREMISE RE-VERIFIED 2026-10-10 on current main: the remedy the ledger
// requires ("clear on tab switch") is ALREADY on main — commit 1b5d7713e
// (QM-SCREEN-026) added a pillar-change effect that clears internalSearch
// and calls onSearchChange(''), and a sync effect keeps the controlled
// value aligned with the page's `searchValue`. All four pillar pages
// (inbox, calendar, drive, contacts) pass their own searchValue plus a
// stable setState setter, and AppShell's desktop input / mobile row are
// fully controlled by that same prop. These tests therefore PASS on the
// current code — they are pins, not a fix. They exist because the older
// quant-pillar-topbar suite renders with renderToStaticMarkup, where
// effects never run, so it structurally cannot catch this regression.
//
// Semantics pinned: clear-on-switch is destructive by design — switching
// away clears the query (and the parent page's search state with it), so
// navigating BACK to the first tab does not resurrect the old text.
//
// Which test guards which mechanism (all verified by negative control):
// the pillar-clear effect is pinned by the uncontrolled and back-nav
// tests — disable it and both go red. The controlled sync effect is
// pinned by the same-tab external-change test — disable it and that test
// goes red. The cross-pillar controlled swap passes if EITHER mechanism
// is alive; it pins the end-to-end AppShell contract, not one effect.
//
// The canvas-painted visual children (app marks, Quanty ghost, account
// menu, QuantGit modal) are stubbed inert: they carry no search behaviour
// and their real import graph OOMs jsdom workers. Everything under test —
// internalSearch state, the sync/clear effects, the real input — is the
// production component code.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuantPillarTopBar } from '../components/QuantPillarTopBar';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let mockPathname = '/';
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../providers/auth-provider', () => ({
  useOptionalAuth: () => ({
    user: { id: 'u1', email: 'test@quantmail.in', displayName: 'Test User', username: 'test' },
    logout: vi.fn(),
  }),
  useAuth: () => {
    throw new Error('useAuth must be used within an AuthProvider');
  },
}));

vi.mock('../components/QuantMailLogo', () => ({ QuantMailLogo: () => null }));
vi.mock('../components/QuantCalendarLogo', () => ({ QuantCalendarLogo: () => null }));
vi.mock('../components/QuantDriveLogo', () => ({ QuantDriveLogo: () => null }));
vi.mock('../components/QuantContactsLogo', () => ({ QuantContactsLogo: () => null }));
vi.mock('../components/QuantGitLogo', () => ({ QuantGitLogo: () => null }));
vi.mock('../components/QuantGitUserIdModal', () => ({ QuantGitUserIdModal: () => null }));
vi.mock('../components/Quanty', () => ({ Quanty: () => null }));
vi.mock('../components/AccountBadge', () => ({ AccountBadge: () => null }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  act(() => {
    root!.render(ui);
  });
  return host;
}

function searchInput(): HTMLInputElement {
  const el = document.getElementById('quant-pillar-search-input');
  if (!(el instanceof HTMLInputElement)) throw new Error('search input not found');
  return el;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
  mockPathname = '/';
  vi.clearAllMocks();
});

describe('QM-UIUX-030 — search text must not persist across app tabs', () => {
  it('uncontrolled: a query typed on Mail is gone after switching to the Calendar tab', () => {
    mockPathname = '/';
    render(<QuantPillarTopBar />);
    type(searchInput(), 'quarterly invoice');
    expect(searchInput().value).toBe('quarterly invoice');

    // Tab switch: the bar does not remount — the same instance re-renders
    // under the new route, which is exactly the audit's failure shape.
    mockPathname = '/calendar';
    render(<QuantPillarTopBar />);
    expect(searchInput().value).toBe('');
  });

  it('controlled: the new page\u2019s empty searchValue replaces the old tab\u2019s query', () => {
    // This is the real AppShell composition: every page passes its own
    // searchValue plus a stable setState setter as onSearchChange.
    mockPathname = '/';
    const onSearchChange = vi.fn();
    render(
      <QuantPillarTopBar searchValue="quarterly invoice" onSearchChange={onSearchChange} />,
    );
    expect(searchInput().value).toBe('quarterly invoice');

    mockPathname = '/drive';
    render(<QuantPillarTopBar searchValue="" onSearchChange={onSearchChange} />);
    expect(searchInput().value).toBe('');
  });

  it('controlled: a same-tab external searchValue change is reflected in the box', () => {
    // Pages also clear/replace their query without any navigation — e.g.
    // Drive's breadcrumb handler calls setSearchQuery('') in place. The
    // box must follow the page's value on the SAME tab, which only the
    // controlled sync effect can do (no pillar change ever happens here).
    mockPathname = '/drive';
    const onSearchChange = vi.fn();
    render(
      <QuantPillarTopBar searchValue="quarterly invoice" onSearchChange={onSearchChange} />,
    );
    expect(searchInput().value).toBe('quarterly invoice');

    render(<QuantPillarTopBar searchValue="" onSearchChange={onSearchChange} />);
    expect(searchInput().value).toBe('');
  });

  it('typing still drives the current page\u2019s search exactly as before (preservation)', () => {
    mockPathname = '/';
    const onSearchChange = vi.fn();
    render(<QuantPillarTopBar onSearchChange={onSearchChange} />);
    type(searchInput(), 'alice');
    expect(onSearchChange).toHaveBeenCalledWith('alice');
    expect(searchInput().value).toBe('alice');
  });

  it('clear-on-switch semantics: navigating back does not resurrect the cleared query', () => {
    mockPathname = '/';
    const onSearchChange = vi.fn();
    render(<QuantPillarTopBar onSearchChange={onSearchChange} />);
    type(searchInput(), 'quarterly invoice');
    expect(searchInput().value).toBe('quarterly invoice');

    mockPathname = '/calendar';
    render(<QuantPillarTopBar onSearchChange={onSearchChange} />);
    expect(searchInput().value).toBe('');
    // The parent page is told its query is gone too — the two never disagree.
    expect(onSearchChange).toHaveBeenCalledWith('');

    mockPathname = '/';
    render(<QuantPillarTopBar onSearchChange={onSearchChange} />);
    expect(searchInput().value).toBe('');
  });
});
