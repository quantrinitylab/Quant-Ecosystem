'use client';

// ============================================================================
// Shared UI - Quick Actions Context Menu Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { nextRovingIndex, rovingTabIndex } from '../../utils/roving-focus';

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
  /*
    `role="menu"` is a promise about the keyboard, and this kept none of it. Every
    item carried `tabIndex={-1}`, nothing ever called `.focus()`, and there was no
    `aria-activedescendant` — so the menu could not be entered from the keyboard at
    all, and the cursor it moved with the arrows was a background tint and nothing
    else. A reader pressing Down heard silence, then Enter fired an action it had
    never been told about.

    The arrows also lived on `document`, which stole Up/Down/Enter/Space from the
    whole page for as long as the menu was open — including from a text field
    behind it, where `preventDefault()` on Space is the difference between typing
    and not. Real focus fixes both halves at once: the focused item IS the cursor,
    so a reader is told what it landed on, and Enter/Space are the platform's job
    on a native <button> rather than a global key grab.
  */
  const firstEnabled = actions.findIndex((a) => !a.disabled);
  const [activeIndex, setActiveIndex] = useState(firstEnabled);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Reset on close rather than on open: the trap's autofocus effect runs first, so
  // resetting on open would hand it last session's index for one commit.
  useEffect(() => {
    if (!isOpen) setActiveIndex(firstEnabled);
  }, [isOpen, firstEnabled]);

  /*
    Escape did close the menu, but focus was never inside it to begin with, so
    closing left the reader wherever they had been — and there was no focus trap,
    no initial focus, and no way back to whatever opened this. `useFocusTrap` is
    the package's one answer to all of it, and its `tabindex !== '-1'` filter means
    the roving cursor below is exactly what it autofocuses.
  */
  const menuRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onClose });

  /*
    The arrows skip disabled entries, which is the behaviour this shipped with and
    worth keeping: a cursor that parks on something Enter will not fire reads as a
    broken menu. `nextRovingIndex` answers "which index next" and this walks on
    from there in the direction the key implied, wrapping, giving up if every item
    turns out to be disabled.
  */
  const step = useCallback(
    (key: string, from: number): number | null => {
      const next = nextRovingIndex(key, from, actions.length, 'vertical');
      if (next === null) return null;
      const forward = key === 'ArrowDown' || key === 'Home';
      let i = next;
      for (let guard = 0; guard < actions.length; guard++) {
        if (!actions[i]?.disabled) return i;
        i = forward ? (i + 1) % actions.length : (i - 1 + actions.length) % actions.length;
      }
      return null;
    },
    [actions],
  );

  const onItemKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      // APG for a menu: Tab closes it and lets focus carry on out, rather than
      // leaving an open menu behind the thing the user just tabbed to.
      if (event.key === 'Tab') {
        onClose();
        return;
      }
      const next = step(event.key, index);
      if (next === null) return;
      // Up/Down on a focused control scrolls the page behind the menu otherwise,
      // which slides the surface out from under the cursor it is meant to move.
      event.preventDefault();
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    },
    [onClose, step],
  );

  // Close on click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [menuRef, onClose],
  );

  // An empty `role="menu"` is a menu with nothing in it — a 180px blank card on
  // screen and a structural hole for a reader. Nothing to show is nothing to open.
  if (!isOpen || actions.length === 0) return null;

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
              // A context menu is exactly the thing a consumer mounts inside a
              // <form>, where a bare <button> submits it — and a `danger` item
              // posting the form instead is the worst version of that.
              type="button"
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              onClick={() => {
                if (!action.disabled) {
                  action.onClick();
                  onClose();
                }
              }}
              onKeyDown={(event) => onItemKeyDown(event, index)}
              /*
                A tint from #ffffff to #f3f4f6 is a 1.05:1 change — nowhere near
                the 3:1 WCAG 2.4.11 asks of a focus indicator, and it was the only
                thing marking the cursor. `focus:` rather than `focus-visible:`
                deliberately: the menu autofocuses on open, and Chrome does not
                match :focus-visible for a programmatic focus that followed a
                click, so the cursor would open invisible. `ring-inset` because the
                card clips its overflow and an outset ring loses its top and
                bottom edge on the first and last item.
              */
              className="flex items-center gap-3 w-full min-h-[44px] sm:min-h-0 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
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
              tabIndex={rovingTabIndex(index, activeIndex)}
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
