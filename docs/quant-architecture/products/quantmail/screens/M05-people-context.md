# M05 — People / Contacts Context

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Purpose

Give a user useful identity context around mail participants without duplicating Contacts ownership.

Contacts remains the canonical source for person/profile truth.

## User outcome

From an inbox row or thread, a user can:
- understand who a participant is
- see relevant relationship context
- access the canonical contact
- create/update contact through the owning Contacts workflow
- see safe organization/role metadata when available

## Entry points

- thread participant
- inbox sender row
- search result
- compose recipient chip
- contact-related Quanty suggestion

## Context card

Possible fields:
- display name
- verified address
- avatar
- organization
- role/title
- phone availability
- shared labels/tags
- relationship summary
- last interaction summary
- contact route

Do not assume every sender is a contact.

## Unknown sender

Show:
- sender identity
- trust/security status
- add-to-contacts action

Do not fabricate names from weak inference.

## Relationship context

Relationship summaries are derived, not canonical contact records:
- first interaction
- latest interaction
- interaction frequency bucket
- shared event/project indicators

Never expose hidden analytics or private relationship data without policy authorization.

## Mutation boundary

Creating/editing a contact routes to Contacts.

Mail may request:
- create contact intent
- attach sender to existing contact
- refresh participant context

Mail does not directly mutate the Contacts database.

## Evidence

- known contact
- unknown sender
- delegated mailbox
- multiple addresses for one contact
- contact update from thread
- Contacts dependency outage
