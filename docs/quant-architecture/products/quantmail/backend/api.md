# QuantMail Backend — Inbox API Contract

All endpoints are versioned and typed. Clients never depend on storage-specific response shapes.

## Query: mail.threads.list

Input:

~~~ts
{
  mailboxId: string;
  mode: "all" | "focus" | "needs_you";
  cursor?: string;
  limit?: number;
  labels?: string[];
  unreadOnly?: boolean;
}
~~~

Output:

~~~ts
{
  items: ThreadSummary[];
  nextCursor?: string;
  requestId: string;
}
~~~

Ordering:
1. mode-defined relevance
2. lastActivityAt descending
3. threadId ascending tie-breaker

## Commands

mail.thread.mark_read
mail.thread.mark_unread
mail.thread.star
mail.thread.unstar
mail.thread.archive
mail.thread.restore
mail.thread.delete
mail.thread.restore_deleted
mail.thread.set_labels

All return:

~~~ts
{
  threadId: string;
  version: number;
  state: ThreadState;
  eventId: string;
  requestId: string;
}
~~~

## Errors

Canonical:
- UNAUTHENTICATED
- FORBIDDEN
- THREAD_NOT_FOUND
- THREAD_VERSION_CONFLICT
- INVALID_CURSOR
- INVALID_LABEL
- RATE_LIMITED
- DEPENDENCY_UNAVAILABLE
- INTERNAL_ERROR

Do not expose database/provider/storage errors.

## Idempotency

Retryable mutations accept an idempotency key when required by transport policy.

## Authorization

Every request evaluates:
- authenticated subject
- mailbox ownership/delegation
- organization policy
- product role
- resource capability

A guessed threadId is never sufficient for access.
