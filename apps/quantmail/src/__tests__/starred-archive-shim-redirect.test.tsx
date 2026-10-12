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

import StarredPage from '../app/starred/page';
import ArchivePage from '../app/archive/page';
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
