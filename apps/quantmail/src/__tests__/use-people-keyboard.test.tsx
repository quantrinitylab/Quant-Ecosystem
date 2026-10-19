// @vitest-environment jsdom
// ============================================================================
// usePeopleKeyboard — the Superhuman-style keyboard triage for the People home
// (the default QuantMail surface), which previously registered no bindings.
//
// Tests the pure PeopleKeyboardController (the same seam the inbox keyboard
// tests exercise) plus the PeopleList keyboard markup contract: every row
// carries `data-person-key`, the focused row gets the `is-focused` ring and
// `aria-current`, and hovering a row reports it back through `onRowFocus` so
// the pointer and the `j`/`k` cursor stay in sync.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PeopleKeyboardController, peopleCommand } from '../hooks/usePeopleKeyboard';
import { INBOX_COMMAND_REFERENCE } from '../lib/keyboard/command-registry';
import { PeopleList } from '../components/PeopleList';
import type { PersonConversation } from '../lib/peopleGrouping';
import type { Email } from '../types';
import type { MailMutations } from '../hooks/useMailMutations';
import { subscribeToToasts, type ToastMessage } from '../lib/toast-bus';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion's useReducedMotion (used by Skeleton) reads matchMedia, which
// jsdom does not implement. The shim is a test-environment concern, not product
// behaviour: reduced-motion is off so skeletons render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addListenerDeprecated: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const msg = (id: string, collapsedIds?: string[]): Email =>
  ({ id, collapsedIds, attachments: [] }) as unknown as Email;

function person(key: string, name: string, messageIds: Array<string | { id: string; collapsedIds?: string[] }>): PersonConversation {
  const messages = messageIds.map((m) =>
    typeof m === 'string' ? msg(m) : msg(m.id, m.collapsedIds),
  );
  return {
    personKey: key,
    name,
    email: `${key}@example.com`,
    messages,
    lastMessage: messages[messages.length - 1],
    lastActivityAt: new Date('2026-10-10T10:00:00Z'),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: [`${key}@example.com`],
    hasGroupMessages: false,
  } as PersonConversation;
}

const ROWS = () => [
  person('alice', 'Alice', ['m1']),
  person('bob', 'Bob', ['m2']),
  person('carol', 'Carol', ['m3']),
];

function mockMutations(): MailMutations {
  return {
    archive: vi.fn().mockResolvedValue(undefined),
    unarchive: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    toggleStar: vi.fn().mockResolvedValue(undefined),
    togglePin: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn().mockResolvedValue(undefined),
    markUnread: vi.fn().mockResolvedValue(undefined),
    moveToCategory: vi.fn().mockResolvedValue(true),
    snooze: vi.fn().mockResolvedValue(undefined),
    batch: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailMutations;
}

describe('PeopleKeyboardController', () => {
  let mutations: MailMutations;
  let receivedToasts: ToastMessage[];
  let unsubscribeToasts: () => void;

  beforeEach(() => {
    receivedToasts = [];
    unsubscribeToasts = subscribeToToasts((toast) => {
      receivedToasts.push(toast);
    });
    mutations = mockMutations();
  });

  afterEach(() => {
    unsubscribeToasts?.();
    vi.restoreAllMocks();
  });

  it('move(1) from no focus lands on the first row, move(-1) on the last', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    controller.move(1);
    expect(controller.focusedIndex).toBe(0);
    expect(controller.focusedRow?.personKey).toBe('alice');

    controller.clearFocus();
    controller.move(-1);
    expect(controller.focusedIndex).toBe(ROWS().length - 1);
    expect(controller.focusedRow?.personKey).toBe('carol');
  });

  it('move clamps at the edges instead of leaving the list', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    controller.focusRow('carol');
    controller.move(1);
    expect(controller.focusedRow?.personKey).toBe('carol');
    controller.focusRow('alice');
    controller.move(-1);
    expect(controller.focusedRow?.personKey).toBe('alice');
  });

  it('focusRow and clearFocus manage the cursor identity', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    expect(controller.focusedIndex).toBe(-1);
    controller.focusRow('bob');
    expect(controller.focusedIndex).toBe(1);
    expect(controller.focusedId).toBe('bob');
    controller.clearFocus();
    expect(controller.focusedIndex).toBe(-1);
    expect(controller.focusedRow).toBeNull();
  });

  it('move calls scrollToIndex with the new index so the cursor stays visible', () => {
    const scrollToIndex = vi.fn();
    const controller = new PeopleKeyboardController({
      rows: ROWS(),
      onOpen: vi.fn(),
      mutations,
      scrollToIndex,
    });
    controller.move(1);
    expect(scrollToIndex).toHaveBeenCalledWith(0);
    controller.move(1);
    expect(scrollToIndex).toHaveBeenCalledWith(1);
  });

  it('move is a no-op on an empty list', () => {
    const controller = new PeopleKeyboardController({ rows: [], onOpen: vi.fn(), mutations });
    controller.move(1);
    expect(controller.focusedIndex).toBe(-1);
  });

  it('idsOf reaches collapsed twins, not just the visible message id', () => {
    const rows = [person('alice', 'Alice', [{ id: 'm1', collapsedIds: ['m1-delivery'] }])];
    const controller = new PeopleKeyboardController({ rows, onOpen: vi.fn(), mutations });
    expect(controller.idsOf(rows[0])).toEqual(['m1', 'm1-delivery']);
  });

  it('archiveFocused archives every message id and records the undo snapshot', () => {
    const rows = [person('alice', 'Alice', [{ id: 'm1', collapsedIds: ['m1-delivery'] }])];
    const controller = new PeopleKeyboardController({ rows, onOpen: vi.fn(), mutations });
    controller.focusRow('alice');
    expect(controller.archiveFocused()).toBe(true);
    expect(mutations.archive).toHaveBeenCalledWith(['m1', 'm1-delivery']);
    expect(controller.lastArchivedConversation).toEqual({
      personKey: 'alice',
      ids: ['m1', 'm1-delivery'],
    });
  });

  it('archiveFocused toasts with an Undo hint so the action is reversible', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    controller.focusRow('bob');
    controller.archiveFocused();
    expect(receivedToasts.length).toBeGreaterThan(0);
    expect(receivedToasts[0].text).toContain('Undo');
  });

  it('archiveFocused returns false with no focus and fires nothing', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    expect(controller.archiveFocused()).toBe(false);
    expect(mutations.archive).not.toHaveBeenCalled();
  });

  it('undoLastArchive unarchives the recorded ids and clears the snapshot', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    controller.focusRow('alice');
    controller.archiveFocused();
    expect(controller.undoLastArchive()).toBe(true);
    expect(mutations.unarchive).toHaveBeenCalledWith(['m1']);
    expect(controller.lastArchivedConversation).toBeNull();
    // Second undo is a no-op — the action cannot be undone twice.
    expect(controller.undoLastArchive()).toBe(false);
  });

  it('updateOptions swaps the rows the cursor resolves against', () => {
    const controller = new PeopleKeyboardController({ rows: ROWS(), onOpen: vi.fn(), mutations });
    controller.focusRow('bob');
    controller.updateOptions({ rows: [person('zed', 'Zed', ['mz'])], onOpen: vi.fn(), mutations });
    expect(controller.focusedIndex).toBe(-1);
    controller.move(1);
    expect(controller.focusedRow?.personKey).toBe('zed');
  });
});

