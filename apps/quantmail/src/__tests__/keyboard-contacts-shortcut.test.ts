// ============================================================================
// `g c` goes to Contacts (Gmail parity), not Calendar.
// ============================================================================
//
// The finding: Gmail's `g c` opens Contacts, but QuantMail bound `g c` to
// QuantCalendar and Contacts only to `g a`, so a Gmail-trained power user
// pressing `g c` landed on the calendar. The fix reassigns `g c` to
// nav.contacts (keeping `g a` as a legacy alias) and leaves nav.calendar on
// its `g l` alias alone.
//
// Why a source assertion, in the style of keyboard-shortcut-reference.test.ts:
// KeyboardProvider builds its command list inline and registers it through a
// React hook, so no importable registry lists these bindings — the source is
// the declaration. And the collision guard matters more than the single key:
// the engine keys bindings by command id, not by chord, so a chord claimed by
// two commands silently resolves to whichever bound last. The guard below
// fails the build the moment any chord is claimed twice in this file, so a
// future "just add an alias" edit cannot reintroduce a shadowed jump.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function providerCommands(): Map<string, { keys: string[]; target: string | null }> {
  const source = readFileSync(
    new URL('../components/KeyboardProvider.tsx', import.meta.url),
    'utf8',
  );
  const commands = new Map<string, { keys: string[]; target: string | null }>();
  // Entries declare id, then label/group, then keys, then run — in that
  // order, so one non-greedy match per command is enough. The target is
  // captured only for `go('…')` runs; other runs (palette, theme, focus)
  // legitimately have none, and still count for the collision guard.
  const pattern =
    /id: '([a-z0-9.]+)'[\s\S]*?keys: (\[[^\]]*\]|'[^']*')[\s\S]*?run: (?:go\('([^']+)'\)|[^\n]*)/g;
  for (const match of source.matchAll(pattern)) {
    const [, id, keysRaw, target] = match;
    const keys = [...keysRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    commands.set(id, { keys, target: target ?? null });
  }
  return commands;
}

describe('contacts keyboard shortcut (Gmail parity)', () => {
  it('binds `g c` to Contacts, keeping `g a` as a legacy alias', () => {
    const commands = providerCommands();
    const contacts = commands.get('nav.contacts');
    expect(contacts).toBeDefined();
    expect(contacts!.keys).toContain('g c');
    expect(contacts!.keys).toContain('g a');
    expect(contacts!.target).toBe('/contacts');
  });

  it('no longer binds `g c` to Calendar — Calendar keeps only `g l`', () => {
    const commands = providerCommands();
    const calendar = commands.get('nav.calendar');
    expect(calendar).toBeDefined();
    expect(calendar!.keys).not.toContain('g c');
    expect(calendar!.keys).toContain('g l');
    expect(calendar!.target).toBe('/calendar');
  });

  it('claims every chord in KeyboardProvider exactly once, so no jump is shadowed', () => {
    const commands = providerCommands();
    expect(commands.size).toBeGreaterThan(0);
    const owners = new Map<string, string>();
    for (const [id, { keys }] of commands) {
      for (const chord of keys) {
        expect(owners.get(chord)).toBeUndefined();
        owners.set(chord, id);
      }
    }
    expect(owners.get('g c')).toBe('nav.contacts');
    expect(owners.get('g i')).toBe('nav.inbox');
  });
});
