/**
 * Display settings that roam with the account — theme, row density, and the
 * Assistant "how much thinking" intent.
 *
 * The finding (queue 2026-10-12 P2 [settings]): Gmail settings are
 * account-level — a change on desktop applies to the account as a whole,
 * including the mobile app. QuantMail's three display preferences lived in
 * `localStorage` only (`quant-theme`, `quant-density`, `quant-ai-model-mode`),
 * so setting Obsidian + compact on the phone left defaults on desktop, and
 * the Assistant tab said so explicitly ("stored on this browser — not on
 * your account").
 *
 * These three now live server-side in `User.preferences` JSON, following the
 * mail-notification-mode precedent exactly: no schema migration, one merge
 * write that preserves unrelated keys, per-user scoping from the session.
 * `localStorage` stays as the boot cache and the offline fallback — the
 * pre-paint bootstrap in `layout.tsx` cannot wait on a network round trip,
 * and the settings page paints from it before the account value lands — but
 * it is no longer the source of truth. The frontend sync
 * (`src/lib/display-settings.ts`) reconciles the two with the `updatedAt`
 * stamp below: whichever side changed last wins, so a change made on one
 * device reaches the other instead of being reverted by a stale local copy.
 *
 * Defaults match the old localStorage fallbacks, so a user who never chose
 * sees exactly what they saw before: Obsidian, comfortable rows, Automatic.
 */

import { AI_INTENTS, type AIIntent } from '@quant/common';

export const DISPLAY_THEMES = ['dark', 'light', 'system'] as const;

export type DisplayTheme = (typeof DISPLAY_THEMES)[number];

export const DISPLAY_DENSITIES = ['comfortable', 'cozy', 'compact'] as const;

export type DisplayDensity = (typeof DISPLAY_DENSITIES)[number];

export type DisplayAIIntent = AIIntent;

// Kept as the `as const` tuple (not widened to an array): `z.enum` in the
// route needs the tuple type to infer the literal union.
export const DISPLAY_AI_INTENTS = AI_INTENTS;

/** Backwards-compatible defaults: the old localStorage fallbacks. */
export const DEFAULT_DISPLAY_SETTINGS = {
  theme: 'dark',
  density: 'comfortable',
  aiIntent: 'auto',
} as const satisfies DisplaySettings;

/** The `User.preferences` JSON keys these settings live under. */
export const DISPLAY_THEME_PREFERENCE_KEY = 'displayTheme';
export const DISPLAY_DENSITY_PREFERENCE_KEY = 'displayDensity';
export const DISPLAY_AI_INTENT_PREFERENCE_KEY = 'aiIntent';
/**
 * One stamp for the whole triple, written on every PUT. The frontend sync
 * compares it against its own local stamp to decide which side changed last;
 * a single stamp is enough because the three settings are always written and
 * applied as one display identity, never independently versioned.
 */
export const DISPLAY_SETTINGS_UPDATED_AT_PREFERENCE_KEY = 'displaySettingsUpdatedAt';

export interface DisplaySettings {
  theme: DisplayTheme;
  density: DisplayDensity;
  aiIntent: DisplayAIIntent;
}

/** Which of the three the server actually holds (vs. a default fill-in). */
export interface DisplaySettingsStoredFlags {
  theme: boolean;
  density: boolean;
  aiIntent: boolean;
}

export interface DisplaySettingsRead {
  settings: DisplaySettings;
  stored: DisplaySettingsStoredFlags;
  /** ISO timestamp of the last PUT, or null when nothing is stored yet. */
  updatedAt: string | null;
}

export function normalizeDisplayTheme(value: unknown): DisplayTheme {
  return value === 'dark' || value === 'light' || value === 'system'
    ? value
    : DEFAULT_DISPLAY_SETTINGS.theme;
}

export function normalizeDisplayDensity(value: unknown): DisplayDensity {
  return value === 'comfortable' || value === 'cozy' || value === 'compact'
    ? value
    : DEFAULT_DISPLAY_SETTINGS.density;
}

