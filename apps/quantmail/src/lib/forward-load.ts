/**
 * Forward compose load state machine (`?forward=<id>`).
 *
 * This is the single place that decides what a forward compose shows, and it
 * exists because the two previous attempts each got one half wrong:
 *
 *  - #1555 prefetched the forwarded subject + body, but a failed load fell
 *    through to a BLANK composer — failure looked exactly like success with
 *    an empty original. A failed load must render an HONEST error state
 *    (denied / deleted / offline) with a Retry action, never a composer.
 *  - #1556 carried attachments, but in a second, uncoordinated fetch with
 *    no send gate and no per-forward reset: send could go out before the
 *    carryover landed, and navigating forward A -> forward B kept A's
 *    attachments (the composer's apply-once ref never reset).
 *
 * So the page runs ONE load through this state machine, in two phases:
 *
 *  Phase 1 — resolve the original (message id first, thread id fallback to
 *  its latest message, mirroring the reply loader). Success yields the
 *  prefill; failure yields a classified kind and the page renders the error
 *  screen instead of any composer. No composer exists yet in either
 *  sub-case, so a late prefill can never clobber typed text.
 *
 *  Phase 2 — resolve the original's attachments. The composer IS mounted
 *  now (subject + body are already final), but Send stays DISABLED until
 *  this phase settles — `forwardSendDisabledReason` is the single source of
 *  that gate. Settling always enables send again: carried files are
 *  applied, dropped files are warned about persistently, and a send after
 *  settling can never silently go out without the files it promised.
 *
 * The reducer is pure and exported so the whole machine — success, thread
 * fallback, 403, 404, offline+Retry, subject/body precedence, A->B reset,
 * resolving -> send-disabled -> resolved -> send-enabled — is testable
 * without a composer, a DOM, or a network. The page effect only dispatches
 * its actions and honors the phase; it holds no transition logic of its own.
 */

import {
  buildForwardQuote,
  normalizeForwardSubject,
  type QuotableMessage,
} from './email-body';
import type {
  ForwardCarriedAttachment,
  ForwardDroppedAttachment,
  ForwardOriginalAttachment,
} from './forward-attachments';

/** Why the original could not be loaded, in the user's own terms. */
export type ForwardLoadFailureKind = 'denied' | 'deleted' | 'offline' | 'unavailable';

/** The honest copy the error screen shows for each failure kind. */
export const FORWARD_LOAD_FAILURE_COPY: Record<
  ForwardLoadFailureKind,
  { title: string; body: string }
> = {
  denied: {
    title: 'You don\u2019t have access to this message',
    body: 'The original message could not be opened because access was denied. It may belong to another mailbox or have had its sharing removed. Nothing has been sent.',
  },
  deleted: {
    title: 'This message is no longer available',
    body: 'The original message could not be found. It may have been deleted or moved. Nothing has been sent.',
  },
  offline: {
    title: 'You\u2019re offline',
    body: 'The original message could not be loaded because the network is unreachable. Check your connection and retry — nothing has been sent.',
  },
  unavailable: {
    title: 'The original message could not be loaded',
    body: 'Something went wrong loading the message to forward. Retry, or go back — nothing has been sent.',
  },
};

/**
 * The original message as the prefill + carryover need it: quotable text
 * fields plus the wire attachments. `attachments` defaults to [] when the
 * wire record carries none, so callers never branch on its presence.
 */
export interface ForwardOriginal extends QuotableMessage {
  attachments: ForwardOriginalAttachment[];
}

/** One fetch attempt's outcome, in apiClient's ApiResponse shape. */
export interface ForwardFetchResult {
  success: boolean;
  data?: unknown;
  error?: { statusCode?: number; message?: string };
}

export interface ForwardFetchers {
  getEmail: (id: string) => Promise<ForwardFetchResult>;
  getThread: (id: string) => Promise<ForwardFetchResult>;
}

export type ForwardResolveResult =
  | { ok: true; message: ForwardOriginal; via: 'message' | 'thread' }
  | { ok: false; kind: ForwardLoadFailureKind };

