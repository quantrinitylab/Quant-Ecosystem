# M38 — QuantCalendar Complete UI/UX System

## Mission
Make QuantCalendar an implementation-ready, first-class calendar product inside the QuantMail Workspace. Calendar owns events, attendees, recurrence, reminders, scheduling, RSVP, calendars, and time semantics. Mail may correlate invitations but never owns event state.

## Product thesis
QuantCalendar is a time-comprehension and scheduling workspace. The interface must answer: where am I in time, what is happening, who is involved, where do I need to be, what conflicts exist, and what should I do next.

## Primary information architecture
Today · Day · Week · Month · Agenda · Calendars · Scheduling · Tasks/related attention where implemented.
Primary action: Create event.
Global: workspace switcher, universal search, Quanty launcher, account/session.

## Core screens
1. Today
2. Day view
3. Week view
4. Month view
5. Agenda
6. Event detail
7. Create event
8. Edit event
9. Quick-create
10. Recurring-event editor
11. Attendee/guest editor
12. Availability/scheduling
13. Calendar picker
14. Calendar management
15. RSVP state
16. Conflict resolution
17. Timezone/time-zone comparison
18. Search results
19. Related Mail context
20. Related Contacts context
21. Related Drive context
22. Quanty scheduling workspace
23. Calendar settings handoff

## View principles
Day optimizes execution. Week optimizes planning. Month optimizes orientation. Agenda optimizes dense retrieval. Switching views preserves date and selected calendar context.

## Time semantics
Every event has a timezone-aware canonical representation. DST transitions, all-day events, floating times, recurring events, and locale-specific week starts must be visually and behaviorally explicit.

## Event hierarchy
Time + title are primary. Participants, organizer, location/meeting link, recurrence, calendar, RSVP, reminders, attachments, and related objects are secondary but discoverable.

## Scheduling principle
Scheduling must expose availability assumptions. A suggested time is a proposal, not a booking. Conflicts are explainable and never silently resolved.

## Ownership
Create/edit/delete/RSVP/reschedule/reminders are Calendar-owned mutations. Mail invitation UI deep-links to Calendar for authoritative state.
