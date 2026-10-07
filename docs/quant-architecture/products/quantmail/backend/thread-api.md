# QuantMail Backend — Thread API

## Query: mail.thread.get

Input:

~~~ts
{
  threadId: string;
  beforeMessageId?: string;
  limit?: number;
}
~~~

Output:

~~~ts
{
  thread: ThreadHeader;
  messages: MessageSummary[];
  nextCursor?: string;
  requestId: string;
}
~~~

## Message body query

mail.message.get_body

Input:
~~~ts
{
  messageId: string;
  representation: "safe_html" | "text";
}
~~~

The API returns sanitized content, never raw provider HTML.

## Attachment query

mail.message.attachments

Input:
~~~ts
{
  messageId: string;
}
~~~

Output includes only metadata needed to render the attachment list.

Secure download uses a separately authorized capability.

## Cross-product commands

mail.thread.create_calendar_event
mail.thread.save_attachment_to_drive

These are orchestration commands. The owning product remains the source of truth.

## Thread actions

mail.thread.archive
mail.thread.restore
mail.thread.delete
mail.thread.mark_read
mail.thread.mark_unread
mail.thread.star
mail.thread.unstar
mail.thread.set_labels

## Errors

- THREAD_NOT_FOUND
- MESSAGE_NOT_FOUND
- BODY_UNAVAILABLE
- ATTACHMENT_NOT_AVAILABLE
- SECURITY_BLOCKED
- FORBIDDEN
- CONFLICT
- DEPENDENCY_UNAVAILABLE

All responses include requestId for support/debugging.
