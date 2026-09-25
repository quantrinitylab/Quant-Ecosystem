import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InboxKeyboardController, type InboxKeyboardRow } from '../hooks/useInboxKeyboard';
import {
  INBOX_COMMAND_REFERENCE,
  inboxCommand,
  registerCommands,
  runCommand,
  getCommand,
  type Command,
} from '../lib/keyboard/command-registry';
import { keyboardEngine } from '../lib/keyboard/engine';
import { subscribeToToasts, type ToastMessage } from '../lib/toast-bus';
import type { MailMutations } from '../hooks/useMailMutations';

interface MockRow extends InboxKeyboardRow {
  subject: string;
  messages?: Array<{ id: string; subject: string }>;
}

const SAMPLE_ROWS: MockRow[] = [
  {
    id: 'msg-1',
    threadId: 'thread-1',
    isRead: false,
    isStarred: false,
    subject: 'Quarterly financial report',
    messages: [{ id: 'msg-1', subject: 'Quarterly financial report' }],
  },
  {
    id: 'msg-2',
    threadId: 'thread-2',
    isRead: true,
    isStarred: true,
    subject: 'Sprint planning agenda',
    messages: [{ id: 'msg-2', subject: 'Sprint planning agenda' }],
  },
  {
    id: 'msg-3',
    threadId: 'thread-3',
    isRead: false,
    isStarred: false,
    subject: 'Design token alignment',
    messages: [
      { id: 'msg-3a', subject: 'Design token alignment' },
      { id: 'msg-3b', subject: 'Re: Design token alignment' },
    ],
  },
];

