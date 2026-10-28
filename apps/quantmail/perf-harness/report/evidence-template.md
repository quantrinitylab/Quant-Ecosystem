| Metric | Budget | Measured (median) | Verdict |
|---|---|---|---|
| Tap → thread open | <300ms | <n>ms | PASS/FAIL |
| Tap → back to list | <300ms | <n>ms | PASS/FAIL |
| Filter switch (worst filter) | <200ms first paint, 0 blank frames | <n>ms, <n> blank frames | PASS/FAIL |
| List scroll (VP-360 throttled) | ≥95% frames ≤16.67ms, p99 ≤33.3ms, 0 longtasks | <%>%, p99 <n>ms, <n> longtasks | PASS/FAIL |
| Thread-open frames | 0 frames >50ms | max <n>ms | PASS/FAIL |
| Drawer open/close | slides both ways | <observed> | PASS/FAIL |
| PTR | transform-only, no list push | <observed> | PASS/FAIL |

Per-filter table (J2): filter | t_first_paint | t_rows | blank frames
Traces: <link/path to JSON trace + video/screenshot set>
Baseline diff: <any metric >10% worse than baseline, or "none">

(This template is rendered by report/evidence.mjs FROM the run JSON —
never hand-type numbers into a post.)
