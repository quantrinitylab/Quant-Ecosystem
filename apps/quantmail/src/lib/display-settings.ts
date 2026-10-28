// ============================================================================
// quantmail — display settings that roam with the account (frontend copy of
// the backend contract in `backend/services/display-settings.service.ts`).
//
// The finding (queue 2026-10-12 P2 [settings]): theme, row density and the
// Assistant intent lived in `localStorage` only, so a choice made on the
// phone never reached the desktop. They now live on the account
// (`User.preferences` via GET/PUT `/api/settings/display`) and `localStorage`
// drops to what it is honestly good for:
//
//   - the boot cache: the pre-paint bootstrap in `layout.tsx` reads it before
//     any network round trip exists, so first paint never flashes;
//   - the offline fallback: when the account cannot be reached, the last
//     known values still apply.
//
// Reconciliation rule (`resolveDisplaySettingsSync`, pure and tested): each
// field is reconciled on its own stamp. The server carries one stamp for the
// whole triple (the last PUT time) plus per-field `stored` flags; this
// browser carries one stamp per field (the last local write of that field).
// Per field, in order:
//
//   1. the account holds nothing yet and the local value is not the default
//      → push it up (a pre-feature choice migrating to the account);
//   2. the local stamp is newer than the server's stamp → push the local
//      value up (this browser changed it after the server last heard);
//   3. otherwise the server wins → overwrite the local copy when it differs.
//
// Per-field stamps matter: a whole-triple push would let one changed field
// clobber the other two with stale local values — a theme toggled on the
// desktop must never silently revert a density set on the phone. A local
// field with no stamp at all is legacy data whose recency cannot be proven —
// the server wins there too.
//
// `readAIIntent()` (`lib/ai-intent-preference.ts`) keeps reading
// `localStorage`, and that stays correct: the sync below keeps that copy
// current with the account, so every AI request path gets the roaming value
// without changing its synchronous read.
// ============================================================================

import {
  AI_INTENT_STORAGE_KEY,
  normalizeStoredIntent,
  type AIIntent,
} from '@quant/common';
import { browserApiRequest } from '../services/browser-api-request';

export type DisplayTheme = 'light' | 'dark' | 'system';
export type DisplayDensity = 'comfortable' | 'cozy' | 'compact';
export type DisplayAIIntent = AIIntent;

export const DISPLAY_THEMES: readonly DisplayTheme[] = ['dark', 'light', 'system'];
export const DISPLAY_DENSITIES: readonly DisplayDensity[] = ['comfortable', 'cozy', 'compact'];

export interface DisplaySettings {
  theme: DisplayTheme;
  density: DisplayDensity;
  aiIntent: DisplayAIIntent;
}

/** The old localStorage fallbacks, unchanged — a user who never chose sees nothing move. */
export const DISPLAY_SETTINGS_DEFAULTS: DisplaySettings = {
  theme: 'dark',
  density: 'comfortable',
  aiIntent: 'auto',
};

export const DISPLAY_THEME_STORAGE_KEY = 'quant-theme';
export const DISPLAY_DENSITY_STORAGE_KEY = 'quant-density';
/** One stamp per field: the last local write of that field, ISO or null. */
export const DISPLAY_THEME_UPDATED_AT_STORAGE_KEY = 'quant-theme-updated-at';
export const DISPLAY_DENSITY_UPDATED_AT_STORAGE_KEY = 'quant-density-updated-at';
export const DISPLAY_AI_INTENT_UPDATED_AT_STORAGE_KEY = 'quant-ai-model-mode-updated-at';

export function normalizeDisplayTheme(value: unknown): DisplayTheme {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : DISPLAY_SETTINGS_DEFAULTS.theme;
}

export function normalizeDisplayDensity(value: unknown): DisplayDensity {
  return value === 'comfortable' || value === 'cozy' || value === 'compact'
    ? value
    : DISPLAY_SETTINGS_DEFAULTS.density;
}

