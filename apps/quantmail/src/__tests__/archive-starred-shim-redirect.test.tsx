// @vitest-environment jsdom
// ============================================================================
// /archive and /starred redirect shims — regression test.
//
// Root cause: the /archive shim did router.replace('/?tab=archive') and the
// /starred shim did router.replace('/?filter=starred'). The root route renders
// the unified People home unless ?view=inbox, and the People home (PeopleHome.tsx)
// never reads `tab` or `filter` — so the keyboard "Go to archive" shortcut
// (nav.archive → /archive), the "Go to pinned" shortcut (nav.pinned →
// /?filter=starred), Quanty's deep links and the drawer entries silently
// landed on the plain People home instead of the archive shelf / starred view.
// The real `tab` and `filter` consumers (activeTab / setActiveFilters) live
// only in the classic inbox at /?view=inbox (InboxPageContent).
//
// Fix: both shims keep ?view=inbox → /?view=inbox&tab=archive and
// /?view=inbox&filter=starred. The keyboard "Go to pinned" command pushes the
// full query URL directly, so it carries ?view=inbox too.
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

vi.mock('next/navigation', () => ({
  useRouter: () => routerState,
  usePathname: () => '/',
  useSearchParams: () => ({ get: () => null }),
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

import ArchivePage from '../app/(app)/archive/page';
import StarredPage from '../app/(app)/starred/page';
import { KeyboardProvider } from '../components/KeyboardProvider';

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

describe('/archive redirect shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
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

describe('/starred redirect shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
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

describe("KeyboardProvider 'Archive' and 'Pinned' shortcuts (nav.archive, nav.pinned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
  });

  it("nav.archive routes through the /archive shim, which now lands on the real archive view", () => {
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
    // up on the classic inbox with the archive shelf open.
    expect(routerState.push).toHaveBeenCalledWith('/archive');
  });

  it("nav.pinned pushes the starred filter URL WITH ?view=inbox", () => {
    mount(
      <KeyboardProvider>
        <div />
      </KeyboardProvider>,
    );

    const pinnedCommand = capturedCommands.current.find((c) => c.id === 'nav.pinned');
    expect(pinnedCommand).toBeDefined();

    pinnedCommand!.run();
    // The shortcut pushes the query URL directly (no shim hop), so it must
    // carry ?view=inbox itself — otherwise it lands on the People home,
    // which never reads the `filter` param.
    expect(routerState.push).toHaveBeenCalledWith('/?view=inbox&filter=starred');
  });
});
