# QuantMail Backend — Quanty Workspace API

## Start

quanty.session.create

Input:
~~~ts
{
  surface: "mail";
  initialPrompt?: string;
  contextRefs?: ContextRef[];
}
~~~

## Message

quanty.session.message

Input:
~~~ts
{
  sessionId: string;
  text: string;
}
~~~

## State

quanty.session.get

Returns:
- session
- current plan summary
- approval state
- execution state
- result summaries

## Approval

quanty.approval.respond

Input:
~~~ts
{
  approvalId: string;
  decision: "approve" | "deny";
}
~~~

Approval tokens are scoped and expire.

## Cancel

quanty.session.cancel

Cancellation is idempotent.

## Streaming

Tool progress may stream through realtime infrastructure.
Final state is persisted server-side and can be recovered after reconnect.

## Errors

- SESSION_NOT_FOUND
- TOOL_NOT_AUTHORIZED
- APPROVAL_REQUIRED
- APPROVAL_EXPIRED
- TOOL_FAILED
- VERIFICATION_FAILED
- CANCELLED
- POLICY_BLOCKED
