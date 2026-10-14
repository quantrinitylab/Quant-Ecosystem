'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
export { dismissToast, hasPendingUndo, runPendingUndo, showToast } from '../lib/toast-bus';
export type { ToastMessage } from '../lib/toast-bus';

/**
 * Must match the CSS keyframe duration (`inbox-toast-enter` / `inbox-toast-exit`
 * in globals.css). Animations are pure CSS: this component renders from the root
 * layout on EVERY route — including public /login — so it must not import
 * framer-motion; any JS animation runtime here lands in the shared layout chunk
 * for all routes. Exit motion is preserved by keeping a dismissed toast mounted
 * with the `.inbox-toast--leaving` class for EXIT_MS before removing it.
 */
const EXIT_MS = 200;

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
          className="size-4 text-[var(--quant-primary)] shrink-0"
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
          strokeWidth="2.5"
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
          className="size-4 text-[var(--quant-primary)] shrink-0"
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

function InboxToastItem({
  toast,
  leaving,
  onDismiss,
}: {
  toast: ToastMessage;
  leaving: boolean;
  onDismiss: (id: string) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(toast.countdown ?? null);

  useEffect(() => {
    if (toast.countdown === undefined || toast.countdown <= 0) return;
    setSecondsLeft(toast.countdown);
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [toast.countdown]);

  return (
    <div
      className={`inbox-toast inbox-toast--${toast.type}${toast.countdown ? ' undo-send-toast' : ''}${leaving ? ' inbox-toast--leaving' : ''}`}
      role="status"
    >
      <span className="inbox-toast-icon flex items-center justify-center" aria-hidden="true">
        {secondsLeft !== null ? (
          <span className="undo-countdown text-xs font-bold">{secondsLeft}s</span>
        ) : (
          <ToastIcon type={toast.type} />
        )}
      </span>
      <span className="inbox-toast-text text-[var(--quant-foreground)]">{toast.text}</span>
      {toast.undoAction && (
        <button
          type="button"
          className="inbox-toast-undo text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/20 px-2 py-0.5 rounded font-semibold transition-colors"
          onClick={() => {
            // Dismiss first: clears the pending undo, so the same action
            // cannot be reversed a second time.
            onDismiss(toast.id);
            toast.undoAction?.();
          }}
        >
          Undo
        </button>
      )}
      <button
        type="button"
        className="inbox-toast-dismiss text-[var(--quant-text-muted)] hover:text-[var(--quant-foreground)] transition-colors p-1"
        onClick={() => onDismiss(toast.id)}
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
    </div>
  );
}

export function InboxToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  /** Toast ids currently playing their CSS exit animation (removed after EXIT_MS). */
  const [leavingIds, setLeavingIds] = useState<string[]>([]);

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
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const commit = useCallback((next: ToastMessage[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const removeToast = useCallback(
    (id: string) => {
      commit(toastsRef.current.filter((t) => t.id !== id));
      setLeavingIds((prev) => prev.filter((x) => x !== id));
    },
    [commit],
  );

  /** Play the exit animation, then remove the toast from the stack. */
  const startExit = useCallback(
    (id: string) => {
      // The auto-dismiss timer, the dismiss button, and the Undo button can all
      // fire for the same toast — schedule the exit exactly once.
      if (exitTimers.current.has(id)) return;
      setLeavingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      exitTimers.current.set(
        id,
        setTimeout(() => {
          exitTimers.current.delete(id);
          removeToast(id);
        }, EXIT_MS),
      );
    },
    [removeToast],
  );

  const dismiss = useCallback(
    (id: string) => {
      forgetUndo(id);
      startExit(id);
    },
    [startExit],
  );

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      const { next, evicted } = reduceToasts(toastsRef.current, msg, MAX_VISIBLE_TOASTS);
      // Evicted toasts play their exit animation like any dismissed toast, and
      // stay in their original stack position while doing so (the previous
      // implementation kept exiting items in place; appending them at the end
      // would visibly reorder the stack for the 200ms exit).
      const evictedIds = new Set(evicted);
      const keptIds = new Set(next.map((t) => t.id));
      evicted.forEach((id) => forgetUndo(id));
      const ordered: ToastMessage[] = [];
      for (const t of toastsRef.current) {
        if (evictedIds.has(t.id) || keptIds.has(t.id)) ordered.push(t);
      }
      ordered.push(msg); // incoming is always the last element of `next`
      commit(ordered);
      evicted.forEach((id) => startExit(id));

      setTimeout(() => dismiss(msg.id), msg.duration ?? 3200);
    };
    const unsubscribeToasts = subscribeToToasts(handler);
    const unsubscribeDismissals = subscribeToDismissals(dismiss);
    return () => {
      unsubscribeToasts();
      unsubscribeDismissals();
    };
  }, [commit, dismiss, startExit]);

  // Never leak exit timers on unmount.
  useEffect(() => {
    const timers = exitTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <div className="inbox-toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <InboxToastItem
          key={toast.id}
          toast={toast}
          leaving={leavingIds.includes(toast.id)}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}
