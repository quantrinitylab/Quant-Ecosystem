# QuantMail Backend — People Context API

## Query: mail.participant.context

Input:

~~~ts
{
  participantIdentity: string;
  threadId?: string;
}
~~~

Output:

~~~ts
{
  identity: ParticipantIdentity;
  contact?: ContactReference;
  relationship?: RelationshipSummary;
  sourceVersion?: string;
  requestId: string;
}
~~~

## ContactReference

Contains only safe fields needed by Mail.

~~~ts
{
  contactId: string;
  displayName?: string;
  avatarRef?: string;
  organization?: string;
  role?: string;
  route: string;
}
~~~

## Commands

mail.participant.create_contact_intent
mail.participant.attach_contact

These create an owning-domain workflow/request.
They do not directly mutate Contacts records.

## Errors

- CONTACT_CONTEXT_UNAVAILABLE
- CONTACT_NOT_FOUND
- FORBIDDEN
- INVALID_IDENTITY
- DEPENDENCY_UNAVAILABLE
