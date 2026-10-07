# M38 — QuantCalendar Component System

## Core components
CalendarMiniNavigator, CalendarViewSwitcher, TimeGrid, CurrentTimeIndicator, EventBlock, AllDayRow, OverlapCluster, AgendaList, EventDetail, EventEditor, QuickCreate, AttendeePicker, AvailabilityGrid, ConflictCard, RecurrenceEditor, TimezonePicker, CalendarVisibilityPicker, RSVPControl, ReminderEditor, CalendarContextCard, MailInvitationCard, QuantyScheduleCard.

## Component states
Default, hover, focus, pressed, selected, dragging, resizing, disabled, loading, pending, conflict, error, permission-limited, and read-only as applicable.

## Interaction contract
Every drag action has keyboard/form alternative. Every event state has text semantics in addition to geometry/color. Event colors are calendar/category aids, not the sole source of meaning.
