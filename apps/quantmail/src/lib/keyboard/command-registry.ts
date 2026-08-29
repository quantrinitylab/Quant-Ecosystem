/**
 * The QuantMail command registry.
 *
 * A command is the single unit of "something the user can do": it carries its
 * own label, grouping, optional key binding and the function that performs it.
 * Registering a command wires up all three surfaces at once —
 *
 *   • the keyboard engine binds `keys` → `run`
 *   • the command palette lists it and can invoke it
 *   • the shortcuts sheet documents it
 *
 * so a shortcut can no longer exist without being discoverable, and the palette
 * can no longer drift out of sync with what the keyboard actually does. Before
 * this, the shortcut list, the palette's command array and the live key
 * handlers were three hand-maintained copies of the same information.
 */

import { keyboardEngine, type ShortcutHandler } from './engine';

/**
 * Palette/help sections, in display order. Adding a group here is all that is
 * needed for it to appear — both surfaces iterate this list.
 */
export const COMMAND_GROUPS = [
  'Suggested',
  'Navigation',
  'Conversation',
  'Compose',
  'Selection',
  // The jumps that leave QuantMail — Calendar, Contacts, Drive, CodeHub. They
  // sat in Navigation beside the eight `g …` mailbox jumps, which made it a
  // 13-row section: long enough that the shortcuts sheet could not balance its
  // columns around it, and vague enough that "Go to sent" and "Go to
  // QuantCalendar" read as the same kind of move. Listed late because it is the
  // one section whose destinations are other products.
  'Apps',
  'AI',
  'View',
  'Account',
] as const;

export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export interface Command {
  /** Stable, namespaced identifier, e.g. `mail.archive`. */
  id: string;
  /** Imperative label as it appears in the palette: "Archive conversation". */
  label: string;
  group: CommandGroup;
  /**
   * Binding string(s) in engine syntax: `'e'`, `'mod+k'`, `'g i'`. Omit for
   * palette-only commands.
   */
  keys?: string | string[];
  run: () => void | Promise<void>;
  /** Extra search terms so the palette finds it by synonym. */
  keywords?: string[];
  /** One-line explanation shown under the label in the help sheet. */
  description?: string;
  /** Named engine scope; defaults to `'global'`. */
  scope?: string;
  /** Hide from the palette and skip the key binding while this returns `false`. */
  enabled?: () => boolean;
  /** Keep the binding but omit the command from the palette. */
  hidden?: boolean;
  /** Keep the command in the palette but omit it from the shortcuts sheet. */
  hiddenInHelp?: boolean;
  /** Renders in the destructive accent and sorts last within its group. */
  destructive?: boolean;
  /** Icon name from the shared command icon set. */
  icon?: string;
  priority?: number;
  allowInInput?: boolean;
  allowRepeat?: boolean;
  preventDefault?: boolean;
  /** Keeps the binding alive inside modals. See `BindingOptions.unmaskable`. */
  unmaskable?: boolean;
}

/**
 * The documentable half of a command: what it is called and what it is bound to,
 * without the closure that performs it.
 *
 * A command only exists while the surface that owns it is mounted, which is
 * correct for the *binding* and wrong for the *reference*. `e` archives a
 * conversation whether or not the reader is currently looking at the inbox, so
 * the shortcuts sheet needs to be able to say so from the Calendar page.
 */
export interface CommandReference {
  id: string;
  label: string;
  group: CommandGroup;
  keys: string | string[];
  description?: string;
  destructive?: boolean;
}

export type InboxCommandId =
  | 'inbox.next'
  | 'inbox.previous'
  | 'inbox.open'
  | 'inbox.close'
  | 'inbox.archive'
  | 'inbox.trash'
  | 'inbox.star'
  | 'inbox.toggleRead'
  | 'inbox.reply'
  | 'inbox.forward'
  | 'inbox.toggleSelect';

/**
 * Every binding the thread list owns, in the order the sheet should read them.
 *
 * This is the single declaration of their ids, labels, groups and keys:
 * `useInboxKeyboard` spreads these entries onto its live commands rather than
 * restating them, so the sheet cannot document a key the inbox does not bind or
 * label it differently. It is also what the sheet falls back to when the inbox
 * is not mounted — which is why the panel used to open on Calendar or Drive
 * showing one Compose line beside one Navigation column and a column of nothing.
 */
