'use client';

/*
 * CUST-P1-4: thread-view keyboard shortcuts were dead. The inbox registers
 * `x u s e # f` in the `inbox` scope (mounted only by app/page.tsx), so in
 * thread views (/thread/[id], /people/[personId]) those keys were silent
 * no-ops, `/` fell through to global search navigation, `r` focused the reply
 * box but leaked the typed character, and Esc had no thread binding at all.
 *
 * This hook registers the thread-scoped counterparts. Both thread views use
 * it; the scope is pushed while the view is mounted so the keys only fire in
 * a thread context and never fight the inbox bindings.
 */

import { useMemo } from 'react';
import { useRegisterCommands, useKeyboardScope } from '../lib/keyboard/hooks';
import type { Command } from '../lib/keyboard/command-registry';

/** Scope for thread-view bindings. Deeper than `global`, so `r` here wins over
 *  the global `compose.replyInline` while a thread is open. */
export const THREAD_KEYBOARD_SCOPE = 'thread';

export interface ThreadViewKeyboardActions {
  /** Archive the open conversation, then leave the thread view. */
  onArchive: () => void;
  /** Mark the open conversation unread (one-way, per the documented label). */
  onMarkUnread: () => void;
  /** Toggle star on the open conversation. */
  onToggleStar: () => void;
  /** Forward the open conversation. */
  onForward: () => void;
  /** Focus the reply input without leaking the typed key. */
  onFocusReply: () => void;
  /** Select the open conversation (returns to inbox with it selected). */
  onSelect: () => void;
  /** Close the thread view. */
  onClose: () => void;
}

/**
 * Build the thread-view command list. Exported for regression tests: the
 * definitions (ids, keys, preventDefault) are the contract.
 */
export function buildThreadViewCommands(actions: ThreadViewKeyboardActions): Command[] {
  return [
    {
      id: 'thread.archive',
      label: 'Archive conversation',
      group: 'Conversation',
      keys: 'e',
      scope: THREAD_KEYBOARD_SCOPE,
      run: () => actions.onArchive(),
    },
    {
      id: 'thread.mark-unread',
      label: 'Mark as unread',
      group: 'Conversation',
      keys: 'u',
      scope: THREAD_KEYBOARD_SCOPE,
      run: () => actions.onMarkUnread(),
    },
    {
      id: 'thread.toggle-star',
      label: 'Star conversation',
      group: 'Conversation',
      keys: 's',
      scope: THREAD_KEYBOARD_SCOPE,
      run: () => actions.onToggleStar(),
    },
    {
      id: 'thread.forward',
      label: 'Forward conversation',
      group: 'Conversation',
      keys: 'f',
      scope: THREAD_KEYBOARD_SCOPE,
      run: () => actions.onForward(),
    },
    {
      id: 'thread.focus-reply',
      label: 'Focus reply',
      group: 'Conversation',
      keys: 'r',
      scope: THREAD_KEYBOARD_SCOPE,
      // Explicit: the typed `r` must not leak into the reply body. The
      // engine defaults preventDefault to true, but this binding focuses
      // the input as its action, so the prevention is load-bearing — spell
      // it out rather than relying on the default.
      preventDefault: true,
      stopPropagation: true,
      run: () => actions.onFocusReply(),
    },
    {
      id: 'thread.select',
      label: 'Select conversation',
      group: 'Selection',
      keys: 'x',
      scope: THREAD_KEYBOARD_SCOPE,
      run: () => actions.onSelect(),
    },
    {
      id: 'thread.close',
      label: 'Close conversation',
      group: 'Navigation',
      keys: 'Escape',
      scope: THREAD_KEYBOARD_SCOPE,
      run: () => actions.onClose(),
    },
  ];
}

/**
 * Register thread-view keyboard commands for as long as the caller is
 * mounted. All bindings keep the engine default of not firing while focus is
 * inside a text input, so typing in the reply box never triggers them.
 */
export function useThreadViewKeyboard(actions: ThreadViewKeyboardActions): void {
  useKeyboardScope(THREAD_KEYBOARD_SCOPE);

  const commands = useMemo<Command[]>(() => buildThreadViewCommands(actions), [actions]);

  useRegisterCommands(commands);
}
