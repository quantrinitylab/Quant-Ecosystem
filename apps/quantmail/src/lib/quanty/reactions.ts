'use client';

/**
 * What makes Quanty react.
 *
 * `faces.ts` says how a face is drawn. This file says *when* one arrives, and the two
 * are separate on purpose: the complaint that started this work was that Quanty wore
 * the same face everywhere, which is not a drawing problem — every mount was passing a
 * literal. A mascot that cannot be triggered is a sticker, so the fix is a channel the
 * product can shout down from anywhere, including from code that is not a component.
 *
 * The shape is a bus, not context. `quantyReact('mail:sent')` is callable from a mutation
 * callback, a fetch wrapper, an error boundary or a keyboard handler with no provider in
 * scope and no prop drilling, and every mounted `useQuantyMood()` hears it. There is
 * exactly one bus per document; it is a `Set` of listeners, so an unmounted Quanty stops
 * listening and nothing leaks.
 *
 * Two behaviours make it read like a face and not like a toast:
 *
 * 1. **Latch versus pulse.** `mail:sending` is a *state* — it stays until something ends
 *    it. `mail:sent` is a *pulse* — it holds for a beat and decays back to the mount's
 *    base face. Every latch except `sys:offline` carries a finite ceiling anyway, because
 *    a request that never resolves must not leave the mascot working forever.
 * 2. **Priority.** A `success` that is mid-pulse must not be stomped by a background
 *    `search:indexing`, and nothing outranks a hard failure. An incoming reaction is
 *    dropped while a strictly higher-priority one is still holding.
 */

import { useEffect, useRef, useState } from 'react';

import { BASE_FACE, type QuantyExpression } from './faces';

/**
 * Everything the product can announce. Namespaced `channel:verb` so a mount can listen
 * to the part of the app it belongs to — the composer's Quanty has no business going
 * `confused` because a search came back empty three panes away.
 */
export type QuantyEvent =
  // ---- mail ----
  | 'mail:sending'
  | 'mail:sent'
  | 'mail:sendFailed'
  | 'mail:draftSaved'
  | 'mail:scheduled'
  | 'mail:undone'
  | 'mail:archived'
  | 'mail:deleted'
  | 'mail:snoozed'
  | 'mail:spam'
  | 'mail:inboxZero'
  | 'mail:newMail'
  | 'mail:noRecipients'
  // ---- the assistant ----
  | 'ai:thinking'
  | 'ai:streaming'
  | 'ai:answered'
  | 'ai:failed'
  | 'ai:refused'
  | 'ai:retrying'
  | 'ai:listening'
  // ---- search ----
  | 'search:indexing'
  | 'search:noResults'
  | 'search:found'
  // ---- attachments and drive ----
  | 'file:uploading'
  | 'file:uploaded'
  | 'file:tooLarge'
  // ---- the app itself ----
  | 'sys:offline'
  | 'sys:online'
  | 'sys:error'
  | 'sys:crash'
  | 'sys:quotaFull'
  | 'sys:saved'
  | 'sys:copied'
  | 'sys:greeting';

/** The prefix of a `QuantyEvent`. A mount subscribes by channel, not by event. */
export type QuantyChannel = 'mail' | 'ai' | 'search' | 'file' | 'sys';

export interface ReactionSpec {
  /** Which of the thirty-five arrives. */
  readonly face: QuantyExpression;
  /**
   * ms to hold before decaying to the mount's base face, or `null` to latch until
   * something else replaces it. Only `sys:offline` latches unbounded — being offline is
   * a fact about the world, not an operation that will finish on its own.
   */
  readonly ms: number | null;
  /** Higher wins while the incumbent is still holding. See `PRIORITY`. */
  readonly priority: number;
}

/**
 * Four bands, and the gaps are deliberate so a fifth can be slotted in later without
 * renumbering: ambient things you barely notice, ongoing states, the outcome of
 * something you asked for, and failures.
 */
const PRIORITY = { ambient: 10, state: 20, outcome: 30, urgent: 40 } as const;

