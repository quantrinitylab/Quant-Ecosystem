/**
 * Read receipts preference (frontend copy of the backend contract in
 * `backend/services/read-receipts-preference.service.ts`).
 *
 * One per-user boolean, stored server-side in `User.preferences` under
 * `readReceiptsEnabled`: the DEFAULT for open tracking on newly composed
 * mail. True (the default, and the pre-existing behaviour) means new mail
 * carries the invisible 1px open beacon, so Sent and thread views can show
 * read ticks; false means new mail sends without the beacon. A per-message
 * compose toggle still overrides it for that one message, and a compose
 * request that omits `trackOpens` falls back to this value server-side —
 * so the Settings toggle changes real sends, not just new composers.
 */

/** The `User.preferences` JSON key this setting lives under. */
export const READ_RECEIPTS_PREFERENCE_KEY = 'readReceiptsEnabled';

/** Backwards-compatible default: tracked, as composers behaved before. */
export const DEFAULT_READ_RECEIPTS_ENABLED = true;

export function normalizeReadReceiptsEnabled(value: unknown): boolean {
  return value === false ? false : DEFAULT_READ_RECEIPTS_ENABLED;
}
