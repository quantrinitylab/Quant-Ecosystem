# M36 — QuantCalendar UI/UX

## Information architecture

Calendar optimizes time comprehension first. The user should understand current time, day/week structure, conflicts, participants, and next actions without opening multiple panels.

Views: Day, Week, Month, Agenda. View switching preserves date context.

## Event surface

Event card shows title, time, timezone when relevant, organizer, attendee state, location/meeting link, recurrence, reminders, and related objects. Edit actions remain Calendar-owned.

## Create event

Fast create captures title/time first, then optional participants, location, recurrence, reminders, and related context. Advanced scheduling opens without destroying the draft.

## Mail integration

Invitation messages may show event correlation, but RSVP and event mutation execute in Calendar. The visual language must make that ownership obvious.

## Mobile

Day/agenda is optimized for touch. Week/month use compact cells with progressive disclosure. Event details open as a focused sheet/page with clear edit and RSVP actions.