/**
 * Event to face. This is the whole re-pointing surface: to make a failed send look
 * `sad` instead of `error`, one word changes here and no geometry moves.
 *
 * Twenty-three of the thirty-five faces are reachable from this table. The other twelve
 * are reachable by prop, which is a real path and not a loophole — `happy` and `wink`
 * are passed by hand at eleven call sites today, `shock` and `thinking` by the copilot
 * drawer, and `joy`, `love`, `grateful`, `sad`, `cry`, `angry`, `surprised`, `wow`,
 * `nervous` and `bored` exist for the reply-tone and postcard surfaces that pick a face
 * from content rather than from an event.
 */
export const REACTIONS = {
  // Sending latches, because a send is an operation with a visible end. The ceiling is
  // 20s: past that the request has failed in a way that never told us, and a mascot
  // stuck mid-send is worse than one that has given up and gone back to resting.
  'mail:sending': { face: 'working', ms: 20_000, priority: PRIORITY.state },
  'mail:sent': { face: 'success', ms: 1800, priority: PRIORITY.outcome },
  'mail:sendFailed': { face: 'error', ms: 2600, priority: PRIORITY.urgent },
  'mail:draftSaved': { face: 'calm', ms: 1200, priority: PRIORITY.ambient },
  'mail:scheduled': { face: 'wink', ms: 1400, priority: PRIORITY.outcome },
  'mail:undone': { face: 'relieved', ms: 1400, priority: PRIORITY.outcome },
  'mail:archived': { face: 'happy', ms: 900, priority: PRIORITY.ambient },
  'mail:deleted': { face: 'calm', ms: 900, priority: PRIORITY.ambient },
  'mail:snoozed': { face: 'sleepy', ms: 1600, priority: PRIORITY.outcome },
  'mail:spam': { face: 'annoyed', ms: 1400, priority: PRIORITY.outcome },
  'mail:inboxZero': { face: 'celebrate', ms: 2600, priority: PRIORITY.outcome },
  'mail:newMail': { face: 'curious', ms: 1400, priority: PRIORITY.ambient },
  // Not an error — the user has not finished yet. Worried, not cross.
  'mail:noRecipients': { face: 'worried', ms: 1800, priority: PRIORITY.outcome },

  'ai:thinking': { face: 'thinking', ms: 25_000, priority: PRIORITY.state },
  'ai:streaming': { face: 'focused', ms: 25_000, priority: PRIORITY.state },
  'ai:answered': { face: 'proud', ms: 1400, priority: PRIORITY.outcome },
  'ai:failed': { face: 'error', ms: 2600, priority: PRIORITY.urgent },
  // A refusal is Quanty's own decision, so it apologises rather than reporting a fault.
  'ai:refused': { face: 'sorry', ms: 2000, priority: PRIORITY.outcome },
  'ai:retrying': { face: 'determined', ms: 15_000, priority: PRIORITY.state },
  'ai:listening': { face: 'listening', ms: 15_000, priority: PRIORITY.state },

  'search:indexing': { face: 'working', ms: 20_000, priority: PRIORITY.state },
  'search:noResults': { face: 'confused', ms: 1600, priority: PRIORITY.outcome },
  'search:found': { face: 'happy', ms: 900, priority: PRIORITY.ambient },

  'file:uploading': { face: 'working', ms: 30_000, priority: PRIORITY.state },
  'file:uploaded': { face: 'success', ms: 1400, priority: PRIORITY.outcome },
  'file:tooLarge': { face: 'alarm', ms: 2400, priority: PRIORITY.urgent },

  // The one unbounded latch. Cleared by `sys:online`, which the network watch below
  // fires for us, so this cannot strand.
  'sys:offline': { face: 'offline', ms: null, priority: PRIORITY.urgent },
  'sys:online': { face: 'relieved', ms: 1600, priority: PRIORITY.urgent },
  'sys:error': { face: 'error', ms: 2600, priority: PRIORITY.urgent },
  'sys:crash': { face: 'dizzy', ms: 3000, priority: PRIORITY.urgent },
  'sys:quotaFull': { face: 'alarm', ms: 2600, priority: PRIORITY.urgent },
  'sys:saved': { face: 'success', ms: 1100, priority: PRIORITY.ambient },
  'sys:copied': { face: 'wink', ms: 900, priority: PRIORITY.ambient },
  'sys:greeting': { face: 'greeting', ms: 2000, priority: PRIORITY.outcome },
} as const satisfies Record<QuantyEvent, ReactionSpec>;

