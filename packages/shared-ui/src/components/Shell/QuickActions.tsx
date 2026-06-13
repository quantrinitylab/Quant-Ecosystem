'use client';

// ============================================================================
// Shared UI - Quick Actions Context Menu Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface QuickActionsProps {
  actions: QuickAction[];
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  itemType?: string;
  ariaLabel?: string;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  isOpen,
  position,
  onClose,
  itemType = 'item',
  ariaLabel,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset active index on open
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Focus trap and keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => {
            let next = (i + 1) % actions.length;
            while (actions[next]?.disabled && next !== i) {
              next = (next + 1) % actions.length;
            }
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => {
            let prev = (i - 1 + actions.length) % actions.length;
            while (actions[prev]?.disabled && prev !== i) {
              prev = (prev - 1 + actions.length) % actions.length;
            }
            return prev;
          });
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (actions[activeIndex] && !actions[activeIndex].disabled) {
            actions[activeIndex].onClick();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, actions, activeIndex, onClose]);

  // Close on click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50" onClick={handleBackdropClick} role="presentation">
        <motion.div
          ref={menuRef}
          className="fixed min-w-[180px] rounded-lg shadow-xl py-1 overflow-hidden"
          style={{
            top: position.y,
            left: position.x,
            background: 'var(--quant-surface, #ffffff)',
            border: '1px solid var(--quant-border, #e5e7eb)',
          }}
          role="menu"
          aria-label={ariaLabel || `Quick actions for ${itemType}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              onClick={() => {
                if (!action.disabled) {
                  action.onClick();
                  onClose();
                }
              }}
              className="flex items-center gap-3 w-full px-3 py-2 text-sm text-left focus:outline-none"
              style={{
                background:
                  index === activeIndex ? 'var(--quant-surface-hover, #f3f4f6)' : 'transparent',
                color: action.danger
                  ? '#dc2626'
                  : action.disabled
                    ? 'var(--quant-text-secondary, #6b7280)'
                    : 'var(--quant-text, #111827)',
                opacity: action.disabled ? 0.5 : 1,
                cursor: action.disabled ? 'not-allowed' : 'pointer',
              }}
              role="menuitem"
              aria-disabled={action.disabled}
              tabIndex={-1}
            >
              {action.icon && <span aria-hidden="true">{action.icon}</span>}
              <span className="flex-1">{action.label}</span>
              {action.shortcut && (
                <kbd
                  className="text-xs font-mono"
                  style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                >
                  {action.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
