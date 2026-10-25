/**
 * Read receipts — the per-user default for open tracking (fix/qm-read-receipts).
 *
 * The finding: QuantMail had a per-message beacon toggle in the full and
 * docked composers but no setting anywhere, so every composer defaulted to
 * ON by hardcoding `useState(true)` — a user who never wanted tracking had
 * to opt out message by message, and the person-thread composer (the
 * default home surface) had no toggle at all. The settings page had
 * previously *removed* "Automatic Read Receipts" as fake because nothing
 * persisted or read it; this service is the persisted half that makes the
 * new Settings toggle real instead of a second fake.
 *
 * The preference is one boolean inside `User.preferences` JSON, so no
 * schema migration is needed — the same pattern as the mail notification
 * mode (`mail-notification-mode.service.ts`). It is the DEFAULT, not a
 * lock: a per-message toggle still overrides it for that message, and an
 * explicit `trackOpens` on a compose request always wins. Only a compose
 * request that omits `trackOpens` falls back to this preference
 * (routes/emails.ts), and a store failure on that path fails OPEN to true
 * — the pre-existing behaviour — so a preference outage never silently
 * changes what a send does.
 */

import type { PrismaClient } from '@prisma/client';

/** The `User.preferences` JSON key this setting lives under. */
export const READ_RECEIPTS_PREFERENCE_KEY = 'readReceiptsEnabled';

/**
 * Backwards-compatible default: before this setting existed, composers
 * defaulted to tracked and the backend applied `trackOpens ?? true`. An
 * unset or unrecognised stored value must keep that behaviour.
 */
export const DEFAULT_READ_RECEIPTS_ENABLED = true;

export function normalizeReadReceiptsEnabled(value: unknown): boolean {
  return value === false ? false : DEFAULT_READ_RECEIPTS_ENABLED;
}

export function readReadReceiptsEnabledFromPreferences(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return DEFAULT_READ_RECEIPTS_ENABLED;
  }
  return normalizeReadReceiptsEnabled(
    (preferences as Record<string, unknown>)[READ_RECEIPTS_PREFERENCE_KEY],
  );
}

interface WarnLogger {
  warn(obj: unknown, msg: string): void;
}

/** Structural view of the Prisma delegates this module touches. */
export interface ReadReceiptsPreferenceStore {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { preferences: true };
    }): Promise<{ preferences: unknown } | null>;
    update(args: {
      where: { id: string };
      data: { preferences: unknown };
    }): Promise<unknown>;
  };
}

type PrismaStore = Pick<PrismaClient, 'user'>;

/**
 * The user's setting, or the fail-open default. A preference read must never
 * change a send's tracking on its own: any store failure keeps the old
 * tracked-by-default behaviour rather than silently untracking mail.
 */
export async function readUserReadReceiptsEnabled(
  store: ReadReceiptsPreferenceStore | PrismaStore,
  userId: string,
  log?: WarnLogger,
): Promise<boolean> {
  try {
    const user = await (store as ReadReceiptsPreferenceStore).user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    return readReadReceiptsEnabledFromPreferences(user?.preferences);
  } catch (error) {
    log?.warn(
      { err: error, userId },
      '[read-receipts] preference read failed — composing as before (tracked)',
    );
    return DEFAULT_READ_RECEIPTS_ENABLED;
  }
}

/**
 * Persists the setting by merging it into the existing `preferences` JSON,
 * so unrelated keys the user (or other features) stored there survive the
 * write.
 */
export async function writeUserReadReceiptsEnabled(
  store: ReadReceiptsPreferenceStore | PrismaStore,
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  const current = await (store as ReadReceiptsPreferenceStore).user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const merged: Record<string, unknown> =
    current?.preferences && typeof current.preferences === 'object' && !Array.isArray(current.preferences)
      ? { ...(current.preferences as Record<string, unknown>) }
      : {};
  merged[READ_RECEIPTS_PREFERENCE_KEY] = enabled;
  await (store as ReadReceiptsPreferenceStore).user.update({
    where: { id: userId },
    data: { preferences: merged },
  });
  return enabled;
}
