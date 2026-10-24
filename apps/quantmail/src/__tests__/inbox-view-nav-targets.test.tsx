// @vitest-environment jsdom
// ============================================================================
// Same-class defect of the /archive shim (fixed in the same PR).
//
// The root route renders the unified People home unless ?view=inbox, and the
// People home never reads `tab` — so every mail nav target carrying a `tab`
// must keep ?view=inbox:
//
//   The drawer Archive entry pushed `/?tab=archive` (same defect as the
//   /archive shim): it now pushes `/?view=inbox&tab=archive`.
//
//   (A second case used to live here: the dashboard "Priority Mail" tile of
//   the dead QuantMailSuperAppHeader pushed `/?lens=important`. That whole
//   component was removed — no production surface ever mounted it, and the
//   live header QuantPillarTopBar already carries the mail "Important" lens
//   — so the tile case went away with the component. See
//   dead-superapp-header-removed.test.ts for the removal guard.)
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerState = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => routerState,
  usePathname: () => '/',
  useSearchParams: () => ({ get: () => null }),
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

import { AppSidebar } from '../components/AppSidebar';

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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('AppSidebar Archive drawer entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the classic inbox archive view, not the bare People home', () => {
    mount(<AppSidebar />);

    const buttons = Array.from(container!.querySelectorAll('button.sidebar-nav-item'));
    const archiveButton = buttons.find((b) => b.textContent?.includes('Archive'));
    expect(archiveButton).toBeDefined();

    act(() => {
      archiveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(routerState.push).toHaveBeenCalledWith('/?view=inbox&tab=archive');
  });

  it('carries both the view and the tab params', () => {
    mount(<AppSidebar />);

    const buttons = Array.from(container!.querySelectorAll('button.sidebar-nav-item'));
    const archiveButton = buttons.find((b) => b.textContent?.includes('Archive'));
    act(() => {
      archiveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const target = routerState.push.mock.calls[0][0] as string;
    const query = new URL(target, 'https://quantmail.in').searchParams;
    expect(query.get('view')).toBe('inbox');
    expect(query.get('tab')).toBe('archive');
  });
});
