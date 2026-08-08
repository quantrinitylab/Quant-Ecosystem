'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ContextMenuAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  handler: () => void;
}

interface EmailContextMenuProps {
  actions: ContextMenuAction[];
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

/**
 * Right-click context menu for email rows.
 * Gmail's right-click just shows browser default.
 * We show branded actions: Reply, Forward, Archive, Star, Mark read, Delete, etc.
 */
export function useEmailContextMenu(actions: ContextMenuAction[]) {
  const [state, setState] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Position menu at cursor, but keep it within viewport
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    setState({ isOpen: true, x, y });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    if (!state.isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [state.isOpen, close]);

  return { state, onContextMenu, close, menuRef };
}

export function EmailContextMenu({
  state,
  actions,
  menuRef,
  onClose,
}: {
  state: ContextMenuState;
  actions: ContextMenuAction[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          ref={menuRef}
          className="email-context-menu"
          style={{ top: state.y, left: state.x }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          role="menu"
          aria-label="Email actions"
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className={`context-menu-item ${action.variant === 'destructive' ? 'is-destructive' : ''}`}
              onClick={() => {
                action.handler();
                onClose();
              }}
            >
              {action.icon && <span className="context-menu-icon" aria-hidden="true">{action.icon}</span>}
              <span className="context-menu-label">{action.label}</span>
              {action.shortcut && <kbd className="context-menu-shortcut">{action.shortcut}</kbd>}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
