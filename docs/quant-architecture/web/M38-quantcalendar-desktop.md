# M38 — QuantCalendar Desktop UX Contract

## Shell
Workspace switcher → Calendar navigation/mini calendar → main time grid → optional contextual rail.

## Time grid
Use a stable time axis and clear current-time indicator. Events communicate duration through geometry, while title remains legible. Overlapping events use deterministic columns and never hide critical event information without an inspect affordance.

## Week view
Primary planning surface. Drag/resize may be supported but must have keyboard alternatives and clear save/pending feedback.

## Month view
Optimize date orientation. Dense days show event summaries with progressive disclosure; do not render unreadable micro-text.

## Event detail
Use a predictable header with title/time and primary actions. Secondary context opens below or in the rail.

## Scheduling
Availability comparison is visually explicit. Candidate times show timezone and participant coverage. Booking requires authoritative Calendar confirmation.

## Keyboard
Today, view switching, date navigation, search, create event, escape, and calendar movement should have discoverable shortcuts. Shortcut focus never hijacks text input.
