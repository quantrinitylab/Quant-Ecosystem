'use client';

// ============================================================================
// Shared UI - useKeyboardShortcuts Hook
// ============================================================================

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { KeyboardShortcutManager } from '../advanced/keyboard-shortcuts';

export interface ShortcutDefinition {
  combo: string;
  handler: () => void;
  description?: string;
  scope?: string;
}

export interface UseKeyboardShortcutsOptions {
  scope?: string;
  enabled?: boolean;
}

export interface UseKeyboardShortcutsReturn {
  helpData: Array<{ scope: string; shortcuts: Array<{ combo: string; description: string }> }>;
  manager: KeyboardShortcutManager;
}

export function useKeyboardShortcuts(
  shortcuts: ShortcutDefinition[],
  options: UseKeyboardShortcutsOptions = {},
): UseKeyboardShortcutsReturn {
  const { scope = 'global', enabled = true } = options;
  const managerRef = useRef<KeyboardShortcutManager>(new KeyboardShortcutManager());
  const registeredIdsRef = useRef<string[]>([]);

  // Register shortcuts
  useEffect(() => {
    const manager = managerRef.current;

    // Unregister previous shortcuts
    for (const id of registeredIdsRef.current) {
      manager.unregister(id);
    }
    registeredIdsRef.current = [];

    if (!enabled) return;

    // Activate scope
    manager.activateScope(scope);

    // Register new shortcuts
    for (const shortcut of shortcuts) {
      const id = manager.register(shortcut.combo, shortcut.handler, {
        scope,
        description: shortcut.description,
      });
      registeredIdsRef.current.push(id);
    }

    return () => {
      for (const id of registeredIdsRef.current) {
        manager.unregister(id);
      }
      registeredIdsRef.current = [];
    };
  }, [shortcuts, scope, enabled]);

  // Handle key events
  const handleKeyEvent = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      const handled = managerRef.current.handleKeyEvent({
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
      if (handled) {
        e.preventDefault();
      }
    },
    [enabled],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyEvent);
    return () => document.removeEventListener('keydown', handleKeyEvent);
  }, [handleKeyEvent]);

  const helpData = useMemo(() => managerRef.current.getHelpData(), [shortcuts, enabled]);

  return {
    helpData,
    manager: managerRef.current,
  };
}
