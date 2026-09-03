/**
 * The toast bus: subscription plumbing and the undo registry, with no JSX.
 *
 * This lives in its own `.ts` module rather than inside `InboxToast.tsx` so
 * that non-component callers can reach `showToast` without importing a
 * component. `useMailMutations.ts` is a hook and renders nothing; pulling it
 * into `InboxToast.tsx` would make every consumer of the mutation layer depend
 * on a React tree it never touches.
 *
 * The split was originally forced by the build: `tsconfig.backend.json` used to
 * `include` `src/**\/*.ts` with no `jsx` option, so any `.ts` under `src/` that
 * imported a `.tsx` failed that pass with TS6142 while the Next build stayed
 * happy. That include has since narrowed to `backend/**\/*.ts` — verified with
 * `tsc --listFiles`, which now pulls in zero files from `src/` — so the
 * compiler no longer requires this shape. It is kept on the dependency-direction
 * argument above, which does not expire.
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
  /**
   * Dedupe key. A new toast evicts any live toast carrying the same `subject`,
   * regardless of wording.
   *
   * Without it the container can only dedupe on `text`, which fails exactly when
   * it matters most: star then unstar the same Drive file and you get
   * `Starred "report.pdf"` and `Removed from starred` on screen together, two
   * different strings making opposite claims about one file. Passing
   * `subject: 'star:<id>'` means the second toast replaces the first, so the
   * stack always shows the current state of that object rather than a transcript
   * of everything that happened to it.
   *
   * Eviction is symmetrical only within a key: a toast with no `subject` will not
   * displace one that has a subject, even on identical text. See
   * {@link reduceToasts}.
   */
  subject?: string;
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

/** Most toasts on screen at once. Older ones are dropped from the top. */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * Work out the next visible stack when `incoming` arrives.
 *
 * Pure, and exported rather than inlined in the container, for two reasons: a
 * `setState` updater is not the place for the `forgetUndo` side effect the
 * eviction implies, and this is the rule most worth pinning in a test — that two
 * toasts about the same object never sit on screen contradicting each other.
 *
 * Eviction is keyed on `subject` when the caller supplied one. Otherwise it falls
 * back to identical `text` *among subjectless toasts only*, so holding `e` down a
 * mail list still reads as one message. The `!t.subject` half of that fallback
 * matters: a subjected toast carries object identity and a subjectless one knows
 * nothing about that object, so a generic `Archived` must not displace the
 * `Archived` that a specific thread put on screen — it has no claim to be the
 * newer word on it.
 *
 * `evicted` carries the ids the caller must pass to {@link forgetUndo}: both the
 * superseded toasts and anything pushed off the top by the cap, since an undo
 * that outlives its own toast has no visible window left.
 */
export function reduceToasts(
  current: ToastMessage[],
  incoming: ToastMessage,
  max: number = MAX_VISIBLE_TOASTS,
): { next: ToastMessage[]; evicted: string[] } {
  const supersedes = (t: ToastMessage) =>
    incoming.subject ? t.subject === incoming.subject : !t.subject && t.text === incoming.text;

  const kept = current.filter((t) => !supersedes(t));
  const evicted = current.filter(supersedes).map((t) => t.id);

  const stacked = [...kept, incoming];
  const overflow = Math.max(0, stacked.length - Math.max(1, max));

  return {
    next: stacked.slice(overflow),
    evicted: [...evicted, ...stacked.slice(0, overflow).map((t) => t.id)],
  };
}
