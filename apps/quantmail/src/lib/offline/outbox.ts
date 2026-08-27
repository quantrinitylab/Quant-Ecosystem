/**
 * The mutation outbox.
 *
 * Archiving a conversation used to mean: await the HTTP call, then refetch the
 * entire inbox, then re-render. Two round trips of latency for a keystroke that
 * should feel instant, and a hard failure with no connection.
 *
 * Now the UI updates immediately and the intent is recorded here. If the request
 * succeeds the entry is dropped; if the network is down or flaky the entry
 * survives a reload and replays on reconnect. Order is preserved, because
 * `toggleStar` is a toggle: replaying two of them out of order would land on the
 * wrong state.
 */

import { apiClient } from '../../services/api-client';
import { createId, mailDatabase, STORE_OUTBOX } from './client';

export type MailMutationKind =
  | 'archive'
  | 'unarchive'
  | 'trash'
  | 'restore'
  | 'toggleStar'
  | 'markRead'
  | 'markUnread'
  | 'snooze';

export interface OutboxEntry {
  id: string;
  kind: MailMutationKind;
  emailId: string;
  /** ISO timestamp, for `snooze`. */
  snoozeUntil?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

/** Delay before each retry, indexed by attempt count. Then it stops trying. */
const RETRY_BACKOFF_MS = [0, 1_000, 4_000, 15_000, 60_000];

type Envelope = { success: boolean; error?: { message: string; statusCode: number } };

/** Perform one queued mutation against the API. */
function execute(entry: OutboxEntry): Promise<Envelope> {
  switch (entry.kind) {
    case 'archive':
      return apiClient.archiveEmail(entry.emailId);
    case 'unarchive':
      return apiClient.unarchiveEmail(entry.emailId);
    case 'trash':
      return apiClient.deleteEmail(entry.emailId);
    case 'restore':
      return apiClient.restoreEmail(entry.emailId);
    case 'toggleStar':
      return apiClient.toggleStar(entry.emailId);
    case 'markRead':
      return apiClient.markAsRead(entry.emailId);
    case 'markUnread':
      return apiClient.markAsUnread(entry.emailId);
    case 'snooze':
      return apiClient.snoozeEmail(entry.emailId, new Date(entry.snoozeUntil ?? Date.now()));
  }
}

/**
 * A 4xx means the server understood and refused — replaying will not help, so
 * the entry is discarded and the caller is told to reconcile. 5xx and network
 * errors are transient and get retried.
 */
function isPermanent(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export interface OutboxState {
  pending: number;
  /** Entries abandoned after a permanent failure, awaiting reconciliation. */
  rejected: OutboxEntry[];
  isFlushing: boolean;
}

const listeners = new Set<(state: OutboxState) => void>();
let state: OutboxState = { pending: 0, rejected: [], isFlushing: false };
let flushing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function setState(patch: Partial<OutboxState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribeToOutbox(listener: (state: OutboxState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getOutboxState(): OutboxState {
  return state;
}

/** True when the browser believes it has connectivity. Optimistic by default. */
function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * Record a mutation and try to send it straight away.
 *
 * Resolves once the mutation has either been accepted by the server or safely
 * persisted for later — never rejects, because the caller has already updated
 * the UI and there is nothing useful for it to do with an exception.
 */
export async function enqueue(
  kind: MailMutationKind,
  emailId: string,
  extra: { snoozeUntil?: Date } = {},
): Promise<{ sent: boolean; rejected?: OutboxEntry }> {
  const entry: OutboxEntry = {
    id: createId('outbox'),
    kind,
    emailId,
    snoozeUntil: extra.snoozeUntil?.toISOString(),
    createdAt: Date.now(),
    attempts: 0,
  };

  // Persist first: a reload between the API call and the write must not lose the
  // user's intent.
  await mailDatabase.put(STORE_OUTBOX, entry);
  await refreshPendingCount();

  if (!isOnline()) return { sent: false };

  await flush();
  // Still queued means it did not go through; the retry loop owns it now.
  const remaining = await mailDatabase.get<OutboxEntry>(STORE_OUTBOX, entry.id);
  const rejected = state.rejected.find((candidate) => candidate.id === entry.id);
  return { sent: !remaining && !rejected, rejected };
}

async function refreshPendingCount(): Promise<void> {
  const all = await mailDatabase.getAll<OutboxEntry>(STORE_OUTBOX);
  setState({ pending: all.length });
}

/**
 * Send every queued mutation in order.
 *
 * Serialised through a single in-flight promise: two `online` events, or an
 * `online` event racing a fresh `enqueue`, must not send the same entry twice.
 */
export function flush(): Promise<void> {
  if (flushing) return flushing;

  flushing = (async () => {
    setState({ isFlushing: true });
    try {
      const entries = (await mailDatabase.getAll<OutboxEntry>(STORE_OUTBOX)).sort(
        (a, b) => a.createdAt - b.createdAt,
      );

      for (const entry of entries) {
        if (!isOnline()) break;

        let envelope: Envelope;
        try {
          envelope = await execute(entry);
        } catch (error) {
          // Transport failure: keep the entry and schedule a retry.
          await recordAttempt(entry, error instanceof Error ? error.message : 'Network error');
          break;
        }

        if (envelope.success) {
          await mailDatabase.delete(STORE_OUTBOX, entry.id);
          continue;
        }

        if (isPermanent(envelope.error?.statusCode)) {
          await mailDatabase.delete(STORE_OUTBOX, entry.id);
          setState({
            rejected: [...state.rejected, { ...entry, lastError: envelope.error?.message }],
          });
          continue;
        }

        await recordAttempt(entry, envelope.error?.message ?? 'Server error');
        break;
      }

      await refreshPendingCount();
    } finally {
      setState({ isFlushing: false });
      flushing = null;
    }
  })();

  return flushing;
}

async function recordAttempt(entry: OutboxEntry, message: string): Promise<void> {
  const attempts = entry.attempts + 1;
  if (attempts >= RETRY_BACKOFF_MS.length) {
    // Out of patience. Surface it rather than retrying forever in the background.
    await mailDatabase.delete(STORE_OUTBOX, entry.id);
    setState({ rejected: [...state.rejected, { ...entry, attempts, lastError: message }] });
    return;
  }

  await mailDatabase.put(STORE_OUTBOX, { ...entry, attempts, lastError: message });
  scheduleRetry(RETRY_BACKOFF_MS[attempts]);
}

function scheduleRetry(delay: number): void {
  if (retryTimer !== null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, delay);
}

/** Acknowledge rejected entries so the badge clears after reconciliation. */
export function clearRejected(): void {
  if (state.rejected.length > 0) setState({ rejected: [] });
}

/** Discard everything. Called on sign-out. */
export async function clearOutbox(): Promise<void> {
  await mailDatabase.clear(STORE_OUTBOX);
  setState({ pending: 0, rejected: [] });
}

let started = false;

/**
 * Begin replaying queued mutations, and keep replaying on reconnect and on tab
 * focus. Idempotent, so mounting the provider twice is harmless.
 */
export function startOutbox(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (started) return () => {};
  started = true;

  const onOnline = () => void flush();
  const onVisible = () => {
    if (document.visibilityState === 'visible' && isOnline()) void flush();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  void flush();

  return () => {
    started = false;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
