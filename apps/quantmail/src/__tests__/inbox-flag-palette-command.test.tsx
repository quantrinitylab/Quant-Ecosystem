// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useInboxKeyboard, type InboxKeyboardRow } from '../hooks/useInboxKeyboard';
import { getCommands } from '../lib/keyboard/command-registry';
import type { MailMutations } from '../hooks/useMailMutations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mockMutations: MailMutations = {
  archive: vi.fn(),
  unarchive: vi.fn(),
  trash: vi.fn(),
  restore: vi.fn(),
  toggleStar: vi.fn(),
  togglePin: vi.fn(),
  setFlagged: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
  moveToCategory: vi.fn(),
  snooze: vi.fn(),
  batch: vi.fn(),
};

interface ProbeProps {
  rows: InboxKeyboardRow[];
  selectedId: string | null;
}

let controllerState: any = null;

function Probe({ rows, selectedId }: ProbeProps) {
  controllerState = useInboxKeyboard({
    rows,
    selectedId,
    onOpen: () => {},
    onClose: () => {},
    onToggleSelect: () => {},
    mutations: mockMutations,
  });
  return null;
}

function renderProbe(props: ProbeProps) {
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  act(() => {
    root!.render(<Probe {...props} />);
  });
}

beforeEach(() => {
  controllerState = null;
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
});

describe('inbox flag palette command (AC-24, NIT 13)', () => {
  const rows: InboxKeyboardRow[] = [
    { id: 'm1', threadId: 't1', isRead: true, isStarred: false, isFlagged: false },
    { id: 'm2', threadId: 't2', isRead: true, isStarred: false, isFlagged: true },
  ];

  it('declares inbox.flag in Conversation with no keys and dynamic label', () => {
    renderProbe({ rows, selectedId: null });

    const commands = getCommands();
    const flagCmd = commands.find((c) => c.id === 'inbox.flag');
    expect(flagCmd).toBeDefined();
    expect(flagCmd?.group).toBe('Conversation');
    expect(flagCmd?.keys).toBeUndefined();

    // When no row is focused, it is disabled
    expect(flagCmd?.enabled?.()).toBe(false);

    // Focus first row (isFlagged: false)
    act(() => {
      controllerState.focusRow('m1');
    });

    const cmdUnflagged = getCommands().find((c) => c.id === 'inbox.flag');
    expect(cmdUnflagged?.enabled?.()).toBe(true);
    expect(cmdUnflagged?.label).toBe('Flag conversation');

    // Focus second row (isFlagged: true)
    act(() => {
      controllerState.focusRow('m2');
    });

    const cmdFlagged = getCommands().find((c) => c.id === 'inbox.flag');
    expect(cmdFlagged?.enabled?.()).toBe(true);
    expect(cmdFlagged?.label).toBe('Unflag conversation');
  });

  it('runs setFlagged with row id and toggled target when executed', () => {
    renderProbe({ rows, selectedId: null });

    act(() => {
      controllerState.focusRow('m1'); // isFlagged: false
    });

    const cmd = getCommands().find((c) => c.id === 'inbox.flag')!;
    cmd.run();
    expect(mockMutations.setFlagged).toHaveBeenCalledWith(['m1'], true);

    act(() => {
      controllerState.focusRow('m2'); // isFlagged: true
    });
    const cmd2 = getCommands().find((c) => c.id === 'inbox.flag')!;
    cmd2.run();
    expect(mockMutations.setFlagged).toHaveBeenCalledWith(['m2'], false);
  });

  it('no other command has flag or flagged in its keywords', () => {
    renderProbe({ rows, selectedId: null });

    const commands = getCommands();
    for (const cmd of commands) {
      if (cmd.id === 'inbox.flag') continue;
      const keywords = cmd.keywords ?? [];
      expect(
        keywords.includes('flag'),
        `command ${cmd.id} unexpectedly has 'flag' keyword`,
      ).toBe(false);
      expect(
        keywords.includes('flagged'),
        `command ${cmd.id} unexpectedly has 'flagged' keyword`,
      ).toBe(false);
    }
  });
});
