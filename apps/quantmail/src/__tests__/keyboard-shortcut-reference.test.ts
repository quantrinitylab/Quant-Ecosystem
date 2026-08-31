// ============================================================================
// INBOX_COMMAND_REFERENCE — what the shortcuts sheet promises about the inbox.
// ============================================================================
//
// The sheet is mounted in the root layout; the bindings it documents are
// registered by `useInboxKeyboard`, which only the inbox mounts. So the sheet
// reads this list to describe `e`/`s`/`u`/`#`/`j`/`k` from Calendar, Drive or
// Contacts, where no inbox command exists to read.
//
// That makes the list a promise about keys the reader cannot press to check, and
// the failure mode is silent: rename a label or rebind a key in the hook and the
// sheet keeps confidently documenting the old one. Two guards below —
//
//   • the hook must SPREAD these entries, never restate `id`/`group`/`keys`
//     (asserted against the hook's own source, because a second copy compiles
//     perfectly well and is exactly the bug);
//   • the six bindings the sheet's Conversation actions column is specified to
//     show are pinned to their keys and their group.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COMMAND_GROUPS,
  INBOX_COMMAND_REFERENCE,
  inboxCommand,
  type InboxCommandId,
} from '../lib/keyboard/command-registry';

const primary = (id: InboxCommandId): string => {
  const { keys } = inboxCommand(id);
  return Array.isArray(keys) ? keys[0] : keys;
};

describe('INBOX_COMMAND_REFERENCE', () => {
  it('declares each id exactly once, in a real group, with a binding', () => {
    const ids = INBOX_COMMAND_REFERENCE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of INBOX_COMMAND_REFERENCE) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(COMMAND_GROUPS).toContain(entry.group);
      // `keys` is what the sheet renders as `kbd` pills; an empty binding would
      // render an empty row rather than fail.
      expect(Array.isArray(entry.keys) ? entry.keys.join('') : entry.keys).not.toBe('');
      expect(inboxCommand(entry.id)).toBe(entry);
    }
  });

  it('documents the conversation actions the sheet is specified to show', () => {
    expect(primary('inbox.archive')).toBe('e');
    expect(primary('inbox.star')).toBe('s');
    expect(primary('inbox.toggleRead')).toBe('u');
    expect(primary('inbox.trash')).toBe('#');
    expect(primary('inbox.next')).toBe('j');
    expect(primary('inbox.previous')).toBe('k');

    // Cursor movement between conversations belongs beside archive and star, not
    // with the `g i` / `g s` mailbox jumps — thirteen global bindings already sit
    // in Navigation and pushed the sheet into one tall column.
    for (const id of [
      'inbox.archive',
      'inbox.star',
      'inbox.toggleRead',
      'inbox.trash',
      'inbox.next',
      'inbox.previous',
    ] as const) {
      expect(inboxCommand(id).group).toBe('Conversation');
    }

    // Destructive sorts last within its section in both the palette and the
    // sheet; `#` is the only inbox binding that should claim it.
    const destructive = INBOX_COMMAND_REFERENCE.filter((entry) => entry.destructive);
    expect(destructive.map((entry) => entry.id)).toEqual(['inbox.trash']);
  });

  it('is the only place useInboxKeyboard states those ids, groups and keys', () => {
    const source = readFileSync(new URL('../hooks/useInboxKeyboard.ts', import.meta.url), 'utf8');

    for (const entry of INBOX_COMMAND_REFERENCE) {
      expect(source).toContain(`inboxCommand('${entry.id}')`);
    }
    // A restated field is a second copy of the reference that the sheet cannot
    // see. `label:` is exempt: `inbox.toggleRead` overrides it deliberately,
    // because "Mark as read" depends on the focused row.
    expect(source).not.toMatch(/\bid: 'inbox\./);
    expect(source).not.toMatch(/\bgroup: '/);
    expect(source).not.toMatch(/\bkeys: /);
  });
});
