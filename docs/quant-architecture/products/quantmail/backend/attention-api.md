# M09 Backend — Attention API

## Read

attention.list
- cursor
- mode
- priority
- source
- unreadOnly
- limit

## Mutations

attention.markRead
attention.markUnread
attention.resolve
attention.dismiss
attention.bulkMarkRead

Bulk operations are restricted by item category.

## Preferences

attention.preferences.get
attention.preferences.update

Preferences include:
- channels
- quiet hours
- category policy
- source policy
- batching
- sound/vibration policy

## Delivery

attention.delivery.register
attention.delivery.revoke

Device tokens are never accepted as authorization for source data.

## Deep links

Every actionable item contains a server-generated safe route reference.
Clients do not construct privileged routes from arbitrary event payloads.
