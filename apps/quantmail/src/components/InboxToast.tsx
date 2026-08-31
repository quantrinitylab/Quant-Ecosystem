'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MAX_VISIBLE_TOASTS,
  forgetUndo,
  reduceToasts,
  subscribeToDismissals,
  subscribeToToasts,
  type ToastMessage,
} from '../lib/toast-bus';

/**
 * The bus itself lives in `../lib/toast-bus` — a plain `.ts` module, so that
 * non-component code can fire a toast without importing a `.tsx` file (see the
 * note in that file for why the distinction matters to `pnpm typecheck`).
 *
 * Re-exported here because twenty-five components already import `showToast`
 * from `./InboxToast`, and the toast API is genuinely part of what this module
 * offers. Callers should not need to know where the plumbing sits.
 */
export { hasPendingUndo, runPendingUndo, showToast } from '../lib/toast-bus';
export type { ToastMessage } from '../lib/toast-bus';

function ToastIcon({ type }: { type: ToastMessage['type'] }) {
  switch (type) {
    case 'success':
      return (
        <svg
          className="size-4 text-emerald-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'warning':
      return (
        <svg
          className="size-4 text-[#FF8C42] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'error':
      return (
        <svg
          className="size-4 text-rose-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg
          className="size-4 text-[#FF8C42] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

export function InboxToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  /**
   * Mirror of `toasts` so the subscriber can read the live stack without being
   * re-created on every change.
   *
   * The alternative is a `setToasts` updater that also calls `forgetUndo`, but a
   * state updater has to be pure — React 19 invokes it twice in development, and
   * an undo cleared on the discarded pass would take the real one with it.
   * Deciding the next stack (`reduceToasts`, pure) and acting on what it evicted
   * are now two separate steps.
   */
  const toastsRef = useRef<ToastMessage[]>([]);

  const commit = useCallback((next: ToastMessage[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      forgetUndo(id);
      commit(toastsRef.current.filter((t) => t.id !== id));
    },
    [commit],
  );

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      const { next, evicted } = reduceToasts(toastsRef.current, msg, MAX_VISIBLE_TOASTS);
      evicted.forEach(forgetUndo);
      commit(next);

      setTimeout(() => dismiss(msg.id), msg.duration ?? 3200);
    };
    const unsubscribeToasts = subscribeToToasts(handler);
    const unsubscribeDismissals = subscribeToDismissals(dismiss);
    return () => {
      unsubscribeToasts();
      unsubscribeDismissals();
    };
  }, [commit, dismiss]);

  return (
    <div className="inbox-toast-container" aria-live="polite" aria-atomic="false">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`inbox-toast inbox-toast--${toast.type}`}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            role="status"
          >
            <span className="inbox-toast-icon flex items-center justify-center" aria-hidden="true">
              <ToastIcon type={toast.type} />
            </span>
            <span className="inbox-toast-text text-[#F5F5F5]">{toast.text}</span>
            {toast.undoAction && (
              <button
                type="button"
                className="inbox-toast-undo text-[#FF8C42] hover:bg-[#2B1A11]"
                onClick={() => {
                  // Dismiss first: that clears the pending undo, so the same
                  // action cannot then be reversed a second time with `z`.
                  dismiss(toast.id);
                  toast.undoAction?.();
                }}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              className="inbox-toast-dismiss text-[#6B6E76] hover:text-[#F5F5F5] transition-colors p-1"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
