# M22 — Timezone & Temporal Semantics

## Storage
Persist instants in UTC plus the relevant IANA timezone when an event has user/calendar timezone semantics.

## Rules
- Never treat a local wall-clock time as globally unambiguous.
- DST transitions must be tested.
- Recurring Calendar events use Calendar's temporal model.
- Mail timestamps preserve provider/source semantics before display conversion.
- Relative labels such as “today” use the viewer's active timezone.

## Testing
Cover DST gaps/folds, timezone changes, recurring events, date-boundary searches, and users traveling across regions.
