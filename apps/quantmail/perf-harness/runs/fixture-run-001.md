PR: <link> | Gate: <status> | Full-sweep: <status>
Device: mid-range Android emulation (VP-360, CPU ×4) + VP-390 reference
Target: http://127.0.0.1:46243/ (harness fixture — NOT the real app)
Overall: FAIL
Journeys run: J1, J2, J3, J4, J5, J6 (skipped: none; blocked: none)

| Metric | Budget | Measured (median) | Verdict |
|---|---|---|---|
| Tap → thread open | <300ms | 63.5ms (p95 90ms) | PASS |
| Tap → back to list | <300ms | 61.8ms (p95 146.9ms) | PASS |
| Filter switch (worst filter) | <200ms first paint, 0 blank frames | 13.9ms (Unread), 0 blank frames | PASS |
| List scroll (VP-360 throttled) | ≥95% frames ≤16.67ms, p99 ≤33.3ms, 0 longtasks | 38.1% (≤17ms: 99.2%), p99 16.8ms, 1 longtasks | FAIL |
| Thread-open frames | 0 frames >50ms | max 16.8ms | PASS |
| Drawer open/close | slides both ways | open 380ms, close animated=true | PASS |
| PTR | transform-only, no list push | noPush=true (max delta 0px) | PASS |

Per-filter table (J2): filter | t_first_paint | t_rows | blank frames

| filter | t_first_paint | t_rows | blank frames | note |
|---|---|---|---|---|
| All | 8.9ms | 8.9ms | 0 | — |
| Unread | 13.9ms | 13.9ms | 0 | — |
| Contacts | 6.8ms | 6.8ms | 0 | — |
| Spam | 7.6ms | 7.6ms | 0 | — |

Baseline diff:
Baseline: none committed yet — this run becomes the baseline candidate.

J3 empty states: run (structure present: true)

Traces: JSON artifact for this run (committed under runs/); videos/screenshots live with the QA evidence store and are linked, not committed as binaries.
