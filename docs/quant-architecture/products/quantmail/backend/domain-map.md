# QuantMail Backend — Inbox Domain Map

## Ownership

QuantMail owns:
- mailbox
- message
- thread
- participant
- label
- folder
- read state
- star state
- archive state
- delivery metadata
- mailbox policy

Calendar, Drive and Contacts remain owners of their own truth. Quanty owns agent state, not mail state.

## Aggregates

### Mailbox
- mailboxId
- ownerUserId
- address
- providerState
- quotaState

### Thread
- threadId
- mailboxId
- canonical subject
- participant set
- latestMessageId
- unreadCount
- lastActivityAt

### Message
- messageId
- threadId
- sender
- recipients
- body references
- receivedAt
- headers
- security metadata

### ThreadState
- threadId
- userId
- isRead
- isStarred
- isArchived
- isDeleted
- labels
- version

## Projections

Primary:
mail_thread_list

Secondary:
mail_unread_counts
mail_folder_counts
mail_label_counts
mail_search_document

Projection rebuild must be possible from authoritative records plus events.

## Dependency rules

Inbound:
- SMTP/IMAP ingestion
- identity
- object storage

Outbound:
- search index
- notification system
- analytics
- Quanty context
- optional calendar/contact/drive context

Failure isolation:
- search failure must not make inbox unreadable
- Quanty failure must not block inbox
- external context may degrade independently
