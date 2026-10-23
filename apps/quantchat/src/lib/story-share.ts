// ============================================================================
// QuantChat - Story share card wire shape (QC-F-556)
// ============================================================================
//
// A story share is a REFERENCE card, never a copy: the backend mints an
// ordinary text message whose server-owned metadata carries
// `storyShare = { storyId, authorId, authorName, authorAvatar, storyType,
// audience, createdAt, expiresAt }` — identity + type + expiry ONLY. The
// snapshot deliberately contains no mediaUrl / text / thumbnail: a photo
// story's mediaUrl is an inline `data:` URL (the content itself), so
// snapshotting content would hand it to every member of the target
// conversation and bypass the story audience gate. Opening the card goes
// through the gated `GET /stories/:storyId`, which re-runs the same gate
// for the opener — holding the card grants nothing.
//
// This parser is the client-side mirror: it accepts only the exact
// server snapshot shape and returns null for anything else, so a plain
// text message (or a hand-crafted payload missing the server key) never
// renders as a card.
// ============================================================================

export interface StoryShareSnapshot {
  storyId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  storyType: 'photo' | 'video' | 'text';
  audience: string;
  createdAt: string;
  expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Parse `metadata.storyShare` from a message record; null when absent/misshapen. */
export function parseStoryShare(metadata: unknown): StoryShareSnapshot | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata['storyShare'];
  if (!isRecord(raw)) return null;
  const storyId = asString(raw['storyId']);
  const authorId = asString(raw['authorId']);
  const authorName = asString(raw['authorName']);
  const storyType = raw['storyType'];
  const createdAt = asString(raw['createdAt']);
  const expiresAt = asString(raw['expiresAt']);
  if (!storyId || !authorId || !authorName || !createdAt || !expiresAt) return null;
  if (storyType !== 'photo' && storyType !== 'video' && storyType !== 'text') return null;
  if (Number.isNaN(Date.parse(expiresAt)) || Number.isNaN(Date.parse(createdAt))) return null;
  return {
    storyId,
    authorId,
    authorName,
    authorAvatar: typeof raw['authorAvatar'] === 'string' ? raw['authorAvatar'] : '',
    storyType,
    audience: typeof raw['audience'] === 'string' ? raw['audience'] : 'ALL',
    createdAt,
    expiresAt,
  };
}

/** A shared story is expired when its snapshot expiry is in the past. */
export function isStoryShareExpired(share: StoryShareSnapshot, now: number = Date.now()): boolean {
  return Date.parse(share.expiresAt) <= now;
}
