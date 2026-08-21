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

/** Fire a toast from anywhere (no provider needed). */
export function showToast(msg: Omit<ToastMessage, 'id'>) {
  const toast: ToastMessage = {
    ...msg,
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
  toastSubscribers.forEach((fn) => fn(toast));
}

const ICONS: Record<ToastMessage['type'], string> = {
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
  error: '✕',
};

export function InboxToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      // Remove any existing toast with the same text so it doesn't pile up
      setToasts((prev) => [...prev.filter((t) => t.text !== msg.text), msg]);

      // Auto-dismiss this specific toast
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, msg.duration ?? 3200);
    };
    toastSubscribers.push(handler);
    return () => {
      toastSubscribers = toastSubscribers.filter((fn) => fn !== handler);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
            <span className="inbox-toast-icon" aria-hidden="true">
              {ICONS[toast.type]}
            </span>
            <span className="inbox-toast-text">{toast.text}</span>
            {toast.undoAction && (
              <button
                type="button"
                className="inbox-toast-undo"
                onClick={() => {
                  toast.undoAction?.();
                  dismiss(toast.id);
                }}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              className="inbox-toast-dismiss"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
