# QuantCalendar — RSVP occurrence-vs-series contract

**Version: v1** (2026-10-13). Status: implemented (follow-up to #1093).
Any per-occurrence RSVP split is a **v2** change and must bump this document,
migrate attendee storage, and update the UI copy rules below.

## Occurrence identity

- Occurrences are **virtual rows, never persisted**. Id format:
  `<parentId>_<occurrence start ISO>` (UTC ISO from the recurrence expansion,
  e.g. `e1_2026-10-15T09:00:00.000Z`).
- Resolution splits at the **first** `_`; the suffix is percent-decoded.
- Backend (`POST /events/:id/rsvp`, `DELETE /events/:id`) and frontend
  (event detail page, `fallbackRsvpScope`) both resolve occurrence ids to the
  parent before any read or write.

## Field override vs inheritance (recurrence expansion)

Derived per occurrence (overrides):

| Field | Source |
|---|---|
| `id` | `<parentId>_<iso>` |
| `parentId`, `recurrenceParentId` | the series row |
| `startTime`, `endTime` | recurrence expansion in the series' timeZone |

Inherited from the series (never per-occurrence in v1):

- `title`, `description`, `location`
- `attendees` (the RSVP list — the subject of this contract)
- `reminders`, `recurrenceRule`, `calendarId`, `allDay`, `color`, metadata

## RSVP semantics (v1)

- `POST /events/:id/rsvp` **always writes the series-level attendee list** on
  the parent row (`attendees` JSON column). There is **no per-occurrence RSVP
  split** in v1: an attendee's status covers every occurrence in the series.
- The response carries
  `rsvpScope: { kind: 'occurrence' | 'event', appliesTo: 'series' | 'event', fromOccurrence: string | null }`
  so the client can confirm exactly what the write covered.
- UI copy must **never imply a per-occurrence write**. Pinned copy
  (see `buildRsvpScopeCopy`):
  - occurrence page: "Accepted — recorded for the entire series. You responded
    from the {label} occurrence; every occurrence in this series shares this
    response."
  - series page: "Accepted — recorded for the entire series. Every occurrence
    in this series shares this response."
  - non-recurring event: "Accepted — recorded for this event."

## Concurrency

- The write is read-modify-write on a JSON column. Concurrent writes
  serialize via `SELECT ... FOR UPDATE` on the `calendar_events` row inside an
  interactive Prisma `$transaction` — a lost RSVP is a defect, not acceptable.
- Proven by `backend/__tests__/calendar.routes.test.ts`
  ("concurrent RSVPs are atomic"): two simultaneous RSVPs both land, and a
  control without the lock shows the same workload losing one response.

## Series edits after RSVPs (v1)

- Editing the series (title, time, attendee list) **never splits or moves**
  existing RSVPs — all occurrences keep sharing the single attendee list.
- Deleting one occurrence appends an EXDATE/exception to the parent's
  `recurrenceRule`; the attendee list is untouched (RSVPs persist for the
  remaining occurrences).
- Deleting the whole series deletes the parent row and its attendee list.
- Adding/removing an attendee on the series applies to all occurrences
  (shared list) — the UI must say so when the action originates from an
  occurrence page.

## Future (v2, not built)

Per-occurrence RSVP exceptions would need an `occurrenceExceptions`
structure on the parent row (keyed by occurrence ISO) plus migration of the
flat attendee list. Until v2 ships, this v1 contract is the source of truth.
