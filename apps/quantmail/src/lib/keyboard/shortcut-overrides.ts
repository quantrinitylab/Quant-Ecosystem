/**
 * User-customisable keyboard shortcuts: the override layer behind
 * Settings › Keyboard Shortcuts.
 *
 * The finding was that the shortcuts tab was read-only documentation: a user
 * whose OS or browser steals a binding (Ctrl+K, Cmd+/) had no way to adapt
 * the app. The registry (`command-registry.ts`) is the single place bindings
 * are made, so overrides live here and are applied there — a stored override
 * changes what the engine actually binds, what the palette shows and what the
 * `?` sheet documents, all from one record. Nothing here invents a binding:
 * an override only ever replaces the keys of a command that already exists.
 *
 * Storage is deliberately per-browser `localStorage`, not a server setting:
 * there is no settings endpoint for shortcuts, and a shortcut is a property
 * of the keyboard in front of the user, not of the account. The section copy
 * in Settings says so, so a user on a second machine is not surprised when
 * their remap does not follow them. A write that fails (private browsing)
 * still applies in memory for the session; the value is re-read from storage
 * on the next load, so a failed write degrades to "this browser only, this
 * session only" rather than to a toast claiming it saved.
 *
 * Shape: `{ [commandId]: string[] | null }` — an array replaces the
 * command's bindings, `null` disables it entirely. Commands are keyed by id
 * (not by key), so one override follows the command across every scope that
 * registers it, and disabling a command frees its keys rather than leaving a
 * dead row in the sheet.
 *
 * This module touches no browser API at import time and guards every storage
 * access, so it stays import-safe during SSR and under vitest's node
 * environment (where `localStorage` does not exist and overrides are simply
 * in-memory). Tests inject a fake `localStorage` on `globalThis` before
 * their first call; the cache is loaded lazily, never at import.
 */

import { chordFromEvent, parseSequence, sequenceToString } from './chords';

/** Versioned so a future shape change can migrate rather than strand users. */
export const SHORTCUT_OVERRIDES_STORAGE_KEY = 'quant-shortcut-overrides-v1';

/**
 * One stored override: replacement bindings, or `null` for "disabled".
 * `undefined` (absent key) always means "no override — use the default".
 */
export type ShortcutOverride = string[] | null;

export type ShortcutOverrides = Record<string, ShortcutOverride>;

/** A chord that is only a modifier can never be pressed as a binding. */
const BARE_MODIFIERS = new Set(['mod', 'ctrl', 'meta', 'alt', 'shift']);

/**
 * Canonicalise one binding string (`'Ctrl+K'` → `'mod+k'`, `'g i'` stays
 * `'g i'`). Returns `null` when the string cannot be a binding: empty, a
 * bare modifier, or a chord with no key at all.
 */
export function canonicalBindingString(input: string): string | null {
  const sequence = parseSequence(input);
  if (sequence.length === 0) return null;
  for (const chord of sequence) {
    const parts = chord.split('+');
    const key = parts[parts.length - 1];
    if (!key || BARE_MODIFIERS.has(key)) return null;
  }
  return sequenceToString(sequence);
}

/**
 * Validate a whole override value. Returns the canonicalised bindings, or
 * `null` when any entry is unusable. `null` (disabled) passes through as
 * `null` — it is a valid override, not a missing one.
 */
export function validateBindingStrings(
  bindings: readonly string[] | null | undefined,
): string[] | null | undefined {
  if (bindings === undefined) return undefined;
  if (bindings === null) return null;
  if (bindings.length === 0) return null;
  const canonical: string[] = [];
  for (const binding of bindings) {
    if (typeof binding !== 'string') return null;
    const next = canonicalBindingString(binding);
    if (next === null) return null;
    canonical.push(next);
  }
  return canonical;
}

