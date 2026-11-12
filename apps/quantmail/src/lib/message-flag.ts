/**
 * Pure helpers for Outlook-style message flagging (QuantMail S1).
 */

export type Flaggable = {
  isFlagged?: boolean | null;
};

export type FlagMessage = Flaggable & {
  id: string;
  collapsedIds?: string[];
};

export type ConversationThreadLike = {
  id: string;
  threadId?: string;
  messages: ReadonlyArray<{ id: string }>;
  isFlagged?: boolean | null;
};

/**
 * Returns true only when isFlagged is explicitly true.
 * Tolerates null, undefined, non-objects.
 */
export function readFlag(record: Flaggable | null | undefined): boolean {
  return record?.isFlagged === true;
}

/**
 * A conversation or collection is flagged iff at least one message is flagged.
 */
export function anyFlagged(messages: ReadonlyArray<Flaggable> | null | undefined): boolean {
  if (!messages || !Array.isArray(messages)) return false;
  return messages.some((m) => readFlag(m));
}

/**
 * Selection bar helper (AC-20, MEDIUM 7):
 * Returns true iff all selected conversations are flagged.
 * If selectedIds is empty, returns false.
 * If any selected ID does not match a conversation, it reads as unflagged (returns false).
 */
export function allConversationsFlagged(
  threads: ReadonlyArray<ConversationThreadLike>,
  selectedIds: Iterable<string>,
): boolean {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return false;

  for (const id of ids) {
    const matched = threads.find(
      (t) => t.id === id || t.threadId === id || t.messages.some((m) => m.id === id),
    );
    if (!matched || !readFlag(matched)) {
      return false;
    }
  }

  return true;
}

/**
 * Return stored row IDs that need to change for a conversation to reach target.
 * For each message where readFlag(m) !== target, includes message.id plus any collapsedIds.
 */
export function flagChangeIds(
  messages: ReadonlyArray<FlagMessage> | null | undefined,
  target: boolean,
): string[] {
  if (!messages || !Array.isArray(messages)) return [];
  const ids: string[] = [];
  for (const m of messages) {
    if (readFlag(m) !== target) {
      ids.push(m.id);
      if (Array.isArray(m.collapsedIds)) {
        ids.push(...m.collapsedIds);
      }
    }
  }
  return ids;
}

/**
 * Determine settled flag state for messages in a conversation after API calls complete.
 * acceptedIds is the set of IDs whose setFlagged request succeeded.
 * - target === true: a message becomes flagged if its id OR any of its collapsedIds was accepted (or it was already flagged).
 * - target === false: a message becomes unflagged only if all of its stored row IDs (id + collapsedIds) were accepted.
 */
export function settleFlags(
  messages: ReadonlyArray<FlagMessage> | null | undefined,
  target: boolean,
  acceptedIds: ReadonlySet<string>,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (!messages || !Array.isArray(messages)) return result;

  for (const m of messages) {
    const wasFlagged = readFlag(m);
    if (wasFlagged === target) {
      result.set(m.id, wasFlagged);
      continue;
    }

    const rowIds = [m.id, ...(m.collapsedIds || [])];
    if (target === true) {
      const anyAccepted = rowIds.some((id) => acceptedIds.has(id));
      result.set(m.id, anyAccepted ? true : wasFlagged);
    } else {
      // target === false: all rowIds must be accepted to be unflagged
      const allAccepted = rowIds.every((id) => acceptedIds.has(id));
      result.set(m.id, allAccepted ? false : true);
    }
  }

  return result;
}
