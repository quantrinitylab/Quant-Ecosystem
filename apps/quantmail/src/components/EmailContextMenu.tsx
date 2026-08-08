'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ContextMenuAction {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  variant?: 'default' | 'danger';
  action: () => void;
}

interface EmailContextMenuProps {
  actions: ContextMenuAction[];
  children: React.ReactNode;
}

/**
 * Custom right-click context menu for emails.
 * Gmail uses the browser default right-click. We show a branded dark menu
 * with all available actions + keyboard shortcut hints.
 */
export function EmailContextMenu({ actions, children }: EmailContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Position within viewport bounds
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - actions.length * 36 - 20);
    setPosition({ x, y });
    setIsOpen(true);
  }, [actions.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleScroll = () => setIsOpen(false);
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} onContextMenu={handleContextMenu} className="email-context-target">
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            className="email-context-menu"
            style={{ left: position.x, top: position.y }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            role="menu"
            aria-label="Email actions"
          >
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`context-menu-item ${action.variant === 'danger' ? 'is-danger' : ''}`}
                onClick={() => { action.action(); setIsOpen(false); }}
                role="menuitem"
              >
                <span className="context-menu-icon">{action.icon}</span>
                <span className="context-menu-label">{action.label}</span>
                {action.shortcut && <kbd className="context-menu-kbd">{action.shortcut}</kbd>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
