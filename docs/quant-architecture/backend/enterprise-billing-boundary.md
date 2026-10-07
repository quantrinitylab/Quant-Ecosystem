# M24 — Enterprise Billing Boundary

## Ownership
Economy owns plans, invoices, payment instruments, credits, and billing truth.

Organization Platform owns organization identity and plan association metadata only.

## Rules
Billing status may restrict organization capabilities through a contract, but Organization Platform never edits billing truth.

Enterprise quotas and seat counts are reconciled through Economy-owned APIs/events.
