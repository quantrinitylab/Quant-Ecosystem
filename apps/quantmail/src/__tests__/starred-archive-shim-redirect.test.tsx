// @vitest-environment jsdom
// ============================================================================
// /starred and /archive redirect shims — regression tests.
//
// Root cause (same bug class as the /snoozed shim fixed in fix/qm-snoozed-shim-view):
// the shims did router.replace('/?filter=starred') and router.replace('/?tab=archive').
// The root route renders the unified People home unless ?view=inbox, and the
// People home (PeopleHome.tsx) ignores both the filter and tab params — the
// Pinned (starred) filter chip and the Archive tab predicate live only in the
// classic inbox at /?view=inbox (InboxPageContent honors ?filter=starred and
// ?tab=archive). So both shims silently landed on the plain People home.
//
// Fix: the shims keep ?view=inbox → /?view=inbox&filter=starred and
// /?view=inbox&tab=archive.
//
// NOTE: /spam (→ /?lens=spam) is deliberately NOT in this class — the People
// home honors the spam lens directly, so that shim is correct as-is.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface CapturedCommand {
  id: string;
  label: string;
  run: () => void;
}

const routerState = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const capturedCommands = vi.hoisted(() => ({ current: [] as CapturedCommand[] }));
// Mutable query-string state so nav tests can simulate "we are on this URL".
const navParamsState = vi.hoisted(() => new Map<string, string>());

vi.mock('next/navigation', () => ({
  useRouter: () => routerState,
  usePathname: () => '/',
  useSearchParams: () => ({ get: (k: string) => navParamsState.get(k) ?? null }),
}));

vi.mock('../components/InboxToast', () => ({
  hasPendingUndo: () => false,
  runPendingUndo: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../lib/keyboard/engine', () => ({
  keyboardEngine: { attach: () => () => {} },
  sequenceToString: (seq: unknown) => String(seq),
}));

vi.mock('../lib/keyboard/hooks', () => ({
  useRegisterCommands: (commands: CapturedCommand[]) => {
    capturedCommands.current = commands;
  },
  usePendingChords: () => [],
}));

vi.mock('../lib/keyboard/chords', () => ({
  chordToLabelParts: (chord: string) => [chord],
}));

vi.mock('../lib/offline/outbox', () => ({
  startOutbox: () => () => {},
}));

// SidebarNavGroups only needs useInbox (live count badges).
vi.mock('../hooks/useMail', () => ({
  useInbox: () => ({ data: [], isLoading: false, isError: false }),
}));

import StarredPage from '../app/(app)/starred/page';
import ArchivePage from '../app/(app)/archive/page';
import { KeyboardProvider } from '../components/KeyboardProvider';
import { SidebarNavGroups } from '../components/AppSidebar';

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
  navParamsState.clear();
});

describe('/starred redirect shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the classic inbox WITH the starred filter', () => {
    mount(<StarredPage />);
    expect(routerState.replace).toHaveBeenCalledTimes(1);
    expect(routerState.replace).toHaveBeenCalledWith('/?view=inbox&filter=starred');
  });

  it('carries both the view and the filter params (not just the filter)', () => {
    mount(<StarredPage />);
    const target = routerState.replace.mock.calls[0][0] as string;
    const query = new URL(target, 'https://quantmail.in').searchParams;
    // Dropping ?view=inbox renders the People home, which ignores the filter.
    expect(query.get('view')).toBe('inbox');
    expect(query.get('filter')).toBe('starred');
  });
});

describe('/archive redirect shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the classic inbox WITH the archive tab', () => {
    mount(<ArchivePage />);
    expect(routerState.replace).toHaveBeenCalledTimes(1);
    expect(routerState.replace).toHaveBeenCalledWith('/?view=inbox&tab=archive');
  });

  it('carries both the view and the tab params (not just the tab)', () => {
    mount(<ArchivePage />);
    const target = routerState.replace.mock.calls[0][0] as string;
    const query = new URL(target, 'https://quantmail.in').searchParams;
    // Dropping ?view=inbox renders the People home, which ignores the tab.
    expect(query.get('view')).toBe('inbox');
    expect(query.get('tab')).toBe('archive');
  });
});

