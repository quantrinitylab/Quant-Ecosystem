'use client';

// ============================================================================
// AnchoredMenu — the popover machinery behind Snooze and the selection overflow
// ============================================================================
// This exists because the machinery is neither small nor obvious: a fixed-
// position menu clamped into the viewport, dismissal on outside pointerdown, an
// exclusive keyboard scope so `e`/`#`/`j` cannot act on the conversation behind
// an open menu, Escape returning focus to something that can actually hold it,
// and roving arrow focus over the live `[role="menuitem"]` list.
//
// `EmailSnooze` already had all of that, correct, in ~90 lines. Hand-copying it
// for the selection header's overflow menu is how the third and fourth copies
// get written, so it moved here and both menus consume it (§18).
//
// Not `EmailContextMenu`: that one is a right-click menu positioned at the
// pointer and takes its icons as strings. Different affordance, not a variant.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';

export interface AnchoredMenuProps {
  /** Glyph inside the trigger. Inline SVG — the design system forbids emoji. */
  icon: ReactNode;
  /** Accessible name of the trigger, and its tooltip unless `triggerTitle` differs. */
  triggerLabel: string;
  triggerTitle?: string;
  triggerClassName?: string;
  /**
   * Keep the anchor but take the trigger out of the flow. Relies on the caller's
   * CSS honouring `.is-hidden`; used where another control covers the trigger's
   * slot (the row hover bar over `.snooze-trigger`).
   */
  triggerHidden?: boolean;
  /** Accessible name of the `role="menu"` container. */
  menuLabel: string;
  menuClassName?: string;
  wrapperClassName?: string;
  /** Controlled open state. Uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Keyboard scope pushed while open. Unique per menu kind, not per instance —
   * many rows mount the same menu and only the open one activates its scope.
   */
  scope: string;
  /** Height budget for the bottom clamp. Roughly the menu's rendered height. */
  height?: number;
  /** `close` is passed in so an item can dismiss the menu when it fires. */
  children: (close: () => void) => ReactNode;
}

export function AnchoredMenu({
  icon,
  triggerLabel,
  triggerTitle,
  triggerClassName,
  triggerHidden = false,
  menuLabel,
  menuClassName,
  wrapperClassName = 'inline-flex',
  open,
  onOpenChange,
  scope,
  height = 320,
  children,
}: AnchoredMenuProps) {
  const prefersReducedMotion = useReducedMotion();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  const setOpen = useCallback(
    (value: boolean) => {
      if (onOpenChange) onOpenChange(value);
      if (open === undefined) setInternalOpen(value);
    },
    [onOpenChange, open],
  );

  // Whatever held focus when the menu opened. The trigger is the obvious place to
  // send focus back to, but it is not always focusable: a row's `.snooze-trigger`
  // is `display: none` while the hover bar covers it, and `focus()` on a hidden
  // button silently does nothing — which drops focus on `<body>` and ends
  // keyboard navigation for that row. Runs before the autofocus frame below.
  useEffect(() => {
    if (isOpen) openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
  }, [isOpen]);

  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current;
    // `offsetParent === null` is the exact "an ancestor is display:none" test.
    if (trigger && trigger.offsetParent !== null) {
      trigger.focus();
      return;
    }
    const opener = openerRef.current;
    if (opener?.isConnected && opener.offsetParent !== null) opener.focus();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    restoreFocus();
  }, [setOpen, restoreFocus]);

  /**
   * Right-anchored, because both consumers hang off a control at the right edge
   * of a row or a header and leftwards is the only direction with room. `top` is
   * clamped so a trigger near the bottom of the viewport pulls its menu up
   * instead of off the screen.
   */
  const reposition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = Math.max(16, window.innerWidth - rect.right);
    const top = Math.max(8, Math.min(window.innerHeight - height, rect.bottom + 6));
    setCoords((prev) => (prev && prev.top === top && prev.right === right ? prev : { top, right }));
  }, [height]);

  useEffect(() => {
    if (!isOpen) return;
    reposition();
    // A `position: fixed` menu does not follow its anchor, so scrolling the mail
    // list would leave it hanging over an unrelated row. Capture phase: the list
    // scrolls in a nested container, and scroll does not bubble to the window.
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        // `setOpen`, not `close`: focus is already on its way to whatever was
        // clicked, and yanking it back to the trigger would fight that click.
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, setOpen]);

  /**
   * The menu owns the keyboard while it is out, so the mail shortcuts cannot act
   * on the conversation behind it — these menus are rendered per row, and
   * archiving the row you were mid-way through snoozing is not recoverable.
   */
  useKeyboardScope(scope, { active: isOpen, exclusive: true });

  useShortcut('escape', close, {
    scope,
    label: `Close ${menuLabel.toLowerCase()}`,
    // Escape inside the menu's own date field should dismiss the menu, not blur.
    allowInInput: true,
  });

  /**
   * Roving focus over the items.
   *
   * They are real buttons, so Enter and Space already activate them; the arrows
   * are what make a `role="menu"` navigable. Focus is read off the live DOM
   * rather than mirrored into state — the list is short, and querying it cannot
   * drift out of sync with what is rendered.
   *
   * `allowInInput` stays off: inside a datetime field the arrows belong to the
   * browser's own stepper.
   */
  const moveFocus = useCallback((delta: number) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    // From outside the list, ArrowDown enters at the top and ArrowUp at the bottom.
    const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta;
    items[(next + items.length) % items.length]?.focus();
  }, []);

  useShortcut('arrowdown', () => moveFocus(1), { scope, label: 'Next option' });
  useShortcut('arrowup', () => moveFocus(-1), { scope, label: 'Previous option' });

  // The menu waits one frame for `reposition`, so it never paints at the wrong
  // place first. Autofocus has to wait for that frame too.
  const isPositioned = isOpen && coords !== null;

  useEffect(() => {
    if (!isPositioned) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPositioned]);

  return (
    <div
      className={wrapperClassName}
      // A mail row is itself a click target; the menu inside it is not part of it.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName ?? ''}${triggerHidden && !isOpen ? ' is-hidden' : ''}`}
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        title={triggerTitle ?? triggerLabel}
      >
        {icon}
      </button>
      <AnimatePresence>
        {isOpen && coords && (
          <motion.div
            ref={menuRef}
            className={menuClassName}
            role="menu"
            aria-orientation="vertical"
            aria-label={menuLabel}
            style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 99999 }}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.15 }}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
