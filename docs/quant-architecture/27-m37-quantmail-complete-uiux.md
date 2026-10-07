# M37 — QuantMail Complete UI/UX System

## Mission
Turn QuantMail from an architecture concept into a screen-complete, implementation-ready email product inside the five-app QuantMail Workspace. This milestone defines screens, hierarchy, states, interactions, responsive behavior, and Quanty placement. It does not redefine Mail domain ownership.

## Product principle
QuantMail is a high-density communication workspace. The primary job is to help users understand what needs attention and act quickly without losing context.

## Global information architecture
Primary: Inbox, Starred, Snoozed, Sent, Drafts, Scheduled, More.
Secondary: Spam, Trash, All Mail, labels/folders, settings entry.
Global: app switcher, universal search, Quanty launcher, account/session.

## Modes
All = complete inbox work queue.
Focus = high-signal work requiring attention.
Needs You = threads with a concrete next action, question, deadline, or unresolved decision.
Modes are views, not separate stores.

## Core screens
1. Inbox
2. Focus inbox
3. Needs You inbox
4. Thread
5. Thread split/detail view
6. Compose
7. Minimized compose
8. Full-screen compose
9. Drafts
10. Sent
11. Scheduled
12. Snoozed
13. Starred
14. All Mail
15. Spam
16. Trash
17. Search results
18. Search filters
19. Label/folder view
20. Attachment/file context
21. Contact context
22. Calendar context
23. Security warning/quarantine handoff
24. Settings handoff
25. Mail admin handoff

## Screen contract
Every screen must define: purpose, entry routes, exit routes, primary action, secondary actions, information hierarchy, required data, optional data, loading, empty, error, offline/degraded, permission, responsive behavior, accessibility, keyboard/gesture behavior, analytics, and deep-link restoration.

## Inbox anatomy
Header: title/count + mode selector + search/filter + bulk controls.
List: selectable thread rows with sender/subject/snippet/time/unread/star/important/attachment/labels.
Context: optional related people/event/file/security/Quanty panel.
No per-row agent call. Computed context is batched/server-derived.

## Thread anatomy
Header: back/breadcrumb, subject, participants, security state, thread actions.
Body: chronological messages; latest expanded by default; quoted content progressively disclosed.
Action zone: reply, reply-all, forward, archive, snooze, labels, more.
Context: attachments, people, calendar, files, security, Quanty.

## Compose anatomy
Recipients → subject → body → attachments → autosave/send state → actions.
Draft state is always visible when relevant. Recipient chips distinguish internal/external recipients. Send remains a deliberate action.

## Search
Search starts globally but may scope to Mail. Advanced filters include participant, sender, recipient, date range, attachment, label, unread, starred, security, and has relation. Search state is restorable on back navigation.

## Settings handoff
Mail-specific settings open from unified Settings but remain Mail-owned. Do not duplicate Identity, Economy, Drive, Quanty, or platform settings inside Mail.

## Admin handoff
Mail Admin is reachable only for authorized users and remains product-owned. End-user Mail navigation must not become an admin console.
