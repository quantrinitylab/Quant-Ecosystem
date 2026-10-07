# QuantMail Quanty Tools

All tools are typed, capability-scoped and auditable according to risk.

## Read-only

mail.search
mail.get_thread_summary
mail.get_message_metadata
mail.find_unread_attention
mail.detect_deadline
mail.find_related_contact
mail.find_related_calendar_event

## Mutating

mail.mark_read
mail.mark_unread
mail.star
mail.archive
mail.apply_label

Risk bands:
- low: reversible personal-state changes
- medium: bulk changes
- high: delete, send, external recipients, policy changes

## Approval

Default:
- read tools: automatic when authorized
- low-risk mutations: explicit user request may authorize execution
- bulk/high-risk: confirmation
- send: final confirmation unless a documented trusted automation policy applies

## Context minimization

Pass only:
- required metadata
- relevant excerpt
- declared purpose

Quanty does not receive the whole mailbox by default.

## Verification

After any mutation:
1. verify target state
2. compare expected result
3. record tool result
4. surface failure
5. never claim completion from intent alone
