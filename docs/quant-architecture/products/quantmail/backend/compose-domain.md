# QuantMail Backend — Compose Domain

## Ownership

Compose domain owns:
- drafts
- recipient normalization
- draft attachments references
- draft version
- autosave
- discard state
- compose metadata

Outbound delivery owns:
- MIME generation
- sending queue
- provider submission
- delivery state

Do not make draft persistence depend on provider availability.

## Aggregate

Draft:
- draftId
- mailboxId
- ownerUserId
- threadId nullable
- fromIdentity
- recipients
- subject
- bodyDocumentRef
- attachmentRefs
- version
- state
- updatedAt

## Invariants

- draft belongs to one mailbox owner
- version increases on successful mutation
- discarded draft cannot be sent
- sent draft has immutable send snapshot
- recipient addresses are normalized before send

## Cross-domain boundaries

Calendar/Drive/Contacts can be invoked through commands.
They do not write draft records directly.

Quanty can read a scoped draft and propose edits.
Quanty does not become draft owner.
