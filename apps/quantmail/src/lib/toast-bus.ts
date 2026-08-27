/**
 * The toast bus: subscription plumbing and the undo registry, with no JSX.
 *
 * This lives in its own `.ts` module rather than inside `InboxToast.tsx`
 * because `tsconfig.backend.json` typechecks `src/**\/*.ts` with no `jsx`
 * option set. Any `.ts` file under `src/` that imports a `.tsx` module
 * therefore fails that pass with TS6142 — and `pnpm typecheck` runs both
 * passes, so it fails CI even though the Next build is perfectly happy.
 * `useMailMutations.ts` needs `showToast`, so `showToast` has to be reachable
 * without crossing into a `.tsx` file.
 *
 * `InboxToast.tsx` re-exports everything here, so component callers can keep
 * importing from `./InboxToast` and nothing about the public surface changes.
 */

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'info' | 'warning' | 'error';
  undoAction?: () => void;
  duration?: number;
}

type ToastListener = (msg: ToastMessage) => void;
type DismissListener = (id: string) => void;

let toastSubscribers: ToastListener[] = [];
let dismissSubscribers: DismissListener[] = [];

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

/**
 * Register a listener for new toasts. Returns its own unsubscribe.
 *
 * Handing back a closure rather than exporting the subscriber array keeps the
 * removal keyed to the exact function that was added, so a container that
 * mounts twice in development cannot tear down its sibling's listener.
 */
export function subscribeToToasts(listener: ToastListener): () => void {
  toastSubscribers.push(listener);
  return () => {
    toastSubscribers = toastSubscribers.filter((fn) => fn !== listener);
  };
}

/** Register a listener for programmatic dismissals. Returns its own unsubscribe. */
export function subscribeToDismissals(listener: DismissListener): () => void {
  dismissSubscribers.push(listener);
  return () => {
    dismissSubscribers = dismissSubscribers.filter((fn) => fn !== listener);
  };
}

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

/**
 * Drop the pending undo if it belongs to this toast.
 *
 * Guarded on the id so a toast expiring cannot clear an undo that a *newer*
 * toast has since claimed.
 */
export function forgetUndo(toastId: string): void {
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
