'use client';

/**
 * Google-class keyboard shortcuts for the calendar surface.
 *
 * The calendar page previously bound a single `document` keydown listener
 * that only answered `Escape`. Every binding here is registered as a command
 * in the `calendar` engine scope, so the keys appear in the command palette
 * and the `?` shortcuts sheet automatically, and scope depth resolves the
 * deliberate shadowings: the calendar's `t` (today) outranks the global
 * theme toggle, and the calendar's `c` (new event) outranks the global
 * compose jump — the same shadowing the inbox already does for `c`.
 *
 * Ids, labels, groups and keys come from `CALENDAR_COMMAND_REFERENCE` and are
 * spread below rather than restated, because the shortcuts sheet also reads
 * that list to document these bindings from pages where the calendar is not
 * mounted. Two copies would drift, and the copy the user reads is the one
 * that cannot be pressed to check.
 *
 * Input safety comes from the engine default: no binding here sets
 * `allowInInput`, so every single-key shortcut stays inert while the caret is
 * in a text field, the composer, or the header date picker. `?` and `mod+k`
 * are global and unmaskable, so they keep working everywhere.
 */

import { useKeyboardScope, useRegisterCommands } from '../lib/keyboard/hooks';
import {
  calendarCommand,
  type CalendarCommandId,
  type Command,
} from '../lib/keyboard/command-registry';
import type { CalendarView } from '../app/(app)/calendar/types';

const SCOPE = 'calendar';

export interface UseCalendarKeyboardOptions {
  /** Open the create-event sheet. */
  onCreateEvent: () => void;
  /** Open the NLP quick-add input (the `q` key). */
  onQuickAdd: () => void;
  /** Jump the selected date back to today. */
  onGoToday: () => void;
  /** Move the selected date by `delta` days. */
  onStepDay: (delta: number) => void;
  /** Focus the header date picker (go to a date). */
  onGoToDate: () => void;
  /** Focus the calendar search field. */
  onFocusSearch: () => void;
  /** Switch the calendar view through the merged-tab path (URL stays in sync). */
  onSelectView: (view: CalendarView) => void;
  /** Expand/collapse the month grid strip. */
  onToggleMonthGrid: () => void;
  /** Save the open editor sheet. */
  onSaveEvent: () => void;
  /** Reopen the details of the last selected event. */
  onOpenEventDetails: () => void;
  /** Delete the currently selected event (always confirms). */
  onDeleteSelectedEvent: () => void;
  /** Restore the most recently deleted entry. */
  onUndoDelete: () => void;
  /** Live guards — the `?` sheet dims the row while one returns false. */
  canSaveEvent: () => boolean;
  canOpenEventDetails: () => boolean;
  canDeleteSelectedEvent: () => boolean;
  canUndoDelete: () => boolean;
  /** Set `false` on views that render the page but should not own the keys. */
  active?: boolean;
}

export function useCalendarKeyboard(options: UseCalendarKeyboardOptions): void {
  const { active = true, ...actions } = options;

  useKeyboardScope(SCOPE, { active });

  // Rebuilt every render and registered by structural signature, so the
  // closures stay fresh without churning the engine's binding table.
  // `run` and `enabled` are proxied live by `useRegisterCommands`.
  const live = (
    id: CalendarCommandId,
    run: () => void,
    extra?: Partial<Command>,
  ): Command => ({
    ...calendarCommand(id),
    scope: SCOPE,
    run,
    ...extra,
  });

  const commands: Command[] = [
    live('calendar.createEvent', actions.onCreateEvent),
    live('calendar.quickAddEvent', actions.onQuickAdd),
    live('calendar.goToday', actions.onGoToday),
    live('calendar.nextDay', () => actions.onStepDay(1)),
    live('calendar.previousDay', () => actions.onStepDay(-1)),
    live('calendar.goToDate', actions.onGoToDate),
    live('calendar.searchEvents', actions.onFocusSearch),
    live('calendar.viewDay', () => actions.onSelectView('day')),
    live('calendar.viewWeek', () => actions.onSelectView('week')),
    live('calendar.viewMonth', () => actions.onSelectView('month')),
    live('calendar.viewAgenda', () => actions.onSelectView('agenda')),
    live('calendar.toggleMonthGrid', actions.onToggleMonthGrid),
    live('calendar.saveEvent', actions.onSaveEvent, { enabled: actions.canSaveEvent }),
    live('calendar.openEventDetails', actions.onOpenEventDetails, {
      enabled: actions.canOpenEventDetails,
    }),
    live('calendar.deleteEvent', actions.onDeleteSelectedEvent, {
      enabled: actions.canDeleteSelectedEvent,
      // `delete`/`backspace` repeat while held by engine default — a held key
      // must never stack the delete confirm dialog.
      allowRepeat: false,
    }),
    live('calendar.undoDelete', actions.onUndoDelete, { enabled: actions.canUndoDelete }),
  ];

  useRegisterCommands(commands);
}
