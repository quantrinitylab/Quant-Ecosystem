/**
 * Per-person reply-draft persistence for ThreadComposer.
 *
 * Finding qm-threadcomposer-draft-persist: the DESIGN-LOCKED default
 * person-thread reply surface used to wipe a typed reply on person switch
 * (a useEffect on conversation.personKey did setBody('') with zero
 * persistence). Drafts now survive navigation WhatsApp-style: each person's
 * unsent reply — body plus the new-topic subject state — is kept under a
 * per-person localStorage key, restored when the user returns, and cleared
 * when the reply actually sends.
 *
 * Scope, stated honestly: this is same-device persistence (localStorage).
 * It is not a server draft — no backend endpoint is invented for it, and
 * nothing here touches the Drafts folder or the #771 send path
 * (compose-then-send), which still creates its own draft per send.
 *
 * Everything in this module is framework-free and unit-testable without a
 * DOM, mirroring the DraftAutosaveController precedent: the component owns
 * the React wiring, this module owns the persistence logic.
 */

export interface ThreadReplyDraft {
  /** Unsent reply text. */
  body: string;
  /** Whether the "New topic" subject field was open. */
  newTopic: boolean;
  /** The typed new-topic subject, if any. */
  customSubject: string;
  /** Epoch ms of the last write — lets future housekeeping prune stale drafts. */
  updatedAt: number;
}

/** Storage-key namespace. One key per person conversation. */
export const THREAD_DRAFT_STORAGE_PREFIX = 'qm.threadReplyDraft.v1.';

export function threadDraftKey(personKey: string): string {
  return `${THREAD_DRAFT_STORAGE_PREFIX}${personKey}`;
}

/**
 * The minimal storage surface the logic needs. In the app this is
 * window.localStorage; in tests a Map-backed stub. Passing the store in
 * keeps the logic honest about environments where storage is unavailable
 * (SSR prerender, locked-down browsers) — those degrade to "no draft
 * persistence" instead of throwing.
 */
export interface ThreadDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function windowThreadDraftStorage(): ThreadDraftStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Parse a stored payload defensively. Corrupt or foreign entries degrade to
 * null — a poisoned key must never break the composer or surface garbage
 * text in the box.
 */
export function parseThreadDraft(raw: string | null | undefined): ThreadReplyDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ThreadReplyDraft> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.body !== 'string') {
      return null;
    }
    return {
      body: parsed.body,
      newTopic: parsed.newTopic === true,
      customSubject: typeof parsed.customSubject === 'string' ? parsed.customSubject : '',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Null store or empty personKey means "no persistence available" — never throws. */
export function loadThreadDraft(
  store: ThreadDraftStorage | null,
  personKey: string,
): ThreadReplyDraft | null {
  if (!store || !personKey) return null;
  try {
    return parseThreadDraft(store.getItem(threadDraftKey(personKey)));
  } catch {
    return null;
  }
}

/** True when there is nothing worth keeping — an empty box with no subject. */
export function isThreadDraftEmpty(draft: { body: string; customSubject: string }): boolean {
  return draft.body.trim().length === 0 && draft.customSubject.trim().length === 0;
}

/**
 * Persist a draft. Returns true when the write landed; false when storage is
 * unavailable or threw (private-mode quota, disabled cookies, …). The
 * component turns false into the honest "Couldn't save" indicator — the UI
 * never claims a draft is saved when it isn't.
 */
export function saveThreadDraft(
  store: ThreadDraftStorage | null,
  personKey: string,
  draft: ThreadReplyDraft,
): boolean {
  if (!store || !personKey) return false;
  try {
    store.setItem(threadDraftKey(personKey), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Best-effort delete — used when a reply sends, so sent text never resurfaces. */
export function clearThreadDraft(store: ThreadDraftStorage | null, personKey: string): void {
  if (!store || !personKey) return;
  try {
    store.removeItem(threadDraftKey(personKey));
  } catch {
    // Best effort: a stale draft is annoying, never fatal.
  }
}

/**
 * The person-switch transition. Two steps, in order:
 *  1. Flush the outgoing person's latest text first — a keystroke can race
 *     the tap that changes personKey, so the freshest in-memory values are
 *     persisted synchronously before anything is reset.
 *  2. Load the incoming person's saved draft.
 *
 * Pure and unit-testable: the component's useEffect on personKey is a thin
 * wrapper that applies the returned fields to state.
 */
export function switchThreadDraft(args: {
  store: ThreadDraftStorage | null;
  prevPersonKey: string;
  nextPersonKey: string;
  latest: { body: string; newTopic: boolean; customSubject: string };
  /** Epoch ms — injected so tests don't depend on the clock. */
  now: number;
}): { body: string; newTopic: boolean; customSubject: string; hadSavedDraft: boolean } {
  const { store, prevPersonKey, nextPersonKey, latest, now } = args;
  if (prevPersonKey !== nextPersonKey && !isThreadDraftEmpty(latest)) {
    saveThreadDraft(store, prevPersonKey, { ...latest, updatedAt: now });
  }
  const incoming = loadThreadDraft(store, nextPersonKey);
  return {
    body: incoming?.body ?? '',
    newTopic: incoming?.newTopic ?? false,
    customSubject: incoming?.customSubject ?? '',
    hadSavedDraft: incoming !== null,
  };
}
