'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'info' | 'warning' | 'error';
  undoAction?: () => void;
  duration?: number;
}

let toastSubscribers: Array<(msg: ToastMessage) => void> = [];
let dismissSubscribers: Array<(id: string) => void> = [];

/**
 * The most recent reversible action, and the toast whose lifetime it shares.
 *
 * Superhuman's `z` undoes the last action, and the toast is already the thing
 * that tells the user an action *was* reversible. Tying the two together means
 * the undo window is exactly the window the user was shown — an undo that still
 * fires ten minutes later would reverse something they have stopped thinking
 * about, and there is no second confirmation to warn them.
 */
let pendingUndo: { toastId: string; run: () => void } | null = null;

/** Whether `z` currently has anything to reverse. Read live by the command's `enabled`. */
export function hasPendingUndo(): boolean {
  return pendingUndo !== null;
}

/** Reverse the last action. Returns `false` when the undo window has passed. */
export function runPendingUndo(): boolean {
  const entry = pendingUndo;
  if (!entry) return false;
  pendingUndo = null;
  dismissSubscribers.forEach((fn) => fn(entry.toastId));
  entry.run();
  return true;
}

function forgetUndo(toastId: string): void {
  if (pendingUndo?.toastId === toastId) pendingUndo = null;
}

/** Fire a toast from anywhere (no provider needed). */
export function showToast(msg: Omit<ToastMessage, 'id'>) {
  const toast: ToastMessage = {
    ...msg,
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
  if (msg.undoAction) pendingUndo = { toastId: toast.id, run: msg.undoAction };
  toastSubscribers.forEach((fn) => fn(toast));
}

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
          className="size-4 text-amber-400 shrink-0"
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

  const dismiss = useCallback((id: string) => {
    forgetUndo(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      // Replace any toast with the same text rather than stacking duplicates —
      // holding `e` down the list should read as one message, not forty.
      setToasts((prev) => [...prev.filter((t) => t.text !== msg.text), msg]);

      setTimeout(() => {
        forgetUndo(msg.id);
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, msg.duration ?? 3200);
    };
    toastSubscribers.push(handler);
    dismissSubscribers.push(dismiss);
    return () => {
      toastSubscribers = toastSubscribers.filter((fn) => fn !== handler);
      dismissSubscribers = dismissSubscribers.filter((fn) => fn !== dismiss);
    };
  }, [dismiss]);

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
