// @vitest-environment jsdom
// ============================================================================
// Contact notes autosave correctness (CODEX R3, PR #1573).
//
// The pre-fix editor had two silent-loss / stale-write defects, both behind
// effects and timers, so the static-markup suite could not catch them:
//
// 1. Unmount loss: the debounce effect's cleanup cleared the pending timer,
//    so switching contacts (the editor is keyed by contact id) or closing
//    the sheet within the 800ms window dropped the draft without saving.
//    The fix flushes any draft that differs from the last saved value on
//    unmount, chained behind any in-flight save.
// 2. Unsequenced saves: one fetch per timer with no ordering, so a slow
//    older save completing after a newer one regressed saved/previous/
//    status (and could overwrite newer text server-side). The fix runs
//    saves through a promise chain in issue order, skips a save superseded
//    while queued, and ignores stale completions.
//
// These tests mount the real editor under fake timers and drive real typing,
// so they fail on the pre-fix code (unmount drops the draft; the queued
// save fires out of order / the stale completion regresses state).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ContactNotesEditor } from '../app/contacts/components/ContactsSubViews';

interface Mounted {
  container: HTMLElement;
  textarea: HTMLTextAreaElement;
  unmount: () => Promise<void>;
  type: (text: string) => Promise<void>;
  advance: (ms: number) => Promise<void>;
  statusText: () => string;
}

async function mountEditor(
  initialNotes: string,
  onSave: (notes: string) => Promise<void>,
): Promise<Mounted> {
  const { act } = await import('react');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ContactNotesEditor initialNotes={initialNotes} onSave={onSave} />);
  });
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  expect(textarea).not.toBeNull();

  const type = async (text: string) => {
    await act(async () => {
      // React controlled inputs ignore a plain assignment; the native
      // setter + input event is what makes onChange fire.
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(textarea),
        'value',
      )?.set;
      setter?.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const advance = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
    // Flush the promise chain (save fetch resolutions, queued saves).
    await act(async () => {});
  };
  return {
    container,
    textarea,
    type,
    advance,
    statusText: () =>
      container.querySelector('[role="status"]')?.textContent ?? '',
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      // Flush the unmount flush's chained save.
      await act(async () => {});
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('ContactNotesEditor unmount flush (switch/close within 800ms)', () => {
  it('flushes a draft on unmount before the debounce fires', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    const m = await mountEditor('', onSave);
    await m.type('Met at Conf');
    // Inside the debounce window: no save has fired yet.
    await m.advance(100);
    expect(onSave).not.toHaveBeenCalled();
    // Switching contacts / closing the sheet unmounts the keyed editor.
    await m.unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Met at Conf');
  });

  it('does not flush on unmount when the draft already equals the saved value', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    const m = await mountEditor('Met at Conf', onSave);
    await m.unmount();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('flushes a draft on unmount even after a previous save failed', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const m = await mountEditor('', onSave);
    await m.type('Met at Conf');
    await m.advance(800);
    expect(m.statusText()).toContain('Couldn’t save');
    // No new keystroke: closing must still retry the kept draft, not drop it.
    await m.unmount();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith('Met at Conf');
  });
});

describe('ContactNotesEditor save sequencing (slow older / fast newer)', () => {
  it('A-slow/B-fast: server sees A then B, final state is B (no stale regression)', async () => {
    let resolveFirst: (() => void) | null = null;
    let callCount = 0;
    const onSave = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<void>((res) => {
          resolveFirst = res;
        });
      }
      return Promise.resolve();
    });
    const m = await mountEditor('', onSave);
    await m.type('first');
    await m.advance(800);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('first');

    // A second edit while the first save is still in flight: the newer
    // save queues behind it instead of racing it.
    await m.type('second');
    await m.advance(800);
    expect(onSave).toHaveBeenCalledTimes(1);

    // The slow first save completes; only then does the newer save fire,
    // and it — not the stale completion — owns the final state.
    const { act } = await import('react');
    await act(async () => {
      resolveFirst?.();
    });
    await m.advance(0);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(1, 'first');
    expect(onSave).toHaveBeenNthCalledWith(2, 'second');
    expect(m.textarea.value).toBe('second');
    expect(m.statusText()).toBe('Saved');
  });

  it('a save superseded while queued never hits the network', async () => {
    let resolveFirst: (() => void) | null = null;
    let callCount = 0;
    const onSave = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<void>((res) => {
          resolveFirst = res;
        });
      }
      return Promise.resolve();
    });
    const m = await mountEditor('', onSave);
    await m.type('A');
    await m.advance(800);
    await m.type('B');
    await m.advance(800);
    await m.type('C');
    await m.advance(800);
    const { act } = await import('react');
    await act(async () => {
      resolveFirst?.();
    });
    await m.advance(0);
    const calls = onSave.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['A', 'C']);
    expect(m.textarea.value).toBe('C');
    expect(m.statusText()).toBe('Saved');
  });
});

describe('ContactNotesEditor undo vs pending autosave', () => {
  it('undo cancels a pending autosave so it cannot re-save the undone text', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    const m = await mountEditor('', onSave);
    await m.type('v1');
    await m.advance(800);
    expect(onSave).toHaveBeenCalledWith('v1');

    // A second edit is still inside its debounce window (timer pending,
    // save not yet fired) when Undo is clicked.
    await m.type('v2');
    await m.advance(100);
    const undoButton = m.container.querySelector('button') as HTMLButtonElement;
    expect(undoButton).not.toBeNull();
    const { act } = await import('react');
    await act(async () => {
      undoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await m.advance(0);
    // Undo saved the pre-v1 value (''); the pending v2 autosave must never
    // fire afterwards and resurrect the undone text.
    await m.advance(2000);
    const calls = onSave.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['v1', '']);
    expect(m.textarea.value).toBe('');
    expect(undoButton.disabled).toBe(true);
  });
});