export function normalizeDisplayAIIntent(value: unknown): DisplayAIIntent {
  // `normalizeStoredIntent` folds the legacy ids (`auto-router`, raw model
  // names) to `auto`, the same migration the settings page used to do inline.
  return normalizeStoredIntent(typeof value === 'string' ? value : null);
}

export type DisplaySettingsField = keyof DisplaySettings;

export interface LocalDisplaySettings {
  settings: DisplaySettings;
  /** The last local write per field; null for a legacy copy with no stamp. */
  updatedAt: Record<DisplaySettingsField, string | null>;
}

function parseStamp(raw: string | null): string | null {
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** The browser's copy: the three keys plus their stamps. Never throws. */
export function readLocalDisplaySettings(): LocalDisplaySettings {
  if (typeof window === 'undefined') {
    return {
      settings: { ...DISPLAY_SETTINGS_DEFAULTS },
      updatedAt: { theme: null, density: null, aiIntent: null },
    };
  }
  try {
    const themeRaw = window.localStorage.getItem(DISPLAY_THEME_STORAGE_KEY);
    // The `midnight` theme existed briefly and matches no option; the boot
    // script already resolves it to `dark`, so the normalizer does the same.
    const theme = normalizeDisplayTheme(themeRaw === 'midnight' ? 'dark' : themeRaw);
    const density = normalizeDisplayDensity(window.localStorage.getItem(DISPLAY_DENSITY_STORAGE_KEY));
    const aiIntent = normalizeDisplayAIIntent(window.localStorage.getItem(AI_INTENT_STORAGE_KEY));
    return {
      settings: { theme, density, aiIntent },
      updatedAt: {
        theme: parseStamp(window.localStorage.getItem(DISPLAY_THEME_UPDATED_AT_STORAGE_KEY)),
        density: parseStamp(window.localStorage.getItem(DISPLAY_DENSITY_UPDATED_AT_STORAGE_KEY)),
        aiIntent: parseStamp(window.localStorage.getItem(DISPLAY_AI_INTENT_UPDATED_AT_STORAGE_KEY)),
      },
    };
  } catch {
    return {
      settings: { ...DISPLAY_SETTINGS_DEFAULTS },
      updatedAt: { theme: null, density: null, aiIntent: null },
    };
  }
}

const FIELD_STORAGE_KEYS: Record<DisplaySettingsField, { value: string; stamp: string }> = {
  theme: { value: DISPLAY_THEME_STORAGE_KEY, stamp: DISPLAY_THEME_UPDATED_AT_STORAGE_KEY },
  density: { value: DISPLAY_DENSITY_STORAGE_KEY, stamp: DISPLAY_DENSITY_UPDATED_AT_STORAGE_KEY },
  aiIntent: { value: AI_INTENT_STORAGE_KEY, stamp: DISPLAY_AI_INTENT_UPDATED_AT_STORAGE_KEY },
};

/**
 * Write fields to the browser's copy, stamping each written field. `stamps`
 * overrides the stamp per field (the server's stamp after a successful PUT);
 * a field written without an override is stamped now. A write that cannot
 * persist still applies to this session's DOM via
 * `applyDisplaySettingsToDom`, which the caller owns.
 */
export function writeLocalDisplaySettings(
  partial: Partial<DisplaySettings>,
  stamps: Partial<Record<DisplaySettingsField, string | null>> = {},
): void {
  if (typeof window === 'undefined') return;
  try {
    (Object.keys(partial) as DisplaySettingsField[]).forEach((field) => {
      const keys = FIELD_STORAGE_KEYS[field];
      window.localStorage.setItem(keys.value, String(partial[field]));
      const stamp = field in stamps ? stamps[field] : new Date().toISOString();
      if (stamp != null) window.localStorage.setItem(keys.stamp, stamp);
    });
  } catch {
    /* A preference we cannot persist still applies to this session. */
  }
}

/** Stamp one local field as changed now, without touching its value. Used by
 * writers that own their own key (the keyboard theme toggle) so their change
 * still roams on the next sync. */
export function stampLocalDisplaySettingsField(field: DisplaySettingsField): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      FIELD_STORAGE_KEYS[field].stamp,
      new Date().toISOString(),
    );
  } catch {
    /* ignore */
  }
}

