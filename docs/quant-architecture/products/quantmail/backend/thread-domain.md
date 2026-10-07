# QuantMail Backend — Thread Domain

## Responsibilities

Thread domain owns:
- conversation identity
- message ordering
- participants
- read state
- thread mutations
- conversation-level labels
- thread-level archive/delete state

Outbound mail service owns:
- draft
- MIME construction
- queueing
- delivery
- provider response

Attachment service owns:
- object storage
- scan state
- download authorization
- retention

## Thread retrieval

A thread read is a composition of:
1. authorized thread metadata
2. message list
3. attachment metadata
4. user thread state
5. approved security classification

Optional context is loaded independently.

## Message ordering

Primary order:
- provider/server received timestamp
- deterministic message ID tie-breaker

Never infer message order from client timestamps alone.

## Thread mutation boundaries

Thread domain may:
- archive
- restore
- delete
- label
- star
- read/unread

Thread domain may not:
- directly send a new email
- directly mutate Calendar/Drive/Contacts
- bypass outbound delivery policy

Cross-product actions emit commands/events to owning domains.
