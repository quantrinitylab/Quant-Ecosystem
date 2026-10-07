# QuantMail Backend — Compose API

## Queries

mail.draft.get
mail.draft.list

## Commands

mail.draft.create
mail.draft.update
mail.draft.attach
mail.draft.detach
mail.draft.discard
mail.draft.prepare_send
mail.draft.send

## Update input

~~~ts
{
  draftId: string;
  expectedVersion: number;
  patch: DraftPatch;
  idempotencyKey?: string;
}
~~~

## Prepare-send

prepare_send validates:
- authorization
- recipients
- mailbox state
- policy
- attachment readiness
- content restrictions
- scheduling rules

Returns a send review object.

## Send

Send accepts only a valid, unexpired preparation token.

~~~ts
{
  draftId: string;
  expectedVersion: number;
  preparationId: string;
  confirmation: "user_confirmed" | "trusted_automation";
}
~~~

Provider submission happens asynchronously where required.

## Errors

- DRAFT_NOT_FOUND
- DRAFT_VERSION_CONFLICT
- INVALID_RECIPIENT
- ATTACHMENT_NOT_READY
- SEND_POLICY_BLOCKED
- PREPARATION_EXPIRED
- SEND_ALREADY_ACCEPTED
- PROVIDER_UNAVAILABLE
