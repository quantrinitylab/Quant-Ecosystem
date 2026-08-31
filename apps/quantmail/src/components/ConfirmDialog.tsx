'use client';

import { useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useFocusTrap } from '@quant/shared-ui';

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
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const messageId = `${baseId}-message`;

  /**
   * The trap, the Escape handler and the focus restore were all hand-rolled here
   * — the third such copy in the repo, each with a slightly different focusable
   * selector. This one's missed `input[type=hidden]` and never filtered on
   * visibility, so a hidden control could become the wrap target.
   *
   * Initial focus is now declared rather than imperative: `data-autofocus` on the
   * right button below. The rule it encodes is deliberate and stays — Confirm
   * used to take focus, which meant an Enter keypress arriving a fraction after
   * the dialog opened, plausible when the dialog was itself opened with Enter,
   * permanently deleted mail before anyone had read the question.
   */
  const panelRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onCancel });

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
              <button
                type="button"
                className="confirm-cancel"
                onClick={onCancel}
                data-autofocus={variant === 'destructive' ? '' : undefined}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`confirm-confirm ${variant === 'destructive' ? 'is-destructive' : ''}`}
                onClick={onConfirm}
                data-autofocus={variant === 'destructive' ? undefined : ''}
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