export function resolveDisplayTheme(theme: DisplayTheme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Paint a triple onto `<html>` the same ways the pre-paint bootstrap does:
 * `data-theme`, the `dark` class, `colorScheme`, and `data-density`. The
 * `quant:theme-changed` event is what `AppShell` listens for to re-render
 * its own theme state — without it a synced theme would paint the document
 * but leave the shell's cached theme behind.
 */
export function applyDisplaySettingsToDom(settings: DisplaySettings): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveDisplayTheme(settings.theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.setAttribute('data-density', settings.density);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quant:theme-changed', { detail: { theme: resolved } }));
  }
}

export interface ServerDisplaySettings {
  settings: DisplaySettings;
  stored: Record<DisplaySettingsField, boolean>;
  /** ISO timestamp of the last PUT, or null when nothing is stored yet. */
  updatedAt: string | null;
}

export function normalizeServerDisplaySettings(payload: unknown): ServerDisplaySettings {
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const storedRecord =
    record.stored && typeof record.stored === 'object' && !Array.isArray(record.stored)
      ? (record.stored as Record<string, unknown>)
      : {};
  return {
    settings: {
      theme: normalizeDisplayTheme(record.theme),
      density: normalizeDisplayDensity(record.density),
      aiIntent: normalizeDisplayAIIntent(record.aiIntent),
    },
    stored: {
      theme: storedRecord.theme === true,
      density: storedRecord.density === true,
      aiIntent: storedRecord.aiIntent === true,
    },
    updatedAt: parseStamp(typeof record.updatedAt === 'string' ? record.updatedAt : null),
  };
}

export interface DisplaySettingsSyncDecision {
  /** Fields to overwrite locally from the server (and paint). */
  apply: Partial<DisplaySettings>;
  /** Fields to push to the server from the local copy. */
  push: Partial<DisplaySettings>;
}

// Union-key assignment (`target[field] = value`) collapses the target type
// to the intersection of the property types — `undefined` here — so the
// assignment goes through a record view. The value is always the same
// field's value, so the cast cannot misplace a value across fields.
function setField(
  target: Partial<DisplaySettings>,
  field: DisplaySettingsField,
  value: DisplaySettings[DisplaySettingsField],
): void {
  (target as Record<DisplaySettingsField, DisplaySettings[DisplaySettingsField]>)[field] = value;
}

/**
 * Pure per-field reconciliation (see the header for the rule). The account
 * holding nothing at all is the migration case: every local non-default
 * field pushes up, and nothing is applied back.
 */
export function resolveDisplaySettingsSync(
  server: ServerDisplaySettings,
  local: LocalDisplaySettings,
): DisplaySettingsSyncDecision {
  const apply: Partial<DisplaySettings> = {};
  const push: Partial<DisplaySettings> = {};
  if (server.updatedAt === null) {
    (Object.keys(local.settings) as DisplaySettingsField[]).forEach((field) => {
      if (!server.stored[field] && local.settings[field] !== DISPLAY_SETTINGS_DEFAULTS[field]) {
        setField(push, field, local.settings[field]);
      }
    });
    return { apply, push };
  }
  const serverTime = Date.parse(server.updatedAt);
  (Object.keys(local.settings) as DisplaySettingsField[]).forEach((field) => {
    if (!server.stored[field]) {
      if (local.settings[field] !== DISPLAY_SETTINGS_DEFAULTS[field]) {
        setField(push, field, local.settings[field]);
      }
      return;
    }
    const localStamp = local.updatedAt[field];
    if (localStamp !== null && Date.parse(localStamp) > serverTime) {
      setField(push, field, local.settings[field]);
      return;
    }
    if (server.settings[field] !== local.settings[field]) {
      setField(apply, field, server.settings[field]);
    }
  });
  return { apply, push };
}

