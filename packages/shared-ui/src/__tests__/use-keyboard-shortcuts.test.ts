// @vitest-environment jsdom
// ============================================================================
// Shared UI - useKeyboardShortcuts Hook Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { ShortcutDefinition } from '../hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any lingering listeners
    vi.restoreAllMocks();
  });

  it('registers shortcuts and responds to matching key events', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler, description: 'Open search' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire handler when shortcut does not match', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler, description: 'Open search' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'j',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire handler when disabled', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler, description: 'Open search' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, { enabled: false }));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple shortcuts simultaneously', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler: handler1, description: 'Open search' },
      { combo: 'Ctrl+Shift+P', handler: handler2, description: 'Command palette' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'p',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('returns help data with shortcut descriptions', () => {
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler: vi.fn(), description: 'Open search' },
      { combo: 'Ctrl+N', handler: vi.fn(), description: 'New item' },
    ];

    const { result } = renderHook(() => useKeyboardShortcuts(shortcuts));

    // The manager has shortcuts registered after the effect runs.
    // Access help data via manager directly since useMemo may not
    // recalculate until the next render cycle.
    const helpData = result.current.manager.getHelpData();
    expect(helpData.length).toBeGreaterThan(0);
    const globalScope = helpData.find((h) => h.scope === 'Global');
    expect(globalScope).toBeDefined();
    expect(globalScope!.shortcuts.length).toBe(2);
    expect(globalScope!.shortcuts[0]!.description).toBe('Open search');
    expect(globalScope!.shortcuts[1]!.description).toBe('New item');
  });

  it('cleans up event listeners on unmount', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler, description: 'Open search' },
    ];

    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));
    unmount();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('updates shortcuts when definitions change', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(({ shortcuts }) => useKeyboardShortcuts(shortcuts), {
      initialProps: {
        shortcuts: [
          { combo: 'Ctrl+K', handler: handler1, description: 'v1' },
        ] as ShortcutDefinition[],
      },
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
    });
    expect(handler1).toHaveBeenCalledTimes(1);

    rerender({
      shortcuts: [
        { combo: 'Ctrl+J', handler: handler2, description: 'v2' },
      ] as ShortcutDefinition[],
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }),
      );
    });
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('exposes the manager instance', () => {
    const shortcuts: ShortcutDefinition[] = [
      { combo: 'Ctrl+K', handler: vi.fn(), description: 'Open search' },
    ];

    const { result } = renderHook(() => useKeyboardShortcuts(shortcuts));
    expect(result.current.manager).toBeDefined();
    expect(typeof result.current.manager.handleKeyEvent).toBe('function');
  });
});
