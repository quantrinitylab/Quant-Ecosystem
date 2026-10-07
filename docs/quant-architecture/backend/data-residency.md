# M22 — Data Residency

## Residency policy
Each organization/tenant may have an explicit residency policy where the product tier and legal requirements support it.

## Data classes
Classify residency for:
- transactional data
- message bodies
- attachments
- backups
- search indexes
- embeddings
- security evidence
- telemetry
- billing metadata

## Rule
A region receiving data must be an approved processing location for that data class.

Residency policy is enforced at service/data-access boundaries, not merely documented.