export function normalizeDisplayAIIntent(value: unknown): DisplayAIIntent {
  return typeof value === 'string' && (AI_INTENTS as readonly string[]).includes(value)
    ? (value as DisplayAIIntent)
    : DEFAULT_DISPLAY_SETTINGS.aiIntent;
}

function normalizeUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * Read the triple out of a `User.preferences` blob. Unknown or missing
 * entries fall back to the old defaults, and `stored` says which fields the
 * fallback filled in — the frontend migration path uploads only the fields
 * the server does not hold yet.
 */
export function readDisplaySettingsFromPreferences(preferences: unknown): DisplaySettingsRead {
  const record =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : {};
  const themeStored = DISPLAY_THEME_PREFERENCE_KEY in record;
  const densityStored = DISPLAY_DENSITY_PREFERENCE_KEY in record;
  const aiIntentStored = DISPLAY_AI_INTENT_PREFERENCE_KEY in record;
  return {
    settings: {
      theme: normalizeDisplayTheme(record[DISPLAY_THEME_PREFERENCE_KEY]),
      density: normalizeDisplayDensity(record[DISPLAY_DENSITY_PREFERENCE_KEY]),
      aiIntent: normalizeDisplayAIIntent(record[DISPLAY_AI_INTENT_PREFERENCE_KEY]),
    },
    stored: { theme: themeStored, density: densityStored, aiIntent: aiIntentStored },
    updatedAt: normalizeUpdatedAt(record[DISPLAY_SETTINGS_UPDATED_AT_PREFERENCE_KEY]),
  };
}

interface WarnLogger {
  warn(obj: unknown, msg: string): void;
}

/** Structural view of the Prisma delegates this module touches. */
export interface DisplaySettingsStore {
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

/**
 * The caller's display settings, or the defaults. A read must never cost the
 * user their theme: any store failure returns the defaults rather than
 * erroring, and the frontend keeps its local copy in the meantime.
 */
export async function readUserDisplaySettings(
  store: DisplaySettingsStore,
  userId: string,
  log?: WarnLogger,
): Promise<DisplaySettingsRead> {
  try {
    const user = await store.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    return readDisplaySettingsFromPreferences(user?.preferences);
  } catch (error) {
    log?.warn(
      { err: error, userId },
      '[display-settings] settings read failed — falling back to defaults',
    );
    return {
      settings: { ...DEFAULT_DISPLAY_SETTINGS },
      stored: { theme: false, density: false, aiIntent: false },
      updatedAt: null,
    };
  }
}

/**
 * Persists a partial triple by merging it into the existing `preferences`
 * JSON, so unrelated stored keys survive the write, and stamps the write
 * time. Returns the full normalised triple with its stored flags, so the
 * caller can adopt the server stamp as its local one.
 */
export async function writeUserDisplaySettings(
  store: DisplaySettingsStore,
  userId: string,
  partial: Partial<DisplaySettings>,
): Promise<DisplaySettingsRead> {
  const current = await store.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const merged: Record<string, unknown> =
    current?.preferences && typeof current.preferences === 'object' && !Array.isArray(current.preferences)
      ? { ...(current.preferences as Record<string, unknown>) }
      : {};
  if (partial.theme !== undefined) merged[DISPLAY_THEME_PREFERENCE_KEY] = partial.theme;
  if (partial.density !== undefined) merged[DISPLAY_DENSITY_PREFERENCE_KEY] = partial.density;
  if (partial.aiIntent !== undefined) merged[DISPLAY_AI_INTENT_PREFERENCE_KEY] = partial.aiIntent;
  merged[DISPLAY_SETTINGS_UPDATED_AT_PREFERENCE_KEY] = new Date().toISOString();
  await store.user.update({ where: { id: userId }, data: { preferences: merged } });
  return readDisplaySettingsFromPreferences(merged);
}