// ---- the bus ----

type Listener = (event: QuantyEvent) => void;

const listeners = new Set<Listener>();

/**
 * Announce something. Callable from anywhere: a mutation's `onSuccess`, a `catch`, a
 * keyboard handler, an error boundary. During SSR there are no listeners and this is a
 * no-op, so it never needs guarding at the call site.
 */
export function quantyReact(event: QuantyEvent): void {
  // Snapshot before iterating: a listener whose component unmounts in response would
  // otherwise mutate the set mid-loop.
  for (const listener of Array.from(listeners)) listener(event);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `'mail:sent'` → `'mail'`. */
function channelOf(event: QuantyEvent): QuantyChannel {
  return event.slice(0, event.indexOf(':')) as QuantyChannel;
}

/**
 * The browser already knows when the connection drops, so `offline` — the one face that
 * would otherwise have no trigger at all — is wired to it here rather than left for
 * every surface to remember. Bound once per document and never unbound: the listeners
 * outlive any single Quanty, and unbinding them when the last one unmounts would mean
 * missing the transition that happened while none was mounted.
 */
let watchingNetwork = false;

function startNetworkWatch(): void {
  if (watchingNetwork || typeof window === 'undefined') return;
  watchingNetwork = true;
  window.addEventListener('offline', () => quantyReact('sys:offline'));
  window.addEventListener('online', () => quantyReact('sys:online'));
  // Already offline when the first Quanty mounts: no event is coming, so say it now.
  if (navigator.onLine === false) quantyReact('sys:offline');
}

// ---- the hook ----

export interface QuantyMoodOptions {
  /** The face to rest on between reactions. Defaults to `idle`. */
  base?: QuantyExpression;
  /**
   * Channels this mount listens to. Omit for all of them. A composer's mascot passing
   * `['mail', 'file', 'sys']` will not go `confused` because a search three panes away
   * came back empty.
   */
  channels?: readonly QuantyChannel[];
  /** `false` pins the mount to `base` — for a decorative lockup that must hold still. */
  enabled?: boolean;
}

/**
 * The live face for one mount. Drop-in for a literal:
 *
 * ```tsx
 * <Quanty expression={useQuantyMood({ channels: ['mail'] })} size={22} />
 * ```
 *
 * Composes with local state, which is how the assistant surfaces keep their own spinner
 * authoritative while still hearing the app: `expression={loading ? 'thinking' : mood}`.
 */
export function useQuantyMood(options: QuantyMoodOptions = {}): QuantyExpression {
  const { base = BASE_FACE, channels, enabled = true } = options;
  const [face, setFace] = useState<QuantyExpression>(base);

  // What is currently holding, and its timer. Both are refs because a dropped
  // lower-priority event must cost nothing — no state write, no render.
  const holding = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  // A joined string, so an inline `channels={['mail']}` array literal does not re-subscribe
  // on every render the way the array's identity would.
  const channelKey = channels ? channels.join(',') : '*';

  useEffect(() => {
    if (!enabled) {
      setFace(base);
      return;
    }

    const allowed = channelKey === '*' ? null : new Set(channelKey.split(',') as QuantyChannel[]);

    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    // A changed `base` should show immediately, but only if nothing is mid-reaction.
    if (holding.current === null) setFace(base);

    const stop = subscribe((event) => {
      if (allowed && !allowed.has(channelOf(event))) return;
      const spec = REACTIONS[event];
      // Strictly lower loses; equal wins, so the last of two failures is the one shown.
      if (holding.current !== null && spec.priority < holding.current) return;

      clearTimer();
      holding.current = spec.priority;
      setFace(spec.face);

      if (spec.ms !== null) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          holding.current = null;
          setFace(base);
        }, spec.ms);
      }
    });

    startNetworkWatch();

    return () => {
      stop();
      clearTimer();
      holding.current = null;
    };
  }, [base, channelKey, enabled]);

  return enabled ? face : base;
}
