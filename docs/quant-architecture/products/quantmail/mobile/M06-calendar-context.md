# QuantMail Flutter — M06 Calendar Context

## UX

Invitation/event card:
- title
- time
- timezone
- organizer
- RSVP
- conflict state

Actions open native/product Calendar routes through normal app navigation.

## Mobile constraints

- no horizontal desktop rail
- compact event card
- action sheet for multiple actions
- accessible timezone display

## Offline

Cached event context can display as stale.
RSVP/create/propose actions require connectivity unless Calendar explicitly supports offline mutation.
