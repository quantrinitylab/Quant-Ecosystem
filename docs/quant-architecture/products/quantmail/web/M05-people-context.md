# QuantMail Web — M05 People Context

## Placement

Desktop:
- contextual rail on selected thread
- participant hover/popover for quick context

Mobile:
- participant tap opens compact context sheet

## Interaction

Primary:
- open canonical contact
- add to Contacts
- see organization/context

Secondary:
- copy address
- start compose
- view related interactions

All routes return to the original mail context.

## Performance

Prefetch only likely-visible participant context.
Do not issue one request per participant in a large thread.

## Degraded state

If Contacts is unavailable:
- retain sender identity
- hide unavailable enrichment
- provide retry
