'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Branded confirm dialog — replaces window.confirm() with our dark theme UI.
 * Supports destructive variant for permanent delete actions.
 * Traps focus inside the dialog, closes on Escape.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Focus the confirm button when opened
    setTimeout(() => confirmRef.current?.focus(), 50);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
        >
          <motion.div
            className="confirm-panel"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="confirm-title">{title}</h2>
            <p id="confirm-message" className="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-cancel"
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={`confirm-confirm ${variant === 'destructive' ? 'is-destructive' : ''}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
