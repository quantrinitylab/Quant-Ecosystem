'use client';

import React, { useEffect, useState, useRef } from 'react';

// ============================================================================
// Types & Constants
// ============================================================================

export interface DockShortcut {
  id: string;
  badgeKeys: string[];
  label: string;
}

export const DOCK_SHORTCUTS: DockShortcut[] = [
  { id: 'navigate', badgeKeys: ['J', 'K'], label: 'Navigate' },
  { id: 'archive', badgeKeys: ['E'], label: 'Done / Archive' },
  { id: 'snooze', badgeKeys: ['S'], label: 'Snooze' },
  { id: 'reply', badgeKeys: ['R'], label: 'Reply' },
  { id: 'undo', badgeKeys: ['Z'], label: 'Undo' },
  { id: 'palette', badgeKeys: ['⌘K'], label: 'Command Palette' },
];

export interface DockKeyCallbacks {
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onArchive?: () => void;
  onSnooze?: () => void;
  onReply?: () => void;
  onUndo?: () => void;
  onCommandPalette?: () => void;
  onHighlight?: (key: string) => void;
}

export interface SuperhumanShortcutDockProps {
  disableListener?: boolean;
  initialCollapsed?: boolean;
  activeKeyOverride?: string;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onArchive?: () => void;
  onSnooze?: () => void;
  onReply?: () => void;
  onUndo?: () => void;
  onCommandPalette?: () => void;
  className?: string;
}

/**
 * Check if the active element or event target is an interactive text input
 */
