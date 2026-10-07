# QuantMail Web — M06 Calendar Context

## Placement

Desktop:
- right context rail
- invitation card inside thread

Mobile:
- event card below related message
- action sheet for RSVP/create

## Interaction

Primary:
- open event
- RSVP
- create event
- see conflict

Secondary:
- copy meeting link
- open location
- view attendee details when permitted

## Timezones

Always render timezone-aware values.
Avoid silently converting a scheduled event into the browser timezone when the user needs the original event timezone.

## Loading

Calendar context loads independently from message body.
Calendar outage does not block the thread.
