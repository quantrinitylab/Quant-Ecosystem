/**
 * One-way, fire-and-forget bridge: QuantGit page → QuantGit mascot.
 *
 * The mascot lives in the app shell (switcher, tiles), far from the page that
 * performs git operations. This bridge lets the page report *confirmed* outcomes
 * — the same points where it already shows a success toast — so the mascot can
 * play a short, restrained acknowledgement. It carries no payload, triggers no
 * git work, and never fabricates an operation: only call sites that already know
 * an operation succeeded may emit a success kind. Failures emit `'error'`, which
 * the mascot treats as "stay neutral" — an error must never play a success ack.
 *
 * A `CustomEvent` on `window` keeps the two sides decoupled: the renderer never
 * imports page code, and the page never imports the renderer.
 */

export type QuantGitMascotEventKind =
  | 'commit'
  | 'push'
  | 'pull'
  | 'branch'
  | 'clone'
  | 'repo'
  | 'error';

const EVENT_NAME = 'quantgit:mascot-event';

/** Emit from a call site that has *confirmed* the operation's outcome. */
export function emitQuantGitMascotEvent(kind: QuantGitMascotEventKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { kind } }));
}

/**
 * Subscribe to mascot events. Returns an unsubscribe function.
 * Safe to call during SSR — returns a no-op.
 */
export function onQuantGitMascotEvent(
  callback: (kind: QuantGitMascotEventKind) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event): void => {
    const kind = (event as CustomEvent<{ kind?: unknown }>).detail?.kind;
    if (typeof kind === 'string') callback(kind as QuantGitMascotEventKind);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