// ─────────────────────────────── storage ───────────────────────────────────

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function getStorage(): StorageLike | null {
  try {
    const candidate = (globalThis as { localStorage?: unknown }).localStorage;
    if (
      candidate &&
      typeof (candidate as StorageLike).getItem === 'function' &&
      typeof (candidate as StorageLike).setItem === 'function'
    ) {
      return candidate as StorageLike;
    }
  } catch {
    // Storage access itself can throw (blocked cookies); in-memory only then.
  }
  return null;
}

let cached: ShortcutOverrides | null = null;
let version = 0;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Parse stored JSON into overrides, dropping every malformed entry. */
function parseStored(raw: string | null): ShortcutOverrides {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: ShortcutOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null) {
        result[id] = null;
        continue;
      }
      if (!Array.isArray(value)) continue;
      // Guard the element types before treating the stored array as bindings;
      // the cast below is safe only because this check just proved it.
      if (!value.every((entry) => typeof entry === 'string')) continue;
      const valid = validateBindingStrings(value as string[]);
      if (valid === null || valid === undefined) continue;
      result[id] = valid;
    }
    return result;
  } catch {
    return {};
  }
}

function readFromStorage(): ShortcutOverrides {
  return parseStored(getStorage()?.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY) ?? null);
}

function writeToStorage(overrides: ShortcutOverrides): void {
  try {
    getStorage()?.setItem(SHORTCUT_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Private browsing: the in-memory value still applies this session.
  }
}

/**
 * Re-read overrides from storage, discarding the cache. Used by the
 * cross-tab `storage` listener and by tests that swap the storage backend.
 */
export function reloadShortcutOverrides(): void {
  cached = readFromStorage();
  notify();
}

function ensureLoaded(): ShortcutOverrides {
  if (cached === null) cached = readFromStorage();
  return cached;
}

function attachStorageListener(): void {
  if (storageListenerAttached) return;
  storageListenerAttached = true;
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key !== SHORTCUT_OVERRIDES_STORAGE_KEY) return;
        const next = parseStored(event.newValue);
        const current = ensureLoaded();
        if (JSON.stringify(next) !== JSON.stringify(current)) {
          cached = next;
          notify();
        }
      });
    }
  } catch {
    // Non-DOM environment: cross-tab sync simply does not exist there.
  }
}

