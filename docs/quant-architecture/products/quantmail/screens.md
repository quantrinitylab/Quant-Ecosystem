# QuantMail — Screen Design Contract

## M01 Inbox
Dense, fast triage surface. Search, filters, thread rows, unread state, sender, subject, snippet, timestamp, selection, loading/empty/error states and Quanty affordance.

Mobile: one top pillar switcher, compact search, touch-safe dense rows, one contextual bottom bar, safe-area support, no desktop sidebar/reading pane.

Desktop: high density, keyboard navigation and optional contextual rail.

## M02 Thread
Ordered messages, participants, attachments, reply/reply-all/forward, archive/delete/spam, labels, search within thread, AI summary/draft and audited AI send.

## M03 Compose
Recipients, CC/BCC, subject, rich body, attachments, autosave, send/retry/error states, AI draft/rewrite and explicit confirmation for Quanty-initiated send.

## M04 Search
Mail, people, calendar, drive and Git results with permission filtering before display. Semantic retrieval is additive and cannot bypass mailbox authorization.

## M05-M12
Mailbox, attachments, contacts, calendar, drive, file preview and Git each receive their own implementation spec before coding.

## M13 Quanty
Intent, plan, tools, cost, approval, live execution, result, verification and undo where possible.

M14-M20 cover notifications, settings, security and product-owned administration.