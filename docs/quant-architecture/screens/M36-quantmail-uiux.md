# M36 — QuantMail UI/UX

## Information architecture

QuantMail is an attention-oriented mail workspace. The inbox is a work queue, not a database dump.

Desktop order: product rail → mailbox navigation → inbox header/search → mode selector → bulk actions → thread list → optional context rail.

Modes: All, Focus, Needs You. These are views over the same authoritative mailbox state, not separate inboxes.

## Thread row

Required: participant, avatar/initial, subject, snippet, timestamp, unread state, star state, importance, attachment indicator, labels. Optional context is visually secondary: reply-needed, deadline, calendar relation, project relation, Quanty suggestion, security warning.

## Thread view

Latest message is expanded by default. Actions are close to the message/thread context. Attachments are explicit objects. Security warnings remain visible when material.

## Compose

Compose is draft-first and compact. Recipient entry, subject, body, attachments, autosave state, and send state are always understandable. Quanty assistance appears as a deliberate action, not invisible rewriting.

## Interaction principles

j/k navigation, open, reply, forward, archive, star, label, snooze, and search shortcuts may be enabled on desktop. Shortcuts are disabled while text input is focused unless explicitly scoped.
