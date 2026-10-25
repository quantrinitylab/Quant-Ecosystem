// @vitest-environment jsdom
// ============================================================================
// Customisable keyboard shortcuts (fix/qm-keyboard-shortcuts-customize).
//
// The finding: Settings › Keyboard Shortcuts was read-only documentation — a
// user whose OS/browser steals a binding had no way to adapt the app. These
// tests pin the whole chain the fix relies on, and nothing else:
//
//   1. Override values canonicalise and validate (a bare modifier or an
//      empty string is never a binding; `Ctrl+K` becomes `mod+k`).
//   2. Overrides persist in localStorage, malformed stored entries are
//      dropped on load, and clearing restores defaults.
//   3. `resolveShortcutKeys` reports default / custom / disabled.
//   4. Conflict detection only flags SAME-scope collisions — cross-scope
//      `t` (theme globally, today on the calendar) is designed shadowing.
//   5. The registry applies overrides where bindings are made: a remapped
//      command fires on its new key (not the old one) through the REAL
//      engine, a disabled command fires on nothing, clearing restores it.
//   6. The help model carries the engine scope each row lives in, so the
//      settings UI can tell a real conflict from shadowing.
//   7. The settings editor renders its rows and actions from the model.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setApplePlatformOverride } from '../lib/keyboard/chords';
import { keyboardEngine } from '../lib/keyboard/engine';
import {
  getCommand,
  registerCommands,
  type Command,
} from '../lib/keyboard/command-registry';
import { buildHelpGroups } from '../lib/keyboard/help-model';
import {
  SHORTCUT_OVERRIDES_STORAGE_KEY,
  bindingStringFromKeyboardEvent,
  canonicalBindingString,
  clearAllShortcutOverrides,
  clearShortcutOverride,
  findShortcutConflicts,
  getShortcutOverride,
  reloadShortcutOverrides,
  resolveShortcutKeys,
  setShortcutOverride,
  validateBindingStrings,
} from '../lib/keyboard/shortcut-overrides';
import { KeyboardShortcutSettings } from '../app/settings/KeyboardShortcutSettings';

const baseEvent = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

beforeEach(() => {
  // Pin non-Apple labelling: `mod` must mean Ctrl here, deterministically.
  setApplePlatformOverride(false);
  window.localStorage.clear();
  reloadShortcutOverrides();
  clearAllShortcutOverrides();
});

afterEach(() => {
  setApplePlatformOverride(null);
  window.localStorage.clear();
  reloadShortcutOverrides();
});

// ---------------------------------------------------------------------------
// 1. Canonicalisation and validation
// ---------------------------------------------------------------------------

describe('canonicalBindingString / validateBindingStrings', () => {
  it('canonicalises modifier aliases and case', () => {
    // Authored `Ctrl` stays `ctrl`: chords.ts deliberately keeps a genuine
    // `ctrl+…` binding distinct from portable `mod+…` — only a LIVE Ctrl
    // press captures as `mod` on non-Apple platforms (see §4). The capture
    // UI is the only way to set an override, so stored values are always in
    // the engine's own dialect.
    expect(canonicalBindingString('Ctrl+K')).toBe('ctrl+k');
    expect(canonicalBindingString('mod+shift+p')).toBe('mod+shift+p');
    expect(canonicalBindingString('g i')).toBe('g i');
    expect(canonicalBindingString('?')).toBe('?');
  });

  it('rejects empty bindings and bare modifiers', () => {
    expect(canonicalBindingString('')).toBeNull();
    expect(canonicalBindingString('ctrl')).toBeNull();
    expect(canonicalBindingString('shift')).toBeNull();
    expect(canonicalBindingString('mod')).toBeNull();
    expect(validateBindingStrings([])).toBeNull();
    expect(validateBindingStrings(['e', 'ctrl'])).toBeNull();
  });

  it('passes disabled through as null, not as invalid', () => {
    expect(validateBindingStrings(null)).toBeNull();
    expect(validateBindingStrings(undefined)).toBeUndefined();
    expect(validateBindingStrings(['e'])).toEqual(['e']);
  });
});