export type DisplaySettingsSyncResult =
  | { status: 'unavailable' }
  | { status: 'in-sync' }
  | { status: 'applied-server'; settings: DisplaySettings }
  | { status: 'pushed-local'; settings: DisplaySettings }
  | { status: 'push-failed' };

/**
 * One reconciliation pass against the account. Safe to call on every
 * session start and from the settings page: every branch is idempotent, a
 * failed network round trip leaves the local copy untouched (the next pass
 * retries a push, since the local stamp stays newer), and a 401 — signed
 * out — is silently `unavailable`, never an error surfaced to the user.
 */
export async function syncDisplaySettingsWithAccount(): Promise<DisplaySettingsSyncResult> {
  try {
    const response = await browserApiRequest('/api/settings/display');
    if (!response.ok) return { status: 'unavailable' };
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
    const server = normalizeServerDisplaySettings(payload?.data);
    const local = readLocalDisplaySettings();
    const decision = resolveDisplaySettingsSync(server, local);
    const hasApply = Object.keys(decision.apply).length > 0;
    const hasPush = Object.keys(decision.push).length > 0;
    if (!hasApply && !hasPush) return { status: 'in-sync' };
    const merged = { ...local.settings, ...decision.apply };
    if (hasApply) {
      writeLocalDisplaySettings(decision.apply, stampMap(decision.apply, server.updatedAt));
      applyDisplaySettingsToDom(merged);
    }
    if (!hasPush) {
      return { status: 'applied-server', settings: merged };
    }
    const push = await browserApiRequest('/api/settings/display', {
      method: 'PUT',
      body: JSON.stringify(decision.push),
    });
    if (!push.ok) return { status: 'push-failed' };
    const pushPayload = (await push.json().catch(() => null)) as { data?: unknown } | null;
    const pushed = normalizeServerDisplaySettings(pushPayload?.data);
    // Adopt the server's stamp for the pushed fields so the next pass sees
    // the two sides agree instead of re-pushing the same values forever —
    // but only for fields the user did not touch while the PUT was in
    // flight: re-stamping a field they just changed would overwrite their
    // newer local value with this pass's stale snapshot.
    const fresh = readLocalDisplaySettings();
    const unchangedPush: Partial<DisplaySettings> = {};
    (Object.keys(decision.push) as DisplaySettingsField[]).forEach((field) => {
      if (
        fresh.updatedAt[field] === local.updatedAt[field] &&
        fresh.settings[field] === local.settings[field]
      ) {
        setField(unchangedPush, field, local.settings[field]);
      }
    });
    if (Object.keys(unchangedPush).length > 0) {
      writeLocalDisplaySettings(unchangedPush, stampMap(unchangedPush, pushed.updatedAt));
    }
    if (hasApply) {
      return { status: 'applied-server', settings: merged };
    }
    return { status: 'pushed-local', settings: merged };
  } catch {
    return { status: 'unavailable' };
  }
}

function stampMap(
  fields: Partial<DisplaySettings>,
  stamp: string | null,
): Partial<Record<DisplaySettingsField, string | null>> {
  const map: Partial<Record<DisplaySettingsField, string | null>> = {};
  (Object.keys(fields) as DisplaySettingsField[]).forEach((field) => {
    map[field] = stamp;
  });
  return map;
}

/**
 * Write one change through to the account. Returns ok=false when the server
 * refused: the caller keeps the local change (its stamp stays newer, so the
 * next sync pushes it up) and must say so honestly instead of claiming the
 * account saved it.
 */
export async function saveDisplaySettingToAccount(
  partial: Partial<DisplaySettings>,
): Promise<{ ok: boolean; updatedAt: string | null }> {
  try {
    const response = await browserApiRequest('/api/settings/display', {
      method: 'PUT',
      body: JSON.stringify(partial),
    });
    if (!response.ok) return { ok: false, updatedAt: null };
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
    return { ok: true, updatedAt: normalizeServerDisplaySettings(payload?.data).updatedAt };
  } catch {
    return { ok: false, updatedAt: null };
  }
}