export function isInputTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (el.isContentEditable) return true;
  if (!el.tagName || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Pure handler for keyboard shortcut events on the dock
 */
export function handleDockKeyDown(
  event: Partial<KeyboardEvent> & {
    key?: string;
    target?: unknown;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    preventDefault?: () => void;
  },
  callbacks: DockKeyCallbacks,
): boolean {
  if (isInputTarget(event.target)) {
    return false;
  }

  // Handle Command Palette (Cmd+K / Ctrl+K)
  if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
    event.preventDefault?.();
    callbacks.onHighlight?.('CMD_K');
    callbacks.onCommandPalette?.();
    return true;
  }

  // Reject other chords with modifier keys (Alt+E, Ctrl+J, etc.)
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  const key = event.key?.toLowerCase();
  switch (key) {
    case 'j':
      callbacks.onHighlight?.('J');
      callbacks.onNavigateNext?.();
      return true;
    case 'k':
      callbacks.onHighlight?.('K');
      callbacks.onNavigatePrev?.();
      return true;
    case 'e':
      callbacks.onHighlight?.('E');
      callbacks.onArchive?.();
      return true;
    case 's':
      callbacks.onHighlight?.('S');
      callbacks.onSnooze?.();
      return true;
    case 'r':
      callbacks.onHighlight?.('R');
      callbacks.onReply?.();
      return true;
    case 'z':
      callbacks.onHighlight?.('Z');
      callbacks.onUndo?.();
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Component
// ============================================================================

export function SuperhumanShortcutDock({
  disableListener = false,
  initialCollapsed = false,
  activeKeyOverride,
  onNavigateNext,
  onNavigatePrev,
  onArchive,
  onSnooze,
  onReply,
  onUndo,
  onCommandPalette,
  className = '',
}: SuperhumanShortcutDockProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveActiveKey = activeKeyOverride !== undefined ? activeKeyOverride : activeKey;

  const triggerHighlight = (key: string) => {
    setActiveKey(key);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setActiveKey(null);
    }, 300);
  };

  useEffect(() => {
    if (disableListener) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      handleDockKeyDown(e, {
        onNavigateNext,
        onNavigatePrev,
        onArchive,
        onSnooze,
        onReply,
        onUndo,
        onCommandPalette,
        onHighlight: triggerHighlight,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, [
    disableListener,
    onNavigateNext,
    onNavigatePrev,
    onArchive,
    onSnooze,
    onReply,
    onUndo,
    onCommandPalette,
  ]);

  if (collapsed) {
    return (
      <button
        type="button"
        data-testid="superhuman-dock-collapsed"
        aria-label="Expand dock"
        onClick={() => setCollapsed(false)}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 backdrop-blur-md bg-black/75 border border-white/10 shadow-2xl rounded-full px-4 py-2 flex items-center gap-2.5 text-xs text-gray-300 hover:text-white transition-all cursor-pointer ${className}`}
      >
        <span className="size-2 rounded-full bg-[#FF8C42] shadow-[0_0_8px_rgba(255,140,66,0.8)]" />
        <span className="font-semibold text-white">Shortcuts</span>
        <span className="text-[10px] text-gray-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
          ?
        </span>
      </button>
    );
  }

  const isKeyActive = (key: string) => effectiveActiveKey === key;

  return (
    <div
      role="toolbar"
      aria-label="Superhuman Keyboard Shortcuts Dock"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 backdrop-blur-md bg-black/75 border border-white/10 shadow-2xl flex items-center gap-3 text-xs text-gray-300 select-none rounded-full px-4 py-2 transition-all ${className}`}
    >
      {/* Brand mark */}
      <div className="flex items-center gap-1.5 font-medium text-white shrink-0 pr-1">
        <span className="size-2 rounded-full bg-[#FF8C42] shadow-[0_0_8px_rgba(255,140,66,0.8)]" />
        <span className="font-bold text-xs tracking-wide">Keys</span>
      </div>

      <div className="h-3.5 w-px bg-white/10" />

      {/* J/K Navigate */}
      <div
        data-testid="dock-pill-navigate"
        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        onClick={() => onNavigateNext?.()}
      >
        <div className="flex items-center gap-1">
          <span
            data-testid="key-badge-J"
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
              isKeyActive('J')
                ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
                : 'border-white/10 bg-white/5 text-gray-300'
            }`}
          >
            J
          </span>
          <span
            data-testid="key-badge-K"
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
              isKeyActive('K')
                ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
                : 'border-white/10 bg-white/5 text-gray-300'
            }`}
          >
            K
          </span>
        </div>
        <span>Navigate</span>
      </div>

      <div className="h-3.5 w-px bg-white/10" />

      {/* E Done / Archive */}
      <div
        data-testid="dock-pill-archive"
        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        onClick={() => onArchive?.()}
      >
        <span
          data-testid="key-badge-E"
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
            isKeyActive('E')
              ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
              : 'border-white/10 bg-white/5 text-gray-300'
          }`}
        >
          E
        </span>
        <span>Done / Archive</span>
      </div>

      <div className="h-3.5 w-px bg-white/10" />

      {/* S Snooze */}
      <div
        data-testid="dock-pill-snooze"
        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        onClick={() => onSnooze?.()}
      >
        <span
          data-testid="key-badge-S"
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
            isKeyActive('S')
              ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
              : 'border-white/10 bg-white/5 text-gray-300'
          }`}
        >
          S
        </span>
        <span>Snooze</span>
      </div>

      <div className="h-3.5 w-px bg-white/10" />

      {/* R Reply */}
      <div
        data-testid="dock-pill-reply"
        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        onClick={() => onReply?.()}
      >
        <span
          data-testid="key-badge-R"
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
            isKeyActive('R')
              ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
              : 'border-white/10 bg-white/5 text-gray-300'
          }`}
        >
          R
        </span>
        <span>Reply</span>
      </div>

      <div className="h-3.5 w-px bg-white/10" />

      {/* Z Undo */}
      <div
        data-testid="dock-pill-undo"
        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        onClick={() => onUndo?.()}
      >
        <span
          data-testid="key-badge-Z"
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
            isKeyActive('Z')
              ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
              : 'border-white/10 bg-white/5 text-gray-300'
          }`}
        >
          Z
        </span>
        <span>Undo</span>
      </div>

      <div className="h-3.5 w-px bg-white/10" />

      {/* ⌘K Command Palette */}
      <div
        data-testid="dock-pill-palette"
        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        onClick={() => onCommandPalette?.()}
      >
        <span
          data-testid="key-badge-CMD_K"
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
            isKeyActive('CMD_K')
              ? 'border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42] shadow-[0_0_12px_rgba(255,140,66,0.6)]'
              : 'border-white/10 bg-white/5 text-gray-300'
          }`}
        >
          ⌘K
        </span>
        <span>Command Palette</span>
      </div>

      {/* Minimize button */}
      <button
        type="button"
        data-testid="dock-minimize-button"
        aria-label="Minimize dock"
        onClick={() => setCollapsed(true)}
        className="ml-1 p-1 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors focus:outline-none"
      >
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