// ---------------------------------------------------------------------------
// 2. Persistence
// ---------------------------------------------------------------------------

describe('shortcut override persistence', () => {
  it('round-trips through localStorage and drops malformed entries on load', () => {
    window.localStorage.setItem(
      SHORTCUT_OVERRIDES_STORAGE_KEY,
      JSON.stringify({
        'test.persist': ['Mod+K'],
        'test.bad': ['ctrl'],
        'test.empty': [],
        'test.disabled': null,
        'test.wrong-shape': 'e',
      }),
    );
    reloadShortcutOverrides();

    expect(getShortcutOverride('test.persist')).toEqual(['mod+k']);
    expect(getShortcutOverride('test.bad')).toBeUndefined();
    expect(getShortcutOverride('test.empty')).toBeUndefined();
    expect(getShortcutOverride('test.disabled')).toBeNull();
    expect(getShortcutOverride('test.wrong-shape')).toBeUndefined();
  });

  it('set / clear / clearAll write storage and restore defaults', () => {
    setShortcutOverride('test.a', ['shift+x']);
    expect(getShortcutOverride('test.a')).toEqual(['shift+x']);
    expect(JSON.parse(window.localStorage.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY)!)).toEqual({
      'test.a': ['shift+x'],
    });

    setShortcutOverride('test.b', null);
    expect(getShortcutOverride('test.b')).toBeNull();

    clearShortcutOverride('test.a');
    expect(getShortcutOverride('test.a')).toBeUndefined();

    clearAllShortcutOverrides();
    expect(getShortcutOverride('test.b')).toBeUndefined();
    expect(window.localStorage.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY)).toBe('{}');
  });

  it('refuses an invalid override instead of storing it', () => {
    setShortcutOverride('test.a', ['ctrl']);
    expect(getShortcutOverride('test.a')).toBeUndefined();
    expect(window.localStorage.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Resolution
// ---------------------------------------------------------------------------

describe('resolveShortcutKeys', () => {
  it('reports default, custom and disabled states', () => {
    expect(resolveShortcutKeys('test.a', 'e')).toEqual({ keys: ['e'], state: 'default' });
    expect(resolveShortcutKeys('test.a', ['e', 'shift+e'])).toEqual({
      keys: ['e', 'shift+e'],
      state: 'default',
    });
    setShortcutOverride('test.a', ['shift+x']);
    expect(resolveShortcutKeys('test.a', 'e')).toEqual({ keys: ['shift+x'], state: 'custom' });
    setShortcutOverride('test.a', null);
    expect(resolveShortcutKeys('test.a', 'e')).toEqual({ keys: null, state: 'disabled' });
    expect(resolveShortcutKeys('test.keyless', undefined)).toEqual({
      keys: null,
      state: 'default',
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Capture helper
// ---------------------------------------------------------------------------

describe('bindingStringFromKeyboardEvent', () => {
  it('maps live presses to the binding strings the engine matches', () => {
    expect(
      bindingStringFromKeyboardEvent({ ...baseEvent, key: 'k', ctrlKey: true }),
    ).toBe('mod+k');
    expect(
      bindingStringFromKeyboardEvent({ ...baseEvent, key: 'E', shiftKey: true }),
    ).toBe('shift+e');
    // Shift+? is the `?` binding: punctuation folds Shift away, as in chords.ts.
    expect(
      bindingStringFromKeyboardEvent({ ...baseEvent, key: '?', shiftKey: true }),
    ).toBe('?');
  });

  it('rejects lone modifiers and auto-repeat', () => {
    expect(bindingStringFromKeyboardEvent({ ...baseEvent, key: 'Control' })).toBeNull();
    expect(bindingStringFromKeyboardEvent({ ...baseEvent, key: 'Shift' })).toBeNull();
    expect(
      bindingStringFromKeyboardEvent({ ...baseEvent, key: 'e', repeat: true }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Conflict detection
// ---------------------------------------------------------------------------

describe('findShortcutConflicts', () => {
  it('flags same-scope collisions only', () => {
    const conflicts = findShortcutConflicts([
      { id: 'a', scope: 'inbox', keys: ['e'] },
      { id: 'b', scope: 'inbox', keys: ['e'] },
      { id: 'c', scope: 'calendar', keys: ['e'] },
      { id: 'd', scope: 'inbox', keys: null },
      { id: 'e', scope: 'inbox', keys: ['shift+e'] },
    ]);
    expect(conflicts.get('a')).toEqual(['b']);
    expect(conflicts.get('b')).toEqual(['a']);
    // The calendar's `e` is shadowing by scope depth, not a conflict.
    expect(conflicts.get('c')).toBeUndefined();
    expect(conflicts.get('d')).toBeUndefined();
    expect(conflicts.get('e')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Registry + engine: overrides change what actually fires
// ---------------------------------------------------------------------------

describe('registerCommands applies overrides', () => {
  const command = (run: () => void): Command => ({
    id: 'test.custom',
    label: 'Test command',
    group: 'Conversation',
    keys: 'e',
    run,
  });

  const press = (init: KeyboardEventInit) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  };

  let detach: (() => void) | null = null;
  let releases: Array<() => void> = [];

  beforeEach(() => {
    detach = keyboardEngine.attach(document);
  });

  afterEach(() => {
    for (const release of releases) release();
    releases = [];
    detach?.();
    detach = null;
  });

  it('remaps, disables and restores a binding through the real engine', () => {
    const run = vi.fn();
    releases.push(registerCommands([command(run)]));

    press({ key: 'e' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(getCommand('test.custom')?.keys).toBe('e');

    // Remap: the old key goes dead, the new key fires.
    setShortcutOverride('test.custom', ['shift+e']);
    for (const release of releases) release();
    releases = [registerCommands([command(run)])];
    expect(getCommand('test.custom')?.keys).toEqual(['shift+e']);

    press({ key: 'e' });
    expect(run).toHaveBeenCalledTimes(1);
    press({ key: 'E', shiftKey: true });
    expect(run).toHaveBeenCalledTimes(2);

    // Disable: nothing fires.
    setShortcutOverride('test.custom', null);
    for (const release of releases) release();
    releases = [registerCommands([command(run)])];
    expect(getCommand('test.custom')?.keys).toBeUndefined();

    press({ key: 'E', shiftKey: true });
    expect(run).toHaveBeenCalledTimes(2);

    // Clear: the default binding is back.
    clearShortcutOverride('test.custom');
    for (const release of releases) release();
    releases = [registerCommands([command(run)])];
    expect(getCommand('test.custom')?.keys).toBe('e');

    press({ key: 'e' });
    expect(run).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// 7. Help model scopes
// ---------------------------------------------------------------------------

describe('buildHelpGroups carries engine scopes', () => {
  it('marks live commands global by default and references by their surface', () => {
    const live = buildHelpGroups([
      {
        id: 'test.global',
        label: 'Global thing',
        group: 'View',
        keys: 'x',
        run: () => {},
      },
    ]);
    expect(
      live.flatMap((group) => group.items).find((item) => item.id === 'test.global')?.scope,
    ).toBe('global');

    const reference = buildHelpGroups([]);
    const byId = new Map(
      reference.flatMap((group) => group.items).map((item) => [item.id, item]),
    );
    expect(byId.get('inbox.archive')?.scope).toBe('inbox');
    expect(byId.get('calendar.goToday')?.scope).toBe('calendar');
  });
});

// ---------------------------------------------------------------------------
// 8. Settings editor renders
// ---------------------------------------------------------------------------

describe('KeyboardShortcutSettings', () => {
  it('renders rows with Change / Disable actions from the model', () => {
    const markup = renderToStaticMarkup(
      <KeyboardShortcutSettings groups={buildHelpGroups([])} helpNote="" />,
    );
    expect(markup).toContain('Archive conversation');
    expect(markup).toContain('Go to today');
    expect(markup).toContain('Change');
    expect(markup).toContain('Disable');
    // No overrides stored: no reset-all control, no Custom/Disabled pills.
    expect(markup).not.toContain('Reset all shortcuts');
    expect(markup).not.toContain('>Custom<');
  });
});
