# M02 — QuantMail Thread / Conversation

Status: SPEC_COMPLETE_TARGET
Priority: P0

## User outcome

A user can safely understand an entire conversation, identify the latest state, act on it, and return to the inbox without losing context.

The thread view must optimize for:
- comprehension
- reply speed
- attachment access
- participant trust
- related context
- safe action

## Layout

Desktop:
- back/inbox navigation
- thread header
- participant metadata
- action toolbar
- message stack
- inline attachment area
- reply composer
- contextual rail

Mobile:
- native back
- compact title/header
- message stack
- sticky reply/action entry
- attachment viewer handoff
- contextual actions sheet

## Message card contract

Required:
- messageId
- sender identity
- recipient summary
- sent/received timestamp
- sanitized body
- message state

Optional:
- reply-to
- cc/bcc summary
- attachment metadata
- security flags
- delivery state
- quoted content
- calendar/file/contact relation

Never render unsanitized remote HTML as trusted content.

## Message state

- collapsed historical
- expanded
- quoted/collapsed
- loading body
- body unavailable
- attachment loading
- attachment failed
- suspicious-content warning

Latest message opens expanded by default unless user preference says otherwise.

## Actions

Primary:
- reply
- reply all
- forward
- archive
- delete
- mark unread
- star

Secondary:
- move/label
- print/export where supported
- block/report according to product policy
- create calendar event
- save attachment to Drive

Destructive actions require policy-consistent confirmation.

## Composer handoff

Thread view owns reply context but the send transaction belongs to the outbound mail domain.

Reply composer receives:
- threadId
- replyTarget
- quote policy
- attachment context
- draftId when existing

Send must not be implemented as a local UI side effect.

## Scroll behavior

- opening a thread positions at the latest relevant message
- preserve anchor across attachment expansion
- new inbound messages may use a non-disruptive arrival indicator
- user scroll position is preserved during non-critical refreshes

## Related context rail

Possible cards:
- Contact
- Calendar event
- Drive file
- Git/project relation
- Quanty summary

These are secondary context, never alternate sources of mail truth.

## Completion evidence

- normal multi-message thread
- long thread
- attachment thread
- quoted-heavy thread
- suspicious HTML/content case
- send failure
- offline/error body
- mobile long-thread behavior
- deep-link refresh