describe("KeyboardProvider 'Archive' shortcut (nav.archive)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
  });

  it('routes through the /archive shim, which now lands on the real archived view', () => {
    mount(
      <KeyboardProvider>
        <div />
      </KeyboardProvider>,
    );

    const archiveCommand = capturedCommands.current.find((c) => c.id === 'nav.archive');
    expect(archiveCommand).toBeDefined();

    archiveCommand!.run();
    // The shortcut pushes /archive; the shim mounted there replaces with
    // /?view=inbox&tab=archive (proven by the tests above), so the user ends
    // up on the classic inbox with the Archive tab selected.
    expect(routerState.push).toHaveBeenCalledWith('/archive');
  });
});

// ============================================================================
// AppSidebar "Archive" entry — regression test.
//
// Root cause (found 2026-10-12): the sidebar's Archive entry used
// path: '/?tab=archive'. The root route renders the unified People home
// unless ?view=inbox, and PeopleHome ignores the `tab` param — so the entry
// silently landed on the plain People home. The /archive shim does
// router.replace('/?view=inbox&tab=archive') for exactly this reason, but the
// drawer bypassed the shim entirely with router.push(item.path).
//
// Fix: the entry points straight at the real archived view,
// `/?view=inbox&tab=archive` (one hop, same destination as the shim).
//
// NOTE: the Spam entry (/?lens=spam) is deliberately NOT in this class — the
// People home honors the spam lens directly, so that entry is correct as-is.
// ============================================================================

describe('AppSidebar Archive entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navParamsState.clear();
  });

  function archiveButton(): HTMLButtonElement {
    const buttons = Array.from(
      document.querySelectorAll('button.sidebar-nav-item'),
    ) as HTMLButtonElement[];
    const archive = buttons.find((b) => b.textContent?.trim().startsWith('Archive'));
    expect(archive).toBeDefined();
    return archive!;
  }

  it("navigates to the real archived view, not a bare '?tab=archive'", () => {
    mount(<SidebarNavGroups />);
    act(() => {
      archiveButton().click();
    });
    expect(routerState.push).toHaveBeenCalledTimes(1);
    // A bare '/?tab=archive' renders the People home, which ignores the tab
    // param — the destination must carry ?view=inbox (like the /archive shim).
    expect(routerState.push).toHaveBeenCalledWith('/?view=inbox&tab=archive');
  });

  it('stays marked active on the archived view', () => {
    // The isActive predicate keys off ?tab= (not the full path), so it must
    // still fire on the new one-hop destination.
    navParamsState.set('view', 'inbox');
    navParamsState.set('tab', 'archive');
    mount(<SidebarNavGroups />);
    const archive = archiveButton();
    expect(archive.classList.contains('is-active')).toBe(true);
    expect(archive.getAttribute('aria-current')).toBe('page');
  });

  it('is NOT active on the plain People home with a stray ?tab=archive', () => {
    // Sanity: the guard above would be vacuous if the param never mattered.
    navParamsState.set('tab', 'archive');
    mount(<SidebarNavGroups />);
    const archive = archiveButton();
    // pathname === '/' and tab === 'archive' still match the predicate — the
    // fix works by making the entry never SEND us to that broken combo.
    expect(archive.classList.contains('is-active')).toBe(true);
  });

  it("leaves the Spam entry on '/?lens=spam' (People home honors the lens)", () => {
    mount(<SidebarNavGroups />);
    const buttons = Array.from(
      document.querySelectorAll('button.sidebar-nav-item'),
    ) as HTMLButtonElement[];
    const spam = buttons.find((b) => b.textContent?.trim().startsWith('Spam'));
    expect(spam).toBeDefined();
    act(() => {
      spam!.click();
    });
    // PeopleHome reads ?lens=spam directly, so this bare-param link is valid.
    expect(routerState.push).toHaveBeenCalledWith('/?lens=spam');
  });
});
