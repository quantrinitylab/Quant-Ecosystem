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
  // The calendar surface owns a full Google-class shortcut set (t/j/k/c/…);
  // they read as one section in the `?` sheet rather than scattered across
  // Navigation/View/Compose, where they would collide visually with the
  // mail-scoped rows they shadow by scope depth.
  'Calendar',
  // The drive surface owns its own Google-Drive-class triage set (j/k/x/…).
  // Same reason as Calendar: one section in the `?` sheet, readable on its
  // own instead of scattered across Selection and View.
  'Drive',
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
  /** Also call `stopPropagation()` when the binding fires. Defaults to `false`. */
  stopPropagation?: boolean;
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
  | 'inbox.pin'
  | 'inbox.toggleRead'
  | 'inbox.reply'
  | 'inbox.forward'
  | 'inbox.toggleSelect'
  | 'inbox.undo'
  | 'inbox.compose';

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
  { id: 'inbox.pin', label: 'Pin conversation', group: 'Conversation', keys: 's' },
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
  {
    id: 'inbox.undo',
    label: 'Undo archive',
    group: 'Conversation',
    keys: 'z',
    description: 'Undo the last conversation archive or done action',
  },
  {
    id: 'inbox.compose',
    label: 'Compose email',
    group: 'Compose',
    keys: 'c',
    description: 'Open composer for new message',
  },
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

export type CalendarCommandId =
  | 'calendar.goToday'
  | 'calendar.nextDay'
  | 'calendar.previousDay'
  | 'calendar.goToDate'
  | 'calendar.searchEvents'
  | 'calendar.viewDay'
  | 'calendar.viewWeek'
  | 'calendar.viewMonth'
  | 'calendar.viewAgenda'
  | 'calendar.toggleMonthGrid'
  | 'calendar.createEvent'
  | 'calendar.quickAddEvent'
  | 'calendar.saveEvent'
  | 'calendar.openEventDetails'
  | 'calendar.deleteEvent'
  | 'calendar.undoDelete';

/**
 * Every binding the calendar page owns, in the order the sheet should read them.
 *
 * The same single-declaration contract as `INBOX_COMMAND_REFERENCE`:
 * `useCalendarKeyboard` spreads these entries onto its live commands rather
 * than restating id/label/group/keys, so the `?` sheet cannot document a key
 * the calendar does not bind. `help-model.ts` falls back to this list when the
 * calendar is not mounted, the way it does for the inbox.
 *
 * Two deliberate deviations from Google Calendar's documented set, both forced
 * by the engine's sequence rules:
 *
 * - Google's bare `g` (go to date) is not bound: the app owns fifteen global
 *   `g …` navigation chords, and a bare `g` in the deeper calendar scope would
 *   consume the press before any of them could complete (the engine only holds
 *   a chord for a longer sequence when nothing matched). `shift+g` focuses the
 *   header date picker instead.
 * - `t` (today) and `c` (new event) shadow the global theme-toggle and
 *   compose bindings while the calendar scope is active — the same shadowing
 *   the inbox already does for `c`. Scope depth resolves it deterministically.
 */
export const CALENDAR_COMMAND_REFERENCE: Array<CommandReference & { id: CalendarCommandId }> = [
  { id: 'calendar.goToday', label: 'Go to today', group: 'Calendar', keys: 't', description: 'Jump back to the current date' },
  { id: 'calendar.nextDay', label: 'Next day', group: 'Calendar', keys: ['j', 'n'], description: 'Move the selected date forward one day' },
  { id: 'calendar.previousDay', label: 'Previous day', group: 'Calendar', keys: ['k', 'p'], description: 'Move the selected date back one day' },
  {
    id: 'calendar.goToDate',
    label: 'Go to a date…',
    group: 'Calendar',
    keys: 'shift+g',
    description: 'Focus the header date picker — plain G stays the app-wide navigation prefix',
  },
  { id: 'calendar.searchEvents', label: 'Search events', group: 'Calendar', keys: '/', description: 'Focus the calendar search field' },
  { id: 'calendar.viewDay', label: 'Day view', group: 'Calendar', keys: ['d', '1'] },
  { id: 'calendar.viewWeek', label: 'Week view', group: 'Calendar', keys: ['w', '2'] },
  { id: 'calendar.viewMonth', label: 'Month view', group: 'Calendar', keys: ['m', '3'] },
  { id: 'calendar.viewAgenda', label: 'Agenda view', group: 'Calendar', keys: ['a', '4'] },
  {
    id: 'calendar.toggleMonthGrid',
    label: 'Expand/collapse month grid',
    group: 'Calendar',
    keys: 'shift+m',
    description: 'Toggle the collapsible month strip under the header',
  },
  {
    id: 'calendar.createEvent',
    label: 'New event',
    group: 'Calendar',
    keys: 'c',
    description: 'Open the full event editor',
  },
  {
    id: 'calendar.quickAddEvent',
    label: 'Quick-add event',
    group: 'Calendar',
    keys: 'q',
    description: 'Type "Lunch with Sam 1pm" — the date is parsed and the event is created',
  },
  {
    id: 'calendar.saveEvent',
    label: 'Save event',
    group: 'Calendar',
    keys: 's',
    description: 'Save the open editor; never fires while typing in a text field',
  },
  {
    id: 'calendar.openEventDetails',
    label: 'Open event details',
    group: 'Calendar',
    keys: 'e',
    description: 'Reopen the details of the last selected event',
  },
  {
    id: 'calendar.deleteEvent',
    label: 'Delete selected event',
    group: 'Calendar',
    keys: ['delete', 'backspace'],
    destructive: true,
    description: 'Delete the selected event — always asks first',
  },
  {
    id: 'calendar.undoDelete',
    label: 'Undo delete',
    group: 'Calendar',
    keys: 'z',
    description: 'Restore the entry deleted most recently in this session',
  },
];