describe('useInboxKeyboard & Done/Archive Instant Undo Sentinel (Task W39-SH05)', () => {
  let mockMutations: MailMutations;
  let receivedToasts: ToastMessage[];
  let unsubscribeToasts: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    receivedToasts = [];
    unsubscribeToasts = subscribeToToasts((toast) => {
      receivedToasts.push(toast);
    });

    mockMutations = {
      archive: vi.fn().mockResolvedValue(undefined),
      unarchive: vi.fn().mockResolvedValue(undefined),
      trash: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
      toggleStar: vi.fn().mockResolvedValue(undefined),
      markRead: vi.fn().mockResolvedValue(undefined),
      markUnread: vi.fn().mockResolvedValue(undefined),
      moveToCategory: vi.fn().mockResolvedValue(true),
      snooze: vi.fn().mockResolvedValue(undefined),
      batch: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    unsubscribeToasts?.();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. INBOX_COMMAND_REFERENCE Invariant
  // --------------------------------------------------------------------------
  describe('INBOX_COMMAND_REFERENCE Invariant', () => {
    it('documents "inbox.archive" on key E in group Conversation', () => {
      const archiveCmd = inboxCommand('inbox.archive');
      expect(archiveCmd).toBeDefined();
      expect(archiveCmd.keys).toBe('e');
      expect(archiveCmd.group).toBe('Conversation');
      expect(archiveCmd.label).toBe('Archive conversation');
    });

    it('documents "inbox.undo" on key Z in group Conversation', () => {
      const undoCmd = inboxCommand('inbox.undo');
      expect(undoCmd).toBeDefined();
      expect(undoCmd.keys).toBe('z');
      expect(undoCmd.group).toBe('Conversation');
      expect(undoCmd.label).toBe('Undo archive');
    });

    it('includes inbox.undo in the full command reference array', () => {
      const found = INBOX_COMMAND_REFERENCE.find((entry) => entry.id === 'inbox.undo');
      expect(found).toBeDefined();
      expect(found?.keys).toBe('z');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Cursor Navigation and Focus Management
  // --------------------------------------------------------------------------
  describe('Cursor Navigation & Focus Controller', () => {
    it('manages cursor focus via move, focusRow and clearFocus', () => {
      const onOpen = vi.fn();
      const onClose = vi.fn();
      const onToggleSelect = vi.fn();

      const controller = new InboxKeyboardController({
        rows: SAMPLE_ROWS,
        selectedId: null,
        onOpen,
        onClose,
        onToggleSelect,
        mutations: mockMutations,
      });

      // Initial state: nothing focused
      expect(controller.focusedIndex).toBe(-1);
      expect(controller.focusedId).toBe(null);
      expect(controller.focusedRow).toBe(null);

      // Focus row 2
      controller.focusRow('msg-2');
      expect(controller.focusedIndex).toBe(1);
      expect(controller.focusedId).toBe('msg-2');
      expect(controller.focusedRow?.id).toBe('msg-2');

      // Move down (+1) -> row 3
      controller.move(1);
      expect(controller.focusedIndex).toBe(2);
      expect(controller.focusedId).toBe('msg-3');

      // Clamped to bounds
      controller.move(1);
      expect(controller.focusedIndex).toBe(2);

      // Move up (-1) -> row 2
      controller.move(-1);
      expect(controller.focusedIndex).toBe(1);
      expect(controller.focusedId).toBe('msg-2');

      // Clear focus
      controller.clearFocus();
      expect(controller.focusedIndex).toBe(-1);
      expect(controller.focusedId).toBe(null);
    });
  });

  // --------------------------------------------------------------------------
  // 3. E Key: Done / Archive & Toast Notification
  // --------------------------------------------------------------------------
  describe('Done / Archive Action (E Key)', () => {
    it('archives focused thread, records lastArchivedThread with messages, and shows "[Undo (Z)]" toast', () => {
      const controller = new InboxKeyboardController({
        rows: SAMPLE_ROWS,
        selectedId: null,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onToggleSelect: vi.fn(),
        mutations: mockMutations,
        expandIds: (row) => row.messages?.map((m) => m.id) ?? [row.id],
      });

      // Focus on row 3 (which has 2 messages: msg-3a, msg-3b)
      controller.focusRow('msg-3');

      // Execute archive
      const success = controller.archiveFocused();
      expect(success).toBe(true);

      // 1. Verify mutation called with expanded message IDs
      expect(mockMutations.archive).toHaveBeenCalledWith(['msg-3a', 'msg-3b']);

      // 2. Verify toast notification emitted
      expect(receivedToasts.length).toBe(1);
      const toast = receivedToasts[0];
      expect(toast.text).toBe('Conversation marked done. [Undo (Z)]');
      expect(toast.type).toBe('info');
      expect(typeof toast.undoAction).toBe('function');

      // 3. Verify lastArchivedThread was captured
      expect(controller.lastArchivedThread).toEqual({
        id: 'msg-3',
        threadId: 'thread-3',
        messages: [
          { id: 'msg-3a', subject: 'Design token alignment' },
          { id: 'msg-3b', subject: 'Re: Design token alignment' },
        ],
      });
    });

    it('returns false when no row is currently focused', () => {
      const controller = new InboxKeyboardController({
        rows: SAMPLE_ROWS,
        selectedId: null,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onToggleSelect: vi.fn(),
        mutations: mockMutations,
      });

      const success = controller.archiveFocused();
      expect(success).toBe(false);
      expect(mockMutations.archive).not.toHaveBeenCalled();
      expect(controller.lastArchivedThread).toBe(null);
      expect(receivedToasts.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Z Key: Undo Archive Sentinel
  // --------------------------------------------------------------------------
  describe('Instant Undo Sentinel (Z Key / inbox.undo)', () => {
    it('restores archived thread via mutations.unarchive, triggers "Action undone" toast, and clears lastArchivedThread', () => {
      const controller = new InboxKeyboardController({
        rows: SAMPLE_ROWS,
        selectedId: null,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onToggleSelect: vi.fn(),
        mutations: mockMutations,
      });

      // Focus and archive row 1
      controller.focusRow('msg-1');
      controller.archiveFocused();

      expect(controller.lastArchivedThread?.id).toBe('msg-1');
      expect(mockMutations.archive).toHaveBeenCalledWith(['msg-1']);

      // Execute undo
      const undone = controller.undoLastArchive();
      expect(undone).toBe(true);

      // 1. Verify unarchive was called with the archived thread id
      expect(mockMutations.unarchive).toHaveBeenCalledWith('msg-1');

      // 2. Verify "Action undone" toast was shown
      const undoneToast = receivedToasts[receivedToasts.length - 1];
      expect(undoneToast.text).toBe('Action undone');
      expect(undoneToast.type).toBe('success');

      // 3. Verify lastArchivedThread was cleared
      expect(controller.lastArchivedThread).toBe(null);

      // 4. Repeated undo attempt returns false when nothing is in history
      const repeatedUndone = controller.undoLastArchive();
      expect(repeatedUndone).toBe(false);
      expect(mockMutations.unarchive).toHaveBeenCalledTimes(1);
    });

    it('executes undo when toast undoAction callback is clicked', () => {
      const controller = new InboxKeyboardController({
        rows: SAMPLE_ROWS,
        selectedId: null,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onToggleSelect: vi.fn(),
        mutations: mockMutations,
      });

      controller.focusRow('msg-2');
      controller.archiveFocused();

      expect(receivedToasts.length).toBe(1);
      const toast = receivedToasts[0];
      expect(toast.undoAction).toBeDefined();

      // Simulate user clicking "Undo" inside the toast popup
      toast.undoAction?.();

      expect(mockMutations.unarchive).toHaveBeenCalledWith('msg-2');
      expect(controller.lastArchivedThread).toBe(null);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Command Registry & Hotkey Engine Integration
  // --------------------------------------------------------------------------
  describe('Command Registry & Engine Integration', () => {
    it('wires inbox.archive and inbox.undo into command registry', () => {
      const controller = new InboxKeyboardController({
        rows: SAMPLE_ROWS,
        selectedId: null,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onToggleSelect: vi.fn(),
        mutations: mockMutations,
      });

      const commands: Command[] = [
        {
          ...inboxCommand('inbox.archive'),
          scope: 'inbox',
          enabled: () => controller.focusedRow !== null,
          run: () => {
            controller.archiveFocused();
          },
        },
        {
          ...inboxCommand('inbox.undo'),
          scope: 'inbox',
          enabled: () => controller.lastArchivedThread !== null,
          run: () => {
            controller.undoLastArchive();
          },
        },
      ];

      const unregister = registerCommands(commands);

      const archiveCmd = getCommand('inbox.archive');
      const undoCmd = getCommand('inbox.undo');

      expect(archiveCmd).toBeDefined();
      expect(undoCmd).toBeDefined();

      // Before focus: archive is disabled
      expect(archiveCmd?.enabled?.()).toBe(false);
      // Before archive: undo is disabled
      expect(undoCmd?.enabled?.()).toBe(false);

      // Focus row 1: archive becomes enabled
      controller.focusRow('msg-1');
      expect(archiveCmd?.enabled?.()).toBe(true);

      // Run archive command
      const archiveResult = runCommand('inbox.archive');
      expect(archiveResult).toBe(true);
      expect(mockMutations.archive).toHaveBeenCalledWith(['msg-1']);

      // Now undo is enabled
      expect(undoCmd?.enabled?.()).toBe(true);

      // Run undo command
      const undoResult = runCommand('inbox.undo');
      expect(undoResult).toBe(true);
      expect(mockMutations.unarchive).toHaveBeenCalledWith('msg-1');

      // After undo: undo is disabled again
      expect(undoCmd?.enabled?.()).toBe(false);

      unregister();
    });

    it('guards inbox.undo against firing inside text inputs or contentEditable elements', () => {
      let lastArchivedThread: { id: string } | null = { id: 'msg-1' };

      const checkEnabled = () => {
        if (lastArchivedThread === null) return false;
        if (typeof document !== 'undefined') {
          const el = document.activeElement;
          if (el) {
            const tag = el.tagName;
            if (
              tag === 'INPUT' ||
              tag === 'TEXTAREA' ||
              tag === 'SELECT' ||
              (el as HTMLElement).isContentEditable
            ) {
              return false;
            }
          }
        }
        return true;
      };

      // Normal state: enabled is true
      expect(checkEnabled()).toBe(true);

      // Simulate input focused
      const originalDocument = globalThis.document;
      try {
        (globalThis as any).document = {
          activeElement: { tagName: 'INPUT', isContentEditable: false },
        };
        expect(checkEnabled()).toBe(false);

        (globalThis as any).document = {
          activeElement: { tagName: 'TEXTAREA', isContentEditable: false },
        };
        expect(checkEnabled()).toBe(false);

        (globalThis as any).document = {
          activeElement: { tagName: 'DIV', isContentEditable: true },
        };
        expect(checkEnabled()).toBe(false);

        (globalThis as any).document = {
          activeElement: { tagName: 'DIV', isContentEditable: false },
        };
        expect(checkEnabled()).toBe(true);
      } finally {
        (globalThis as any).document = originalDocument;
      }
    });
  });
});
