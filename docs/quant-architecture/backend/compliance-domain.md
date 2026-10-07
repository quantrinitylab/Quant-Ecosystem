# M25 — Compliance Domain

## Ownership
Compliance Platform owns control catalog, evidence references, assessment status, compliance requests, framework mappings, and customer-facing trust metadata.

Product domains remain owners of operational data and enforcement.

## Control record
controlId, framework, requirement, owner, status, evidenceRefs, review cadence, lastVerifiedAt, exceptions, remediation.

## States
DRAFT → IMPLEMENTED → EVIDENCED → REVIEWED → EXPIRED/REMEDIATION.

No control is marked effective merely because documentation exists.
