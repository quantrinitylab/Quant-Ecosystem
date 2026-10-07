# M20 — Security Operations Domain

## Ownership
Security Operations owns incident state, detection correlation, containment orchestration, evidence references, case workflow, and post-incident review.

It does not become the owner of Mail, Identity, Drive, Calendar, or Economy source data.

## Incident states
DETECTED → TRIAGED → CONTAINING → INVESTIGATING → ERADICATING → RECOVERING → RESOLVED → REVIEWED.

## Severity
SEV0 platform-wide critical compromise
SEV1 major customer/security impact
SEV2 contained significant incident
SEV3 localized/low-impact event

## Case record
incidentId, severity, status, detection source, affected scopes, timestamps, assigned responders, containment actions, evidence references, decision log, recovery verification, review status.

Evidence references point to controlled artifacts; raw secrets or unnecessary user content never enter incident records.