describe('peopleCommand id namespacing (scope-clobber regression)', () => {
  it('gives every triage command its own people.* id instead of the inbox.* id', () => {
    // The engine keys bindings by id: registering under the inbox's own ids
    // REPLACED the inbox's live bindings while the People home was mounted,
    // and releasing them on unmount (MailboxViewToggle -> classic inbox) left
    // `e`, `j`/`k`, `#`, `u`, `s`, `f`, `r`, `x`, `c`, `z` dead in the inbox.
    for (const reference of INBOX_COMMAND_REFERENCE) {
      if (reference.id === 'inbox.toggleSelect') continue; // People has no selection model
      const command = peopleCommand(reference.id);
      expect(command.id).toBe(reference.id.replace('inbox.', 'people.'));
      expect(command.id.startsWith('people.')).toBe(true);
    }
  });

  it('keeps the reference labels, keys and groups so the sheet cannot drift', () => {
    for (const reference of INBOX_COMMAND_REFERENCE) {
      if (reference.id === 'inbox.toggleSelect') continue;
      const command = peopleCommand(reference.id);
      expect(command.label).toBe(reference.label);
      expect(command.keys).toEqual(reference.keys);
      expect(command.group).toBe(reference.group);
    }
  });
});

describe('PeopleList keyboard markup contract', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = (props: Partial<React.ComponentProps<typeof PeopleList>> = {}) => {
    const rows = ROWS();
    act(() => {
      root = createRoot(container);
      root.render(
        <PeopleList
          conversations={rows}
          onSelect={() => {}}
          searchQuery=""
          onSearchQuery={() => {}}
          {...props}
        />,
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it('marks every row with data-person-key so the cursor can find it', () => {
    render();
    const rows = container.querySelectorAll('[data-person-key]');
    expect(rows.length).toBe(3);
    expect(rows[0].getAttribute('data-person-key')).toBe('alice');
  });

  it('renders the focused row with the is-focused ring and aria-current, others plain', () => {
    render({ focusedPersonKey: 'bob' });
    const focused = container.querySelector('[data-person-key="bob"]');
    const plain = container.querySelector('[data-person-key="alice"]');
    expect(focused?.querySelector('button')?.classList.contains('is-focused')).toBe(true);
    expect(focused?.getAttribute('aria-current')).toBe('true');
    expect(plain?.querySelector('button')?.classList.contains('is-focused')).toBe(false);
    expect(plain?.hasAttribute('aria-current')).toBe(false);
  });

  it('reports hover back through onRowFocus so pointer and cursor stay in sync', () => {
    const onRowFocus = vi.fn();
    render({ onRowFocus });
    const button = container.querySelector('[data-person-key="carol"] button');
    expect(button).not.toBeNull();
    act(() => {
      // React implements onMouseEnter on top of mouseover/mouseout, so fire
      // mouseover: a raw non-bubbling mouseenter never reaches React's root
      // listener.
      button?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(onRowFocus).toHaveBeenCalledWith('carol');
  });

  it('renders no focused row when focusedPersonKey is null', () => {
    render({ focusedPersonKey: null });
    expect(container.querySelectorAll('.is-focused').length).toBe(0);
  });
});
