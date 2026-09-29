// ============================================================================
// QuantEdits - useKeyboard Hook
// Keyboard shortcuts for timeline editor operations
// ============================================================================

import { useEffect, useCallback, useRef } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: string;
  handler: () => void;
}

interface UseKeyboardOptions {
  enabled: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSplit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSave?: () => void;
  onExport?: () => void;
}

export function useKeyboard(options: UseKeyboardOptions): { shortcuts: KeyboardShortcut[] } {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const shortcuts: KeyboardShortcut[] = [
    { key: 'z', ctrl: true, action: 'Undo', handler: () => optionsRef.current.onUndo?.() },
    { key: 'z', ctrl: true, shift: true, action: 'Redo', handler: () => optionsRef.current.onRedo?.() },
    { key: 'y', ctrl: true, action: 'Redo', handler: () => optionsRef.current.onRedo?.() },
    { key: 'c', ctrl: true, action: 'Copy', handler: () => optionsRef.current.onCopy?.() },
    { key: 'v', ctrl: true, action: 'Paste', handler: () => optionsRef.current.onPaste?.() },
    { key: 'x', ctrl: true, action: 'Cut', handler: () => optionsRef.current.onCut?.() },
    { key: 'Delete', action: 'Delete', handler: () => optionsRef.current.onDelete?.() },
    { key: 'Backspace', action: 'Delete', handler: () => optionsRef.current.onDelete?.() },
    { key: 'a', ctrl: true, action: 'Select All', handler: () => optionsRef.current.onSelectAll?.() },
    { key: 'Escape', action: 'Deselect', handler: () => optionsRef.current.onDeselectAll?.() },
    { key: ' ', action: 'Play/Pause', handler: () => { optionsRef.current.onPlay?.(); } },
    { key: 's', action: 'Split', handler: () => optionsRef.current.onSplit?.() },
    { key: '+', ctrl: true, action: 'Zoom In', handler: () => optionsRef.current.onZoomIn?.() },
    { key: '-', ctrl: true, action: 'Zoom Out', handler: () => optionsRef.current.onZoomOut?.() },
    { key: 's', ctrl: true, action: 'Save', handler: () => optionsRef.current.onSave?.() },
    { key: 'e', ctrl: true, shift: true, action: 'Export', handler: () => optionsRef.current.onExport?.() },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!optionsRef.current.enabled) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      if (e.key === shortcut.key && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts };
}

export default useKeyboard;
