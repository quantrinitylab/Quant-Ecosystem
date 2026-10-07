# QuantMail Backend — Calendar Context API

## Query

mail.thread.calendar_context

Input:

~~~ts
{
  threadId: string;
  messageId?: string;
}
~~~

Output:

~~~ts
{
  matches: CalendarContextMatch[];
  requestId: string;
}
~~~

Match:

~~~ts
{
  eventId: string;
  title: string;
  start: string;
  end: string;
  timezone: string;
  organizer?: IdentityReference;
  attendeeState?: string;
  confidence: "explicit" | "high" | "medium";
  route: string;
}
~~~

## Commands

mail.calendar.rsvp
mail.calendar.create_from_message
mail.calendar.open_event
mail.calendar.propose_time

These commands orchestrate Calendar APIs. Calendar remains authoritative.

## Errors

- CALENDAR_UNAVAILABLE
- EVENT_NOT_FOUND
- RSVP_NOT_ALLOWED
- EVENT_CONFLICT
- FORBIDDEN
- INVALID_INVITATION
