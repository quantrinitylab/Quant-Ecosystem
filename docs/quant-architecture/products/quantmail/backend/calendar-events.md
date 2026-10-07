# QuantMail Backend — Calendar Integration Events

Calendar canonical events consumed by Mail context:
- calendar.event.created.v1
- calendar.event.updated.v1
- calendar.event.deleted.v1
- calendar.attendee.response_changed.v1

Mail uses these to refresh cached context.

## Invitation lifecycle

Inbound invitation:
1. message received
2. invitation metadata extracted
3. Calendar correlation attempted
4. context projection updated
5. user sees RSVP/event state

Calendar remains independent of message delivery.

## Idempotency

Repeated provider invitation messages must not create duplicate Calendar events through Mail orchestration.
