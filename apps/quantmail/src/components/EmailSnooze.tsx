'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';

interface EmailSnoozeProps {
  emailId: string;
  onSnooze: (emailId: string, snoozeUntil: Date) => void;
  /** Controlled open state (optional). When provided together with
   *  onOpenChange, the menu can be opened from elsewhere — e.g. the clock
   *  button in the hover actions bar. Uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Visually hide the clock trigger while keeping the menu anchored here
   *  (used while the hover actions bar covers the row's right edge). */
  triggerHidden?: boolean;
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Every option is guaranteed to land in the future (the backend rejects past
// snooze times): weekend/next-week math rolls forward a full week when the
// naive target would be today-or-earlier.
const SNOOZE_OPTIONS = [
  {
    label: 'Later today',
    getDate: () => {
      const d = new Date();
      d.setHours(d.getHours() + 3);
      return d;
    },
  },
  {
    label: 'Tomorrow',
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'This weekend',
    getDate: () => {
      const d = new Date();
      const add = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Next week',
    getDate: () => {
      const d = new Date();
      const add = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Next month',
    getDate: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
] as const;

export function EmailSnooze({
  emailId,
  onSnooze,
  open,
  onOpenChange,
  triggerHidden = false,
}: EmailSnoozeProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const [customValue, setCustomValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  const setOpen = useCallback(
    (value: boolean) => {
      if (onOpenChange) onOpenChange(value);
      if (open === undefined) setInternalOpen(value);
    },
    [onOpenChange, open],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const right = Math.max(16, window.innerWidth - rect.right);
      const top = Math.min(window.innerHeight - 300, rect.bottom + 6);
      setCoords({ top, right });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen, setOpen]);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, [setOpen]);

  /**
   * The menu owns the keyboard while it is out, so `e`, `j` and `#` cannot act on
   * the conversation behind it — this menu is rendered per row, and archiving the
   * row you were mid-way through snoozing is not recoverable from the UI.
   */
  useKeyboardScope('snooze-menu', { active: isOpen, exclusive: true });

  useShortcut('escape', close, {
    scope: 'snooze-menu',
    label: 'Close snooze menu',
    // Escape from the date field should dismiss the menu, not just blur.
    allowInInput: true,
  });

  /**
   * Roving focus over the presets.
   *
   * The options are real buttons, so Enter and Space already activate them; only
   * the arrows were missing, which is what makes a `role="menu"` navigable. Focus
   * is read off the live DOM rather than mirrored into state — the list is short
   * and querying it cannot drift out of sync with what is rendered.
   *
   * `allowInInput` stays off: inside the datetime field the arrows belong to the
   * browser's own date stepper.
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

  useShortcut('arrowdown', () => moveFocus(1), { scope: 'snooze-menu', label: 'Next option' });
  useShortcut('arrowup', () => moveFocus(-1), { scope: 'snooze-menu', label: 'Previous option' });

  // Opening with the keyboard has to land somewhere, and the first preset is the
  // one a user reaching for `Later today` wants.
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleSnooze = useCallback(
    (option: (typeof SNOOZE_OPTIONS)[number]) => {
      onSnooze(emailId, option.getDate());
      setOpen(false);
    },
    [emailId, onSnooze, setOpen],
  );

  const customDate = customValue ? new Date(customValue) : null;
  const customInvalid =
    !customDate || Number.isNaN(customDate.getTime()) || customDate.getTime() <= Date.now();

  const handleCustomSnooze = useCallback(() => {
    if (!customDate || customInvalid) return;
    onSnooze(emailId, customDate);
    setCustomValue('');
    setOpen(false);
  }, [customDate, customInvalid, emailId, onSnooze, setOpen]);

  return (
    <div className="snooze-wrapper" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={`snooze-trigger${triggerHidden && !isOpen ? ' is-hidden' : ''}`}
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Snooze email"
        title="Snooze"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2" />
          <path d="M5 3 2 6" />
          <path d="m22 6-3-3" />
        </svg>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            className="snooze-menu"
            role="menu"
            style={
              coords
                ? {
                    position: 'fixed',
                    top: `${coords.top}px`,
                    right: `${coords.right}px`,
                    zIndex: 99999,
                  }
                : { zIndex: 99999 }
            }
            aria-label="Snooze options"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <p className="snooze-menu-title">Snooze until</p>
            {SNOOZE_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                className="snooze-option"
                onClick={() => handleSnooze(option)}
              >
                <span>{option.label}</span>
                <span className="snooze-option-date">
                  {option.getDate().toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </button>
            ))}
            <div className="snooze-custom">
              <p className="snooze-menu-title">Pick date &amp; time</p>
              <div className="snooze-custom-row">
                <input
                  type="datetime-local"
                  value={customValue}
                  min={toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                  onChange={(e) => setCustomValue(e.target.value)}
                  aria-label="Custom snooze date and time"
                />
                <button type="button" disabled={customInvalid} onClick={handleCustomSnooze}>
                  Set
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
