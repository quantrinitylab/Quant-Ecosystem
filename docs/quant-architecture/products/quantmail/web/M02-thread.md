# QuantMail Web — M02 Thread

## Components

- ThreadPage
- ThreadHeader
- ParticipantSummary
- ThreadActionBar
- MessageStack
- MessageCard
- QuotedContent
- AttachmentList
- ReplyComposerEntry
- ContextRail

## Rendering strategy

Header and message metadata render before secondary context.

Message body can progressively resolve after thread metadata.

Large threads should use measured virtualization/collapse rather than blindly mounting hundreds of heavy HTML documents.

## Security UI

Suspicious/external indicators are explicit.
Unsafe active content is not executed.
Blocked content gets a clear recovery/explanation path.

## Navigation

Opening from inbox:
- preserve inbox cursor/filter in route state when supported

Back:
- return to same inbox position when possible

Deep link:
- full refresh must reconstruct authorized thread state

## Composer

M02 launches or owns the reply surface, but outbound send uses the mail sending domain.

A failed send preserves the draft and explains the failure.