const calendarReferenceById = new Map(CALENDAR_COMMAND_REFERENCE.map((entry) => [entry.id, entry]));

/**
 * The reference entry for a calendar binding. The id is a union rather than a
 * `string`, so a typo is a type error and not a command that silently loses its
 * label and key at runtime.
 */
export function calendarCommand(id: CalendarCommandId): CommandReference & { id: CalendarCommandId } {
  return calendarReferenceById.get(id)!;
}

/**
 * The `drive.*` command ids. A union rather than a `string`, so a typo is a
 * type error and not a command that silently loses its label and key at
 * runtime (the same contract the inbox and calendar references keep).
 */
export type DriveCommandId =
  | 'drive.nextItem'
  | 'drive.previousItem'
  | 'drive.toggleSelect'
  | 'drive.openItem'
  | 'drive.clearFocus'
  | 'drive.newFolder'
  | 'drive.newDocument';

/**
 * Every binding the drive surface owns, in the order the sheet should read
 * them. Google-Drive-class triage for the Files/Home file list, implemented
 * as a W3C APG listbox with roving tabindex (see DriveHomeSubView): j/k move
 * real DOM focus across the options, aria-selected tracks only the
 * x-selection set, and Escape drops the highlight and returns focus:
 *
 *   j/k          move focus across folders and files
 *   x            toggle selection of the focused item (batch actions)
 *   Enter        enter the focused folder / preview the focused file
 *   Escape       drop the highlight and return focus (pre-navigation
 *                element, else the Files panel)
 *   shift+f      new folder dialog (Google Drive's own chord)
 *   shift+t      new document dialog (Google Drive's Shift+T new doc)
 *
 * Shift+F/T dialog focus in/out is the shared-ui Modal's contract (trap +
 * data-autofocus input + restore to the opener); the drive hook only fires
 * the open callbacks, and the opener is the focused option card.
 *
 * Single-declaration contract (as with the inbox/calendar lists):
 * `useDriveKeyboard` and the drive list component spread these entries onto
 * their live commands rather than restating id/label/group/keys, so the `?`
 * sheet cannot document a key the drive surface does not bind. `help-model.ts`
 * falls back to this list when the drive page is not mounted.
 *
 * Deliberate deviations from Google Drive's documented set, forced by existing
 * bindings:
 *
 * - `/` is NOT re-bound here: AppShell already binds `/` (higher priority)
 *   to focus the drive search field in place, and the global command registry
 *   documents it as "Search this view". Re-declaring it in the drive scope
 *   would double-bind the same chord.
 * - `?` (shortcuts sheet) and `mod+k` (command palette) stay global and
 *   unmaskable; the toolbar also carries a visible keyboard-shortcuts button
 *   so the sheet is discoverable without the key.
 * - Trash items are excluded from j/k navigation: the trash list is a
 *   restore/purge zone with its own row actions, not a selection surface.
 */
export const DRIVE_COMMAND_REFERENCE: Array<CommandReference & { id: DriveCommandId }> = [
  {
    id: 'drive.nextItem',
    label: 'Next item',
    group: 'Drive',
    keys: 'j',
    description: 'Move focus to the next folder or file on the Files view',
  },
  {
    id: 'drive.previousItem',
    label: 'Previous item',
    group: 'Drive',
    keys: 'k',
    description: 'Move focus to the previous folder or file',
  },
  {
    id: 'drive.toggleSelect',
    label: 'Select focused item',
    group: 'Drive',
    keys: 'x',
    description: 'Toggle selection of the focused item, for batch actions',
  },
  {
    id: 'drive.openItem',
    label: 'Open focused item',
    group: 'Drive',
    keys: 'enter',
    description: 'Enter the focused folder, or preview the focused file',
  },
  {
    id: 'drive.clearFocus',
    label: 'Clear highlight and return focus',
    group: 'Drive',
    keys: 'escape',
    description: 'Drop the highlight and return focus to where keyboard navigation began, or to the Files panel',
  },
  {
    id: 'drive.newFolder',
    label: 'New folder',
    group: 'Drive',
    keys: 'shift+f',
    description: 'Open the new-folder dialog',
  },
  {
    id: 'drive.newDocument',
    label: 'New document',
    group: 'Drive',
    keys: 'shift+t',
    description: 'Open the new-document dialog',
  },
];

const driveReferenceById = new Map(DRIVE_COMMAND_REFERENCE.map((entry) => [entry.id, entry]));

/**
 * The reference entry for a drive binding. The id is a union rather than a
 * `string`, so a typo is a type error and not a command that silently loses
 * its label and key at runtime.
 */
export function driveCommand(id: DriveCommandId): CommandReference & { id: DriveCommandId } {
  return driveReferenceById.get(id)!;
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
        stopPropagation: command.stopPropagation,
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
