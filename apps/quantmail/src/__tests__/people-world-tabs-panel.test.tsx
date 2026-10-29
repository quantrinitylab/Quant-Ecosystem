// @vitest-environment jsdom
// ============================================================================
// fix/qm-peopleworldtabs-aria — end-to-end tabs/panel wiring.
//
// Regression coverage for the [inbox-people] P2: PeopleWorldTabs emitted
// aria-controls="world-panel-<key>" while no element with such an id existed
// anywhere, so assistive tech announced tab controls pointing at nothing.
//
// This renders the REAL PeopleHome with the REAL PeopleWorldTabs (only the
// network/shell layers are mocked, as in people-home-pagination.test.tsx)
// and proves, in one document, that every tab's aria-controls resolves to
// the one shared panel, and that the panel's label follows the active tab.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({}),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { email: 'me@quantmail.in' } }),
}));

const useInboxMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useInbox', () => ({ useInbox: useInboxMock }));

const mutationsMock = vi.hoisted(() => ({
  archive: vi.fn(),
  unarchive: vi.fn(),
  trash: vi.fn(),
  toggleStar: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
}));
vi.mock('../hooks/useMailMutations', () => ({
  useMailMutations: () => mutationsMock,
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => null,
}));

vi.mock('../components/MailboxViewToggle', () => ({
  MailboxViewToggle: () => null,
}));

import { PeopleHome } from '../components/PeopleHome';

let root: Root | null = null;
function renderHome(): HTMLElement {
  useInboxMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<PeopleHome />);
  });
  return container;
}
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('PeopleHome world tabs/panel wiring', () => {
  it('every tab aria-controls resolves to the one shared tabpanel', () => {
    const container = renderHome();
    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel).not.toBeNull();
    expect(panel!.id).toBe('people-world-panel');
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      const controls = tab.getAttribute('aria-controls');
      expect(controls).toBe('people-world-panel');
      // The IDREF must resolve in the same document — no dangling controls.
      expect(document.getElementById(controls!)).toBe(panel);
    }
  });

  it('the panel is labelled by the active tab', () => {
    const container = renderHome();
    const panel = container.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe('world-tab-log');
    const labelledBy = document.getElementById(panel.getAttribute('aria-labelledby')!);
    expect(labelledBy).not.toBeNull();
    expect(labelledBy!.getAttribute('aria-selected')).toBe('true');
  });

  it('switching worlds re-labels the panel to the newly active tab', () => {
    const container = renderHome();
    const groupsTab = container.querySelector('[data-testid="world-tab-groups"]')!;
    act(() => {
      groupsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const panel = container.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe('world-tab-groups');
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    for (const tab of tabs) {
      expect(document.getElementById(tab.getAttribute('aria-controls')!)).toBe(panel);
    }
  });
});
