'use client';

import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

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

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Branded confirm dialog — the app's replacement for window.confirm(), which on
 * mobile Chrome renders a system sheet captioned with the origin ("quantmail.in
 * says"), blocks the main thread until it is answered, and cannot be styled.
 *
 * Focus is trapped inside the panel and restored to whatever opened the dialog.
 * Escape cancels. On a destructive dialog it is Cancel that takes focus, not
 * Confirm.
 *
 * Prefer the useConfirm() hook over rendering this directly: it hands back an
 * awaitable confirm() so a call site reads the same as the window.confirm() it
 * replaces.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const cancelHandlerRef = useRef(onCancel);
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const messageId = `${baseId}-message`;

  // The keydown effect reads the cancel handler through this ref so it can depend
  // on `isOpen` alone. Depending on the callback itself would re-run the effect —
  // and so re-take and re-restore focus — on every render of a parent that passes
  // an inline arrow function, which is most of them.
  cancelHandlerRef.current = onCancel;

  useEffect(() => {
    if (!isOpen) return;

    // Remember what opened the dialog. A dialog that drops focus to <body> on
    // close leaves a keyboard user at the top of the page, having lost the row
    // they were working in.
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Cancel takes focus on a destructive dialog. Confirm used to, which meant an
    // Enter keypress arriving a fraction after the dialog opened — plausible when
    // the dialog was itself opened with Enter — permanently deleted mail before
    // anyone had read the question.
    const initial = variant === 'destructive' ? cancelRef.current : confirmRef.current;
    initial?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelHandlerRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      // A real trap. The old doc comment promised one; nothing implemented it, so
      // Tab walked straight out of the dialog and into the page behind it.
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active) ?? false;

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const restore = restoreRef.current;
      restoreRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [isOpen, variant]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            ref={panelRef}
            className="confirm-panel"
            /*
             * role and aria-modal live on the panel, not on the backdrop. They were
             * on the overlay, which made the click-to-dismiss scrim the dialog
             * itself and hung the accessible name on an element whose whole job is
             * to be ignored.
             */
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }
            }
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="confirm-title">
              {title}
            </h2>
            <p id={messageId} className="confirm-message">
              {message}
            </p>
            <div className="confirm-actions">
              <button ref={cancelRef} type="button" className="confirm-cancel" onClick={onCancel}>
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
