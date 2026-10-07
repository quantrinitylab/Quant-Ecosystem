# M15 — Data Lifecycle, Retention, Export & Compliance

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Principle

Data lifecycle is domain policy, not a single delete button.

Every data class has:
- owner
- purpose
- retention policy
- legal/compliance hold behavior
- deletion behavior
- export behavior
- audit requirement

## User surfaces

- Storage/data overview
- Export center
- Deletion requests
- Retention information
- Active legal/compliance holds where applicable
- Data access history where policy permits

## Lifecycle

CREATE -> ACTIVE -> RETAINED -> EXPIRED/DELETED

Some records enter:
CREATE -> ACTIVE -> HELD

A hold prevents eligible deletion until released by authorized policy.

## UX

Explain:
- what data exists
- why it is retained
- what deletion affects
- what cannot be deleted immediately
- export status
- deletion status

Never promise immediate deletion when asynchronous erasure is required.
