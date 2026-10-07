# QuantMail Backend — Calendar Context

## Ownership

Calendar owns:
- events
- attendees
- RSVP state
- recurrence
- reminders
- calendars
- scheduling rules

Mail owns:
- message/thread
- invitation message representation
- mail-side correlation metadata

## Resolution pipeline

1. inspect authorized message metadata
2. extract explicit event identifiers
3. resolve Calendar object when present
4. otherwise run bounded correlation
5. return confidence + source
6. never persist an inferred event as canonical

## Cache

Store only:
- event ID
- title
- start/end
- organizer reference
- attendee state
- source version
- permission scope

Calendar events remain independently authorized.

## Failure isolation

Calendar unavailable:
- mail thread still opens
- invite information from message can remain visible
- actions requiring Calendar are disabled/retryable
