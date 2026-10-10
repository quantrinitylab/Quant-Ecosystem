// ============================================================================
// CUST-P1-4 regression: thread-view keyboard shortcuts.
// ============================================================================
//
// In thread views (/thread/[id], /people/[personId]) the documented keys
// `x u s e f` were silent no-ops (the inbox registers them in the `inbox`
// scope only), `r` focused the reply box but leaked the typed `r` into the
// body, and Esc had no thread binding at all.
//
// These tests drive the real keyboard engine with the real thread-view
// command definitions: simulate a keydown, assert the documented action
// fired, and assert the key never leaks (defaultPrevented).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildThreadViewCommands,
  THREAD_KEYBOARD_SCOPE,
  type ThreadViewKeyboardActions,
} from '../hooks/useThreadViewKeyboard';
import { keyboardEngine } from '../lib/keyboard/engine';
import { registerCommands } from '../lib/keyboard/command-registry';

/** Minimal KeyboardEvent stand-in with a working preventDefault. */
function fakeKeydown(key: string, target: unknown = null) {
  let prevented = false;
  let stopped = false;
  return {
    key,
    code: `Key${key.toUpperCase()}`,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 27,
    defaultPrevented: false,
    target,
    preventDefault() {
      prevented = true;
      (this as { defaultPrevented: boolean }).defaultPrevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
    wasPrevented: () => prevented,
    wasStopped: () => stopped,
  };
}

function makeActions(): ThreadViewKeyboardActions & Record<string, ReturnType<typeof vi.fn>> {
  return {
    onArchive: vi.fn(),
    onMarkUnread: vi.fn(),
    onToggleStar: vi.fn(),
    onForward: vi.fn(),
    onFocusReply: vi.fn(),
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('useThreadViewKeyboard (CUST-P1-4)', () => {
  let actions: ReturnType<typeof makeActions>;
  let release: (() => void) | null = null;
  let releaseScope: (() => void) | null = null;

  beforeEach(() => {
    actions = makeActions();
    // Register the real thread commands against the real engine, and push
    // the thread scope the way the hook does while a thread view is mounted.
    release = registerCommands(buildThreadViewCommands(actions));
    releaseScope = keyboardEngine.pushScope(THREAD_KEYBOARD_SCOPE);
  });

  afterEach(() => {
    releaseScope?.();
    releaseScope = null;
    release?.();
    release = null;
  });

  function press(key: string) {
    const event = fakeKeydown(key);
    // Drive the engine's real dispatch path.
    (keyboardEngine as unknown as { handleKeyDown(e: unknown): void }).handleKeyDown(event);
    return event;
  }

  it('binds every documented thread key to its action', () => {
    const commands = buildThreadViewCommands(actions);
    const byKey = new Map(commands.map((c) => [Array.isArray(c.keys) ? c.keys[0] : c.keys, c.id]));
    expect(byKey.get('e')).toBe('thread.archive');
    expect(byKey.get('u')).toBe('thread.mark-unread');
    expect(byKey.get('s')).toBe('thread.toggle-star');
    expect(byKey.get('f')).toBe('thread.forward');
    expect(byKey.get('r')).toBe('thread.focus-reply');
    expect(byKey.get('x')).toBe('thread.select');
    expect(byKey.get('Escape')).toBe('thread.close');
  });

  it('`e` archives the open conversation', () => {
    press('e');
    expect(actions.onArchive).toHaveBeenCalledTimes(1);
  });

  it('`u` marks the open conversation unread', () => {
    press('u');
    expect(actions.onMarkUnread).toHaveBeenCalledTimes(1);
  });

  it('`s` toggles star on the open conversation', () => {
    press('s');
    expect(actions.onToggleStar).toHaveBeenCalledTimes(1);
  });

  it('`f` forwards the open conversation', () => {
    press('f');
    expect(actions.onForward).toHaveBeenCalledTimes(1);
  });

  it('`r` focuses reply WITHOUT leaking the character', () => {
    const event = press('r');
    expect(actions.onFocusReply).toHaveBeenCalledTimes(1);
    // The typed `r` must not reach the newly focused input.
    expect(event.wasPrevented()).toBe(true);
    expect(event.wasStopped()).toBe(true);
  });

  it('`x` selects the open conversation', () => {
    press('x');
    expect(actions.onSelect).toHaveBeenCalledTimes(1);
  });

  it('Esc closes the thread view', () => {
    press('Escape');
    expect(actions.onClose).toHaveBeenCalledTimes(1);
  });

  it('thread keys do not fire when the thread scope is not active', () => {
    releaseScope?.();
    releaseScope = null;
    press('e');
    press('u');
    press('s');
    press('f');
    press('r');
    press('x');
    press('Escape');
    for (const fn of Object.values(actions)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('`r` carries an explicit preventDefault so the focus-then-type race cannot leak', () => {
    const focusReply = buildThreadViewCommands(actions).find((c) => c.id === 'thread.focus-reply');
    expect(focusReply?.preventDefault).toBe(true);
    expect(focusReply?.stopPropagation).toBe(true);
  });
});
