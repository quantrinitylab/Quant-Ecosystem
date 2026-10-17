// @vitest-environment jsdom
// ============================================================================
// /snoozed redirect shim — regression test.
//
// Root cause: the shim did router.replace('/?lens=snoozed'). The root route
// renders the unified People home unless ?view=inbox, and the People home
// (PeopleHome.tsx) honors only the spam lens — so the keyboard "Snoozed"
// shortcut (nav.snoozed → /snoozed) and Quanty's "Reading snoozed mail" deep
// link silently landed on plain INBOX people instead of the snoozed lens.
// The real snoozed lens predicate lives only in the classic inbox at
// /?view=inbox (InboxPageContent's normalizeLensParam + matchesLens).
//
// Fix: the shim keeps ?view=inbox → /?view=inbox&lens=snoozed.
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

import SnoozedPage from '../app/(app)/snoozed/page';
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

describe('/snoozed redirect shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
  });

  it('redirects to the classic inbox WITH the snoozed lens', () => {
    mount(<SnoozedPage />);
    expect(routerState.replace).toHaveBeenCalledTimes(1);
    expect(routerState.replace).toHaveBeenCalledWith('/?view=inbox&lens=snoozed');
  });

  it('carries both the view and the lens params (not just the lens)', () => {
    mount(<SnoozedPage />);
    const target = routerState.replace.mock.calls[0][0] as string;
    const query = new URL(target, 'https://quantmail.in').searchParams;
    // Dropping ?view=inbox renders the People home, which ignores the lens.
    expect(query.get('view')).toBe('inbox');
    expect(query.get('lens')).toBe('snoozed');
  });
});

describe("KeyboardProvider 'Snoozed' shortcut (nav.snoozed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCommands.current = [];
  });

  it("routes through the /snoozed shim, which now lands on the real snoozed lens", () => {
    mount(
      <KeyboardProvider>
        <div />
      </KeyboardProvider>,
    );

    const snoozedCommand = capturedCommands.current.find((c) => c.id === 'nav.snoozed');
    expect(snoozedCommand).toBeDefined();

    snoozedCommand!.run();
    // The shortcut pushes /snoozed; the shim mounted there replaces with
    // /?view=inbox&lens=snoozed (proven by the tests above), so the user ends
    // up on the classic inbox with the snoozed lens selected.
    expect(routerState.push).toHaveBeenCalledWith('/snoozed');
  });
});