function messageTime(m: QuotableMessage): number {
  const raw = m.receivedAt ?? m.createdAt ?? 0;
  const t = new Date(raw as string | number | Date).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** The thread's latest message (by received/created date), or null. */
export function pickLatestMessage(
  messages: ForwardOriginal[],
): ForwardOriginal | null {
  if (messages.length === 0) return null;
  return [...messages].sort((a, b) => messageTime(b) - messageTime(a))[0] ?? null;
}

/**
 * Classify a failed load from what the attempts reported. Precedence is
 * deliberate: a network failure anywhere means the answers that did arrive
 * cannot be trusted (an offline message fetch + a stale 404 thread answer
 * is an offline story, not a deleted one); a denial outranks a not-found
 * because permission is the fact the user can act on.
 */
export function classifyForwardLoadFailure(input: {
  statuses: number[];
  networkThrew: boolean;
}): ForwardLoadFailureKind {
  if (input.networkThrew) return 'offline';
  if (input.statuses.some((s) => s === 401 || s === 403)) return 'denied';
  if (input.statuses.some((s) => s === 404)) return 'deleted';
  if (input.statuses.some((s) => s === 0)) return 'offline';
  return 'unavailable';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Normalize one wire record into a ForwardOriginal, or null when unusable. */
export function normalizeForwardOriginal(data: unknown): ForwardOriginal | null {
  if (!isRecord(data)) return null;
  const attachments = Array.isArray(data.attachments)
    ? (data.attachments.filter(isRecord) as unknown as ForwardOriginalAttachment[])
    : [];
  return {
    from: data.from as QuotableMessage['from'],
    to: data.to as QuotableMessage['to'],
    subject: asString(data.subject) ?? undefined,
    receivedAt: data.receivedAt as QuotableMessage['receivedAt'],
    createdAt: data.createdAt as QuotableMessage['createdAt'],
    updatedAt: data.updatedAt as QuotableMessage['updatedAt'],
    bodyText: asString(data.bodyText) ?? undefined,
    bodyHtml: asString(data.bodyHtml) ?? undefined,
    snippet: asString(data.snippet) ?? undefined,
    attachments,
  };
}

function abortError(): Error {
  const err = new Error('Forward load was aborted.');
  err.name = 'AbortError';
  return err;
}

/**
 * Resolve the original for `?forward=<id>`: message endpoint first, then
 * the thread's latest message. A thread fallback inherits the thread's
 * subject when the latest message itself names none (the thread view's
 * forward action passes a thread id, and its messages can arrive
 * subject-less). Only aborts reject — every other failure classifies into
 * `{ ok: false, kind }`, never a throw, so the caller cannot mistake a
 * failed load for a missing original.
 */
export async function resolveForwardOriginal(
  fetchers: ForwardFetchers,
  id: string,
  signal?: AbortSignal,
): Promise<ForwardResolveResult> {
  const statuses: number[] = [];
  let networkThrew = false;

  const attempt = async (
    run: () => Promise<ForwardFetchResult>,
  ): Promise<ForwardFetchResult | null> => {
    try {
      return await run();
    } catch {
      networkThrew = true;
      return null;
    }
  };

  if (signal?.aborted) throw abortError();
  const one = await attempt(() => fetchers.getEmail(id));
  if (signal?.aborted) throw abortError();
  if (one?.success && one.data !== undefined) {
    const message = normalizeForwardOriginal(one.data);
    if (message) return { ok: true, message, via: 'message' };
  } else if (one && !one.success) {
    statuses.push(one.error?.statusCode ?? 0);
  }

  const thread = await attempt(() => fetchers.getThread(id));
  if (signal?.aborted) throw abortError();
  if (thread?.success && isRecord(thread.data)) {
    const rawMessages = Array.isArray(thread.data.messages)
      ? thread.data.messages
      : [];
    const normalized = rawMessages
      .map(normalizeForwardOriginal)
      .filter((m): m is ForwardOriginal => m !== null);
    const latest = pickLatestMessage(normalized);
    if (latest) {
      if (!latest.subject?.trim()) {
        const threadSubject = asString(thread.data.subject);
        if (threadSubject) latest.subject = threadSubject;
      }
      return { ok: true, message: latest, via: 'thread' };
    }
    // A thread that answers but names no messages is not a denial or a
    // deletion — it contributes no status; the kind comes from the message
    // attempt, or 'unavailable' when that attempt also said nothing.
  } else if (thread && !thread.success) {
    statuses.push(thread.error?.statusCode ?? 0);
  }

  return { ok: false, kind: classifyForwardLoadFailure({ statuses, networkThrew }) };
}

/**
 * Subject/body precedence for a loaded original. An explicit `?subject=`
 * always wins over the forwarded subject; an explicit `?body=` always wins
 * over the forwarded body — but an explicit body must NOT suppress the
 * forwarded SUBJECT. So the subject is computed on every load (explicit,
 * else `Fwd: `), while the body is `null` exactly when an explicit
 * non-empty body wins (the caller keeps the explicit body then). An empty
 * explicit body is treated as absent, matching the page's falsy checks:
 * `?body=` with nothing in it must not blank out the forwarded quote.
 */
export function forwardPrefillFor(input: {
  explicitSubject?: string | null;
  explicitBody?: string | null;
  original: ForwardOriginal;
}): { subject: string; body: string | null } {
  const subject = input.explicitSubject?.trim()
    ? input.explicitSubject
    : normalizeForwardSubject(input.original.subject ?? '');
  const body = input.explicitBody ? null : buildForwardQuote(input.original);
  return { subject, body };
}

// ============================================================================
// The page's forward state machine (pure reducer)
// ============================================================================

export type ForwardComposePhase =
  | 'idle'
  | 'loading-original'
  | 'resolving-attachments'
  | 'ready'
  | 'failed';

export interface ForwardComposeState {
  /** The forward id this state belongs to; null when no forward applies. */
  runId: string | null;
  phase: ForwardComposePhase;
  failureKind: ForwardLoadFailureKind | null;
  /** The `Fwd: ` subject (explicit subjects win at render, not here). */
  subject: string | null;
  /** The forwarded body, or null when an explicit body won. */
  body: string | null;
  /** Carried attachments once phase 2 settles; null while unresolved. */
  attachments: ForwardCarriedAttachment[] | null;
  /** Original files that could not ride along, with reasons. */
  warnings: ForwardDroppedAttachment[];
}

export const initialForwardComposeState: ForwardComposeState = {
  runId: null,
  phase: 'idle',
  failureKind: null,
  subject: null,
  body: null,
  attachments: null,
  warnings: [],
};

export type ForwardComposeAction =
  /** A new forward run starts: EVERYTHING from the previous run is dropped. */
  | { type: 'start-run'; runId: string }
  /** No forward applies any more (reply/draft won, or plain compose). */
  | { type: 'clear' }
  | {
      type: 'original-loaded';
      subject: string;
      body: string | null;
      hasAttachments: boolean;
    }
  | { type: 'original-failed'; kind: ForwardLoadFailureKind }
  | {
      type: 'attachments-settled';
      carried: ForwardCarriedAttachment[];
      dropped: ForwardDroppedAttachment[];
    };

export function forwardComposeReducer(
  state: ForwardComposeState,
  action: ForwardComposeAction,
): ForwardComposeState {
  switch (action.type) {
    case 'start-run':
      // A->B reset lives HERE, not in the effect's cleanup: a new run id
      // wipes the previous run's subject, body, attachments, warnings and
      // failure, so B can never render A's leftovers while B loads — even
      // for a frame, even if B then fails.
      return {
        ...initialForwardComposeState,
        runId: action.runId,
        phase: 'loading-original',
      };
    case 'clear':
      return initialForwardComposeState;
    case 'original-loaded':
      return {
        ...state,
        phase: action.hasAttachments ? 'resolving-attachments' : 'ready',
        failureKind: null,
        subject: action.subject,
        body: action.body,
      };
    case 'original-failed':
      return {
        ...state,
        phase: 'failed',
        failureKind: action.kind,
        subject: null,
        body: null,
        attachments: null,
        warnings: [],
      };
    case 'attachments-settled':
      return {
        ...state,
        phase: 'ready',
        attachments: action.carried,
        warnings: action.dropped,
      };
  }
}

/**
 * The send gate, as one selector: Send is disabled exactly while the
 * original's attachments are still resolving. Every other phase renders
 * either no composer (loading-original, failed, idle) or a send-ready one
 * (ready) — so a null here is always safe to send, and a non-null here is
 * always the honest reason shown on the disabled Send button.
 */
export function forwardSendDisabledReason(
  state: ForwardComposeState,
): string | null {
  return state.phase === 'resolving-attachments'
    ? 'Still loading the original message\u2019s attachments \u2014 Send is paused until they finish loading.'
    : null;
}
