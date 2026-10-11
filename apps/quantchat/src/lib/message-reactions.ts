// ===========================================================================
// QC-F-020 — message reaction model shared by the thread page.
//
// The backend persists reactions on the message record itself:
//   metadata.reactions = { [emoji]: userId[] }
// (MessageService.reactToMessage / removeReaction). Before this fix the
// thread page kept reactions in a local useState map keyed by message id,
// so they vanished on reload, were invisible to every other member, and
// could be appended unlimited times by the same user. These helpers are
// the single place that reads/writes that persisted shape on the client.
// ===========================================================================

/** emoji -> userIds who reacted with it (the persisted backend shape). */
export type ReactionMap = Record<string, string[]>;

/** Extract the persisted reaction map from a message's metadata, safely. */
export function reactionsFromMetadata(metadata: unknown): ReactionMap {
  if (!metadata || typeof metadata !== 'object') return {};
  const raw = (metadata as Record<string, unknown>)['reactions'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ReactionMap = {};
  for (const [emoji, users] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(users)) {
      const ids = users.filter((u): u is string => typeof u === 'string');
      if (ids.length > 0) out[emoji] = ids;
    }
  }
  return out;
}

/** Expand a reaction map to the flat emoji list the bubble UI renders. */
export function expandReactions(map: ReactionMap): string[] {
  const out: string[] = [];
  for (const [emoji, users] of Object.entries(map)) {
    for (let i = 0; i < users.length; i += 1) out.push(emoji);
  }
  return out;
}

/**
 * Toggle one user's reaction, mirroring the backend service semantics:
 * reacting again with the same emoji removes that user's reaction.
 * Returns a NEW map; the input is never mutated.
 */
export function toggleUserReaction(map: ReactionMap, userId: string, emoji: string): ReactionMap {
  const next: ReactionMap = {};
  for (const [key, users] of Object.entries(map)) next[key] = [...users];
  const users = next[emoji] ?? [];
  if (users.includes(userId)) {
    const remaining = users.filter((id) => id !== userId);
    if (remaining.length === 0) delete next[emoji];
    else next[emoji] = remaining;
  } else {
    next[emoji] = [...users, userId];
  }
  return next;
}
