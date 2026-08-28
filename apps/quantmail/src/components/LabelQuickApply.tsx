'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { showToast } from './InboxToast';
import { IconCheck } from './icons';

interface Label {
  id: string;
  name: string;
  color: string;
}

interface LabelQuickApplyProps {
  emailId: string;
  currentLabels: string[];
  availableLabels: Label[];
  onApply: (emailId: string, labelId: string) => Promise<void>;
  onRemove: (emailId: string, labelId: string) => Promise<void>;
}

/**
 * Quick label apply dropdown — appears inline on email actions.
 * Gmail has this but it's slow (3 clicks). We make it 1 click with search.
 * Keyboard shortcut: L opens this from inbox.
 */
export function LabelQuickApply({
  emailId,
  currentLabels,
  availableLabels,
  onApply,
  onRemove,
}: LabelQuickApplyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = availableLabels.filter((l) =>
    l.name.toLowerCase().includes(filter.toLowerCase()),
  );

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const handleToggleLabel = useCallback(
    async (label: Label) => {
      const isApplied = currentLabels.includes(label.id);
      if (isApplied) {
        await onRemove(emailId, label.id);
        showToast({ text: `Removed label "${label.name}"`, type: 'info' });
      } else {
        await onApply(emailId, label.id);
        showToast({ text: `Applied label "${label.name}"`, type: 'success' });
      }
    },
    [currentLabels, emailId, onApply, onRemove],
  );

  return (
    <div className="label-quick-apply" ref={menuRef}>
      <button
        type="button"
        className="label-trigger-btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Apply label (L)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
        <span>Label</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="label-dropdown"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            aria-label="Apply labels"
          >
            <div className="label-dropdown-search">
              <input
                ref={inputRef}
                type="search"
                placeholder="Filter labels…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="label-dropdown-list">
              {filtered.length === 0 && <p className="label-dropdown-empty">No matching labels</p>}
              {filtered.map((label) => {
                const isApplied = currentLabels.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`label-dropdown-item ${isApplied ? 'is-applied' : ''}`}
                    onClick={() => void handleToggleLabel(label)}
                    role="option"
                    aria-selected={isApplied}
                  >
                    <span className="label-dot" style={{ backgroundColor: label.color }} />
                    <span className="label-name">{label.name}</span>
                    {isApplied && (
                      <span className="label-check inline-flex">
                        <IconCheck size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
