/**
 * The shortcuts *reference* model: what the app can be driven by, derived from
 * the registry rather than restated.
 *
 * This lived inside `KeyboardShortcutsHelp.tsx` while it had one consumer. It
 * has two now — the `?` sheet and Settings › Keyboard — and the second one was
 * a hand-written array of sixteen `['E', 'Archive selected email']` pairs that
 * had drifted from the engine on every axis that matters: it documented `Ctrl+S`
 * for "save draft" and `Escape` for "close / deselect", neither of which is
 * bound; it named a `C` compose key the registry spells differently; and it said
 * "selected email" for keys that act on the *focused* row, which is the one
 * misunderstanding that makes someone archive the wrong conversation.
 *
 * So the table is gone and both surfaces read this. A key that appears in a
 * shortcuts list now cannot fail to exist, because the list is generated from
 * the thing that binds it.
 */

import {
  COMMAND_GROUPS,
  INBOX_COMMAND_REFERENCE,
  type Command,
  type CommandGroup,
} from './command-registry';

export interface HelpEntry {
  id: string;
  label: string;
  keys: string | string[];
  /** Bound and pressable right now. */
  available: boolean;
  /** Documented from the reference because its surface is not mounted. */
  elsewhere: boolean;
  destructive: boolean;
  /** One-line explanation, where the registry supplies one. */
  description?: string;
}

export interface HelpGroup {
  group: CommandGroup;
  items: HelpEntry[];
}

/**
 * Live commands first, then the inbox reference for anything the current route
 * has not registered, grouped in `COMMAND_GROUPS` order.
 *
 * Commands whose `enabled()` guard is currently false are kept and marked
 * unavailable rather than dropped. They used to be filtered out, which is why
 * the sheet showed ten navigation keys beside a single compose key: every
 * conversation action (`e`, `s`, `u`, `#`, `r`, `f`, `x`) is gated on a focused
 * row, so opening it from a fresh inbox erased the entire section. A reference
 * should answer "what keys exist here", not "what can I press this millisecond".
 */
export function buildHelpGroups(commands: readonly Command[]): HelpGroup[] {
  const byGroup = new Map<CommandGroup, HelpEntry[]>();
  const add = (group: CommandGroup, entry: HelpEntry) => {
    const existing = byGroup.get(group);
    if (existing) existing.push(entry);
    else byGroup.set(group, [entry]);
  };

  const registered = new Set<string>();
  for (const command of commands) {
    if (!command.keys || command.hiddenInHelp) continue;
    registered.add(command.id);
    add(command.group, {
      id: command.id,
      label: command.label,
      keys: command.keys,
      available: !command.enabled || command.enabled(),
      elsewhere: false,
      destructive: !!command.destructive,
      description: command.description,
    });
  }

  // Only the ids the inbox has not already registered, so the live command —
  // with its live label, `u` reading "Mark as read" on an unread row — always
  // wins over the static one.
  for (const reference of INBOX_COMMAND_REFERENCE) {
    if (registered.has(reference.id)) continue;
    add(reference.group, {
      id: reference.id,
      label: reference.label,
      keys: reference.keys,
      available: false,
      elsewhere: true,
      destructive: !!reference.destructive,
      description: reference.description,
    });
  }

  // Available bindings first within a section, so the dimmed contextual ones
  // collect at the bottom instead of interleaving with what works right now.
  // Destructive last regardless, matching the palette's ordering.
  for (const entries of byGroup.values()) {
    entries.sort(
      (a, b) =>
        Number(b.available) - Number(a.available) || Number(a.destructive) - Number(b.destructive),
    );
  }

  return COMMAND_GROUPS.filter((group) => byGroup.has(group)).map((group) => ({
    group,
    items: byGroup.get(group)!,
  }));
}

/**
 * Why some rows are dim, in the caller's own words.
 *
 * Two different reasons a row is dim, and telling the reader the wrong one is
 * worse than telling them nothing: "pick a conversation" is unactionable advice
 * on the Calendar page, and Settings is never the inbox, so it always reads the
 * first branch.
 */
export function dimNoteFor(
  groups: readonly HelpGroup[],
  labels: { elsewhere: string; contextual: string },
): string {
  const items = groups.flatMap(({ items: groupItems }) => groupItems);
  if (items.some((item) => item.elsewhere)) return labels.elsewhere;
  if (items.some((item) => !item.available && !item.elsewhere)) return labels.contextual;
  return '';
}

/** `Conversation` is the palette's group name; a heading wants the longer one. */
export function helpGroupHeading(group: CommandGroup): string {
  return group === 'Conversation' ? 'Conversation actions' : group;
}
