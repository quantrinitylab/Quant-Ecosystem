// @vitest-environment jsdom
// ============================================================================
// Sibling same-class defects of the /archive shim (fixed in the same PR).
//
// The root route renders the unified People home unless ?view=inbox, and the
// People home never reads `tab` — so every mail nav target carrying a `tab`
// (or a lens that only the classic inbox honors) must keep ?view=inbox:
//
//   1. The drawer Archive entry pushed `/?tab=archive` (same defect as the
//      /archive shim): it now pushes `/?view=inbox&tab=archive`.
//   2. The dashboard "Priority Mail" tile pushed `/?lens=important` (the
//      People home ignores every lens except spam): it now pushes
//      `/?view=inbox&lens=important`.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('Dashboard Priority Mail tile (QuantMailSuperAppHeader)', () => {
  it('pushes the important lens WITH ?view=inbox (People home ignores other lenses)', () => {
    // Vitest runs with cwd = apps/quantmail, so resolve the source by path.
    const source = readFileSync(
      join(process.cwd(), 'src/components/Navigation/QuantMailSuperAppHeader.tsx'),
      'utf8',
    );
    expect(source).toContain("router.push('/?view=inbox&lens=important')");
    // The bare-lens target rendered the People home and dropped the lens.
    expect(source).not.toContain("router.push('/?lens=important')");
  });
});
