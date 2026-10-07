# M17 — Attachment Bandwidth & Large Objects

Mail stores attachment metadata and references; object storage owns large bytes.

## Download
Authorize → verify scan/object state → issue short-lived capability → stream through approved path → record telemetry.

## Upload
Initiate capability → upload → finalize → scan/classify → publish availability.

Apply per-user/org bandwidth budgets, concurrent-transfer limits, range support where safe, CDN caching for eligible immutable content, and quarantine enforcement.

Large transfers must never consume application memory proportional to file size.
