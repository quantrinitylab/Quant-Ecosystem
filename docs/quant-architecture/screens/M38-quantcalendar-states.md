# M38 — QuantCalendar UI State Matrix

## Calendar views
Loading grid, no calendars, no events, dense events, filtered empty, partial event data, calendar unavailable, reconnecting, stale cache, timezone changed, DST boundary.

## Event editor
New, dirty, autosaving where supported, validating, conflict detected, attendee resolution pending, save pending, saved, save failed, delete confirmation, delete pending, delete failed.

## RSVP
Unknown, pending, accepted, tentative, declined, response failed, organizer policy prevents response, event changed since response.

## Scheduling
Gathering availability, partial availability, no viable time, candidate proposal, conflict, proposal pending, booked/verified. A proposed slot must never be presented as booked until Calendar confirms it.

## Recurrence
Simple recurrence, custom recurrence, timezone/DST warning, series-vs-instance edit choice, exception instance, cancellation of one occurrence.

## Rule
Every async or ambiguous state must state whether it is a proposal, pending operation, authoritative result, or failure.