export const INBOX_COMMAND_REFERENCE: Array<CommandReference & { id: InboxCommandId }> = [
  { id: 'inbox.next', label: 'Next conversation', group: 'Conversation', keys: ['j', 'arrowdown'] },
  {
    id: 'inbox.previous',
    label: 'Previous conversation',
    group: 'Conversation',
    keys: ['k', 'arrowup'],
  },
  {
    id: 'inbox.archive',
    label: 'Archive conversation',
    group: 'Conversation',
    keys: 'e',
    description: 'Move out of the inbox — the cursor stays on the next thread',
  },
  { id: 'inbox.star', label: 'Star conversation', group: 'Conversation', keys: 's' },
  { id: 'inbox.toggleRead', label: 'Mark as unread', group: 'Conversation', keys: 'u' },
  {
    id: 'inbox.trash',
    label: 'Move conversation to trash',
    group: 'Conversation',
    keys: '#',
    destructive: true,
  },
  { id: 'inbox.open', label: 'Open conversation', group: 'Navigation', keys: ['enter', 'o'] },
  { id: 'inbox.close', label: 'Close conversation', group: 'Navigation', keys: 'escape' },
  { id: 'inbox.reply', label: 'Reply to conversation', group: 'Compose', keys: 'r' },
  { id: 'inbox.forward', label: 'Forward conversation', group: 'Compose', keys: 'f' },
  { id: 'inbox.toggleSelect', label: 'Select conversation', group: 'Selection', keys: 'x' },
];

const inboxReferenceById = new Map(INBOX_COMMAND_REFERENCE.map((entry) => [entry.id, entry]));

/**
 * The reference entry for an inbox binding. The id is a union rather than a
 * `string`, so a typo is a type error and not a command that silently loses its
 * label and key at runtime.
 */
export function inboxCommand(id: InboxCommandId): CommandReference & { id: InboxCommandId } {
  return inboxReferenceById.get(id)!;
}

interface Registration {
  commands: Command[];
  releaseKeys: Array<() => void>;
}

const registrations = new Map<symbol, Registration>();
const listeners = new Set<() => void>();

/** Cached flattened view; invalidated whenever a registration changes. */
let snapshot: Command[] | null = null;

function invalidate(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}

/**
 * Register a batch of commands. Returns a release function that unbinds their
 * keys and removes them from the palette.
 *
 * Commands are keyed by `id`; a later registration of the same id shadows the
 * earlier one, which lets a page override a global default (for example, the
 * inbox's `e` archiving the focused row rather than doing nothing).
 */
export function registerCommands(commands: Command[]): () => void {
  const token = Symbol('commands');
  const releaseKeys: Array<() => void> = [];

  for (const command of commands) {
    if (!command.keys) continue;
    releaseKeys.push(
      keyboardEngine.bind(command.id, command.keys, command.run as ShortcutHandler, {
        scope: command.scope,
        priority: command.priority,
        enabled: command.enabled,
        allowInInput: command.allowInInput,
        allowRepeat: command.allowRepeat,
        preventDefault: command.preventDefault,
        unmaskable: command.unmaskable,
        label: command.label,
      }),
    );
  }

  registrations.set(token, { commands, releaseKeys });
  invalidate();

  return () => {
    const entry = registrations.get(token);
    if (!entry) return;
    registrations.delete(token);
    for (const release of entry.releaseKeys) release();
    invalidate();
  };
}

/**
 * Every registered command, deduplicated by id with the most recent
 * registration winning, ordered by group then by declaration.
 */
export function getCommands(): Command[] {
  if (snapshot) return snapshot;

  const byId = new Map<string, Command>();
  for (const { commands } of registrations.values()) {
    for (const command of commands) byId.set(command.id, command);
  }

  const groupRank = new Map(COMMAND_GROUPS.map((group, index) => [group, index]));
  snapshot = [...byId.values()].sort((a, b) => {
    const groupDelta = (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99);
    if (groupDelta !== 0) return groupDelta;
    if (!!a.destructive !== !!b.destructive) return a.destructive ? 1 : -1;
    return 0;
  });
  return snapshot;
}

export function subscribeToCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Look up a command by id. */
export function getCommand(id: string): Command | undefined {
  return getCommands().find((command) => command.id === id);
}

/**
 * Invoke a command by id, honouring its `enabled` guard.
 * Returns `false` when the command is missing or disabled.
 */
export function runCommand(id: string): boolean {
  const command = getCommand(id);
  if (!command) return false;
  if (command.enabled && !command.enabled()) return false;
  void command.run();
  return true;
}

/** Commands eligible to appear in the palette right now. */
export function getVisibleCommands(): Command[] {
  return getCommands().filter(
    (command) => !command.hidden && (!command.enabled || command.enabled()),
  );
}
