// @vitest-environment jsdom
// ============================================================================
// Drawer Inbox entry `view=inbox`-drop defect (same class as the fixed
// sidebar/bottom-nav Inbox tabs and the /archive shim, fixed in the same
// lineage — see inbox-view-nav-targets.test.tsx).
//
// The root route renders the unified People home unless ?view=inbox, so the
// drawer Inbox entry pushing bare `/` opened the People view instead of the
// classic inbox. It now pushes `/?view=inbox&lens=all` (the inbox normalizes
// `lens=all` to its default all lens), and its active state tracks the
// classic-inbox view — not the bare People home — so the item no longer
// lights up on `/` while navigating somewhere else.
//
// R2 NOTE: this is a re-dispatch of PR #1703. That PR's gate/full-sweep/
// quantmail-e2e/Dep-audit failures were investigated before re-applying:
// gate, full-sweep and quantmail-e2e FAIL on origin/main's own head too, and
// the Dep-audit failure is repo-wide transitive dependency vulnerabilities
// (sanitize-html, vite, next, zod, nodemailer, …) untouched by this change.
// Nothing in those failures traces to the two files changed here, so the fix
// is re-applied unchanged in substance on fresh origin/main.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navState = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new Map<string, string>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navState,
  usePathname: () => '/',
  useSearchParams: () => ({
    get: (key: string) => navState.params.get(key) ?? null,
  }),
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({ quota: null, known: false, usedPct: 0 }),
}));

vi.mock('../components/QuantMailLogo', () => ({
  QuantMailLogo: () => null,
}));

vi.mock('../components/BrandWordmark', () => ({
  BrandWordmark: () => null,
}));

vi.mock('../components/AccountBadge', () => ({
  AccountBadge: () => null,
}));

vi.mock('../hooks/useMail', () => ({
  useInbox: () => ({ data: [] }),
}));

import { AppSidebar, NAV_GROUPS } from '../components/AppSidebar';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
}

function inboxButton(): HTMLButtonElement {
  const buttons = Array.from(
    container!.querySelectorAll('button.sidebar-nav-item'),
  );
  const button = buttons.find((b) => b.textContent?.includes('Inbox'));
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('AppSidebar Inbox drawer entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navState.params.clear();
  });

  it('navigates to the classic inbox, not the bare People home', () => {
    mount(<AppSidebar />);

    act(() => {
      inboxButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(navState.push).toHaveBeenCalledWith('/?view=inbox&lens=all');
    expect(navState.push).not.toHaveBeenCalledWith('/');
  });

  it('carries both the view and the all-lens params', () => {
    mount(<AppSidebar />);

    act(() => {
      inboxButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const target = navState.push.mock.calls[0][0] as string;
    const query = new URL(target, 'https://quantmail.in').searchParams;
    expect(query.get('view')).toBe('inbox');
    expect(query.get('lens')).toBe('all');
  });

  it('declares the classic-inbox target in NAV_GROUPS (data-level guard)', () => {
    const mailGroup = NAV_GROUPS.find((g) => g.label === 'Mail')!;
    const inbox = mailGroup.items.find((item) => item.id === 'inbox')!;
    expect(inbox.path).toBe('/?view=inbox&lens=all');
    expect(inbox.view).toBe('inbox');
  });

  it('is active on the classic inbox with lens=all', () => {
    navState.params.set('view', 'inbox');
    navState.params.set('lens', 'all');
    mount(<AppSidebar />);

    expect(inboxButton().className).toContain('is-active');
  });

  it('is active on the classic inbox with no lens param (default all lens)', () => {
    navState.params.set('view', 'inbox');
    mount(<AppSidebar />);

    expect(inboxButton().className).toContain('is-active');
  });

  it('is NOT active on the bare People home', () => {
    mount(<AppSidebar />);

    expect(inboxButton().className).not.toContain('is-active');
  });

  it('is NOT active on the classic inbox archive tab', () => {
    navState.params.set('view', 'inbox');
    navState.params.set('tab', 'archive');
    mount(<AppSidebar />);

    expect(inboxButton().className).not.toContain('is-active');
  });
});
