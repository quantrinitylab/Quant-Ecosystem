# M13 Backend — Delivery API

## Outbound

mail.send.prepare
mail.send.confirm
mail.send.status
mail.send.cancel

Preparation is short-lived and bound to:
- draft
- expected version
- normalized recipients
- attachment set
- sender identity

## Delivery

mail.delivery.get
mail.delivery.events

## Domain health

mail.domain.authentication_status
mail.domain.delivery_health

## Inbound

mail.inbound.status
mail.imap.sync_status

Clients never submit arbitrary MIME directly to provider adapters.
