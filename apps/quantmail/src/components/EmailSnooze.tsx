'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EmailSnoozeProps {
  emailId: string;
  onSnooze: (emailId: string, snoozeUntil: Date) => void;
}

const SNOOZE_OPTIONS = [
  { label: 'Later today', getDate: () => { const d = new Date(); d.setHours(d.getHours() + 3); return d; } },
  { label: 'Tomorrow', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'This weekend', getDate: () => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() + (6 - day)); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'Next week', getDate: () => { const d = new Date(); d.setDate(d.getDate() + (8 - d.getDay())); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'Next month', getDate: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1); d.setHours(9, 0, 0, 0); return d; } },
] as const;

export function EmailSnooze({ emailId, onSnooze }: EmailSnoozeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const handleSnooze = useCallback(
    (option: typeof SNOOZE_OPTIONS[number]) => {
      onSnooze(emailId, option.getDate());
      setIsOpen(false);
    },
    [emailId, onSnooze],
  );

  return (
    <div className="snooze-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className="snooze-trigger"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Snooze email"
        title="Snooze"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                  {option.getDate().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
