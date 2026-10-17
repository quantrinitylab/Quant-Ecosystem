// ===========================================================================
// QuantChat — expiring emoji status (QC-F-466 Slice 1)
// ===========================================================================
//
// A user's emoji status is a short-lived, self-chosen identity badge shown
// next to their name (Telegram-style). It is stored on the User row as two
// nullable columns (`statusEmoji`, `statusEmojiExpiresAt`) that are always
// written together or cleared together.
//
// Closed decisions (specialist-qc-f-466-buildprep.md §3):
//  - The ONLY emoji source is the first-party QC-F-336 catalog
//    (`src/lib/custom-emoji.ts`, pack `quant`, 12 entries). The name list
//    below is a hand mirror of that catalog; a contract test pins the two
//    lists together so drift fails the suite instead of silently accepting
//    a key the client can never render. Arbitrary unicode is REJECTED —
//    the server never stores a glyph it cannot resolve to a real asset.
//  - Clients never send an absolute expiry. They send a closed duration
//    enum and the server computes `expiresAt` from its own clock, so
//    client clock skew can neither extend nor forge a status.
//  - Expiry is enforced at READ time by `liveEmojiStatus` — every
//    serializer goes through it, so an expired status is never served
//    even though its row may still sit in the DB (no sweeper in Slice 1).

import { z } from 'zod';

export const EMOJI_STATUS_PACK = 'quant';

/** Mirror of CUSTOM_EMOJI_PACKS[quant].entries[].name in src/lib/custom-emoji.ts. */
export const EMOJI_STATUS_NAMES = [
  'wave',
  'pulse-heart',
  'star-burst',
  'flame',
  'smile-sun',
  'moon-star',
  'rocket',
  'gem',
  'bolt',
  'confetti-pop',
  'music-note',
  'check-badge',
] as const;

const NAME_SET: ReadonlySet<string> = new Set(EMOJI_STATUS_NAMES);

/** Stored key shape: "<pack>:<name>", e.g. "quant:flame". */
export function isEmojiStatusKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return false;
  const sep = value.indexOf(':');
  if (sep <= 0) return false;
  const pack = value.slice(0, sep);
  const name = value.slice(sep + 1);
  return pack === EMOJI_STATUS_PACK && NAME_SET.has(name);
}

export const EMOJI_STATUS_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

export type EmojiStatusDuration = keyof typeof EMOJI_STATUS_DURATIONS;

/**
 * The write shape accepted by PUT /auth/profile: a nested object to set /
 * replace the status, or (at the call site) `null` to clear it. Absolute
 * expiries and foreign fields are rejected by the strict object + the
 * catalog refine.
 */
export const emojiStatusInputSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(40)
      .refine(isEmojiStatusKey, { message: 'Unknown emoji status key' }),
    duration: z.enum(['1h', '24h', '7d']),
  })
  .strict();

export interface LiveEmojiStatus {
  key: string;
  expiresAt: Date;
}

export interface EmojiStatusSource {
  statusEmoji?: string | null;
  statusEmojiExpiresAt?: Date | string | null;
}

/**
 * The one read path for a stored status. Both columns must be present,
 * the key must still resolve in the catalog, and the expiry must be
 * strictly in the future — anything else is `null` (never served).
 */
export function liveEmojiStatus(
  source: EmojiStatusSource | null | undefined,
  now: Date = new Date(),
): LiveEmojiStatus | null {
  if (!source) return null;
  const key = source.statusEmoji;
  const rawExpiry = source.statusEmojiExpiresAt;
  if (!isEmojiStatusKey(key) || rawExpiry == null) return null;
  const expiresAt = rawExpiry instanceof Date ? rawExpiry : new Date(rawExpiry);
  if (Number.isNaN(expiresAt.getTime())) return null;
  if (expiresAt.getTime() <= now.getTime()) return null;
  return { key, expiresAt };
}

/** Wire shape used by every DTO: `{ key, expiresAt: ISO } | null`. */
export function serializeEmojiStatus(
  source: EmojiStatusSource | null | undefined,
  now: Date = new Date(),
): { key: string; expiresAt: string } | null {
  const live = liveEmojiStatus(source, now);
  return live ? { key: live.key, expiresAt: live.expiresAt.toISOString() } : null;
}
