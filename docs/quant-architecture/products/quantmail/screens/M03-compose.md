# M03 — QuantMail Compose / Draft

Status: SPEC_COMPLETE_TARGET
Priority: P0

## User outcome

A user can compose, save, recover and safely send a message without losing work.

Compose is a draft-first workflow.
Draft persistence is separate from outbound delivery.

## Surfaces

Desktop:
- compact compose window or full editor
- recipient controls
- subject
- rich body
- attachment area
- Quanty assistance
- send state

Mobile:
- full-screen compose
- keyboard-aware layout
- recipient chips
- attachment picker handoff
- draft autosave indicator

## Fields

- from
- to
- cc
- bcc
- subject
- body
- attachments
- reply context
- signature
- scheduling options where supported

## State machine

DRAFT
-> AUTOSAVING
-> SAVED

SAVED
-> SENDING
-> SENT

SENDING
-> SEND_FAILED
-> SENDING

SAVED
-> DISCARDED

Send failure never destroys the saved draft.

## Recipient UX

- typed addresses
- contact suggestions
- invalid recipient state
- duplicate normalization
- external-recipient visibility
- attachment warning before send when relevant

Bcc is always visually distinguishable.

## Send safety

Before send:
- validate recipients
- validate policy
- validate attachment availability
- run security/policy checks
- show final send action

High-risk or external-recipient workflows may require confirmation according to product policy.

## Autosave

Autosave after meaningful edits with debounce.
Manual close never waits indefinitely for autosave.

Show:
- saving
- saved
- offline
- conflict
- save failed

## Evidence

- new draft
- autosave
- reload recovery
- recipient validation
- attachment
- send success
- provider send failure
- offline draft
- duplicate tab/window conflict