export function subscribeToShortcutOverrides(listener: () => void): () => void {
  attachStorageListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Monotonic counter; `useSyncExternalStore` snapshots on it. */
export function getShortcutOverridesVersion(): number {
  ensureLoaded();
  return version;
}

let snapshotCache: ShortcutOverrides | null = null;
let snapshotVersion = -1;

/**
 * A defensive copy — callers must never mutate the cache through this.
 * The copy is cached per version, because `useSyncExternalStore` requires
 * the snapshot to be referentially stable while the store is unchanged; a
 * fresh object on every call would re-render in a loop.
 */
export function getShortcutOverrides(): ShortcutOverrides {
  ensureLoaded();
  if (snapshotCache !== null && snapshotVersion === version) return snapshotCache;
  const copy: ShortcutOverrides = {};
  for (const [id, value] of Object.entries(ensureLoaded())) {
    copy[id] = value === null ? null : [...value];
  }
  snapshotCache = copy;
  snapshotVersion = version;
  return copy;
}

/** `undefined` when the command has no override. */
export function getShortcutOverride(id: string): ShortcutOverride | undefined {
  const value = ensureLoaded()[id];
  return value === undefined ? undefined : value === null ? null : [...value];
}

function persistAndNotify(next: ShortcutOverrides): void {
  cached = next;
  writeToStorage(next);
  notify();
}

/** Replace a command's bindings, or pass `null` to disable it. */
export function setShortcutOverride(id: string, value: ShortcutOverride): void {
  // `null` is a valid override (disabled), not an invalid value — it must be
  // handled before validation, whose own `null` means "unusable bindings".
  if (value === null) {
    persistAndNotify({ ...ensureLoaded(), [id]: null });
    return;
  }
  const valid = validateBindingStrings(value);
  if (!valid) return;
  persistAndNotify({ ...ensureLoaded(), [id]: valid });
}

/** Drop one command's override, restoring its default bindings. */
export function clearShortcutOverride(id: string): void {
  const current = ensureLoaded();
  if (!(id in current)) return;
  const next = { ...current };
  delete next[id];
  persistAndNotify(next);
}

/** Drop every override, restoring every default binding. */
export function clearAllShortcutOverrides(): void {
  if (Object.keys(ensureLoaded()).length === 0) return;
  persistAndNotify({});
}

// ────────────────────────────── resolution ─────────────────────────────────

export type ShortcutKeyState = 'default' | 'custom' | 'disabled';

export interface ResolvedShortcutKeys {
  /** Effective bindings, or `null` when the command is disabled. */
  keys: string[] | null;
  state: ShortcutKeyState;
}

/**
 * The bindings a command should actually be registered with: its override
 * when one exists, its defaults otherwise. A disabled command resolves to
 * `keys: null` — the registry binds nothing but still lists the command, so
 * Settings can offer it back instead of it vanishing.
 */
export function resolveShortcutKeys(
  id: string,
  defaultKeys: string | string[] | undefined,
): ResolvedShortcutKeys {
  const override = getShortcutOverride(id);
  if (override === null) return { keys: null, state: 'disabled' };
  if (override !== undefined) return { keys: override, state: 'custom' };
  if (defaultKeys === undefined) return { keys: null, state: 'default' };
  return { keys: Array.isArray(defaultKeys) ? [...defaultKeys] : [defaultKeys], state: 'default' };
}

// ─────────────────────────────── capture ───────────────────────────────────

export interface CapturableKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

/**
 * The binding string for a live key press, or `null` when the press is not a
 * bindable chord: a lone modifier, an auto-repeat, or a dead/IME key. The
 * settings capture UI feeds key presses through this, so what the user
 * pressed is exactly what gets stored — no second parsing dialect.
 */
export function bindingStringFromKeyboardEvent(event: CapturableKeyEvent): string | null {
  if (event.repeat) return null;
  const key = event.key;
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta' || key === 'Dead') {
    return null;
  }
  const chord = chordFromEvent(event as unknown as KeyboardEvent);
  if (!chord) return null;
  return canonicalBindingString(chord);
}

// ────────────────────────────── conflicts ──────────────────────────────────

export interface ConflictRow {
  id: string;
  /** Engine scope; collisions only matter inside one scope (see below). */
  scope: string;
  /** Effective bindings, or `null` for a disabled command. */
  keys: string[] | null;
}

/**
 * Same-scope collisions between effective bindings, as `id → conflicting ids`.
 *
 * Cross-scope collisions are NOT reported: they are the engine's designed
 * shadowing (`t` toggles the theme globally and goes to today on the
 * calendar; scope depth resolves them deterministically), and warning about
 * every one would drown the one case the user just created — two commands in
 * the same scope fighting over the key they just pressed. A disabled command
 * contributes no bindings, so disabling a key genuinely frees it.
 */
export function findShortcutConflicts(rows: readonly ConflictRow[]): Map<string, string[]> {
  const bySequence = new Map<string, ConflictRow[]>();
  for (const row of rows) {
    if (!row.keys) continue;
    for (const binding of row.keys) {
      const canonical = canonicalBindingString(binding);
      if (canonical === null) continue;
      const key = `${row.scope}\n${canonical}`;
      const list = bySequence.get(key);
      if (list) list.push(row);
      else bySequence.set(key, [row]);
    }
  }

  const conflicts = new Map<string, string[]>();
  for (const list of bySequence.values()) {
    const ids = [...new Set(list.map((row) => row.id))];
    if (ids.length < 2) continue;
    for (const id of ids) {
      const others = ids.filter((other) => other !== id);
      const existing = conflicts.get(id);
      conflicts.set(id, existing ? [...new Set([...existing, ...others])] : others);
    }
  }
  return conflicts;
}
