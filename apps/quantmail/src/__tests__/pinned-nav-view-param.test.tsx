// @vitest-environment jsdom
// ============================================================================
// "Go to pinned" keyboard shortcut — regression test.
//
// Root cause: the nav.pinned command (keys `g *`) did router.push(
// '/?filter=starred'). The root route renders the unified People home unless
// ?view=inbox, and the `filter=starred` deep link is only consumed inside
// InboxPageContent (page.tsx "Deep-link support: ?filter=starred applies the
// Pinned filter chip") — so the shortcut silently landed on the People home
// with the Pinned chip never applied.
//
// Fix: the shortcut pushes '/?view=inbox&filter=starred', which renders the
// classic inbox with the Pinned filter chip applied.
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

describe("KeyboardProvider 'Go to pinned' shortcut (nav.pinned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
  });

  it('targets the classic inbox, not the bare root URL', () => {
    mount(
      <KeyboardProvider>
        <div />
      </KeyboardProvider>,
    );

    const pinnedCommand = capturedCommands.current.find((c) => c.id === 'nav.pinned');
    expect(pinnedCommand).toBeDefined();

    pinnedCommand!.run();
    expect(routerState.push).toHaveBeenCalledTimes(1);
    expect(routerState.push).toHaveBeenCalledWith('/?view=inbox&filter=starred');
  });

  it('carries both the view and the filter params (not just the filter)', () => {
    mount(
      <KeyboardProvider>
        <div />
      </KeyboardProvider>,
    );

    const pinnedCommand = capturedCommands.current.find((c) => c.id === 'nav.pinned');
    expect(pinnedCommand).toBeDefined();

    pinnedCommand!.run();
    const target = routerState.push.mock.calls[0][0] as string;
    const query = new URL(target, 'https://quantmail.in').searchParams;
    // Dropping ?view=inbox renders the People home, which never reads `filter`.
    expect(query.get('view')).toBe('inbox');
    expect(query.get('filter')).toBe('starred');
  });
});
