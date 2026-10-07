# M01 — QuantMail Inbox

Status: SPEC_COMPLETE_TARGET
Priority: P0
Surface: Web + Flutter mobile + Tauri desktop

## User outcome

The inbox must answer immediately:
1. What arrived?
2. What needs attention?
3. What has already been handled?
4. Which conversation should open?
5. What can Quanty safely do next?

Inbox is a thread-oriented work queue, not a raw message dump.

## Information architecture

Desktop:
- Global app switcher
- QuantMail rail
- Search
- Inbox header
- Mode selector: All / Focus / Needs You
- Bulk action toolbar
- Thread list
- Context rail
- Composer entry

Mobile:
- Top app switcher
- Search/action header
- Mode selector
- Thread list
- One contextual bottom navigation
- Swipe actions
- Full-screen thread handoff

Never duplicate the global app switcher or bottom navigation.

## Thread row contract

Required:
- threadId
- primary participant
- avatar/initial
- subject
- latest snippet
- latest timestamp
- unread
- starred
- important
- attachment indicator
- label summary

Optional computed context:
- reply-needed
- deadline detected
- meeting correlation
- project correlation
- Quanty recommendation
- security warning

Ordering is server-defined.

## State matrix

Loading:
- preserve shell
- show structural skeleton
- never flash fake messages

Empty:
- explain the state
- provide useful actions
- do not fabricate real-looking mail

Populated:
- cursor pagination
- stable row keys
- deterministic reconciliation after mutations

Partial failure:
- render valid rows
- surface retry
- preserve scroll position

Offline:
- cached read state may render
- unsafe writes are blocked unless explicitly supported
- only approved idempotent queued actions

Unauthorized:
- clear sensitive cache
- return to authentication boundary

## Core interactions

Open thread -> mail.thread.open
Read/unread -> mail.thread.mark_read / mail.thread.mark_unread
Star -> mail.thread.star / mail.thread.unstar
Archive -> mail.thread.archive
Delete -> mail.thread.delete
Labels -> mail.thread.set_labels

Bulk:
- select
- select visible/all
- archive
- read/unread
- star/unstar
- label
- delete

Desktop shortcuts:
- j/k navigation
- o/Enter open
- e archive
- r reply after open
- Shift+u unread toggle
- s star
- / focus search

## Performance

- first usable rows must not wait for context integrations
- context rail lazy-loads
- cursor pagination only
- no N+1 participant/label requests
- no per-row Quanty calls
- analytics cannot block rendering

## Accessibility

- keyboard reachable actions
- semantic list structure
- visible focus
- labels for icon-only actions
- swipe actions also have buttons
- color is never the only state signal
- reduced motion respected

## Quanty

Quanty is advisory by default.

Examples:
- likely needs reply
- sender/project relationship
- meeting conflict
- suspicious payment-change request

Quanty cannot send, delete, or change external state without the required tool policy and approval.

## Evidence required

- desktop screenshot
- mobile screenshot
- loading/empty/error states
- keyboard proof
- API tests
- archive/read/star integration tests
- no console errors on happy path
- performance trace
- security/access test
