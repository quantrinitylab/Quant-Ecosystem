# M20 — Detection & SIEM Integration

## Signal sources
Identity/authentication, Mail delivery, M14 trust engine, API gateway, WAF, Kubernetes, database audit, object storage, admin actions, Quanty tool execution, and endpoint/security telemetry.

## Pipeline
Signal → normalize → enrich → correlate → score → rule/policy decision → alert/case.

## Requirements
- preserve event provenance
- synchronize timestamps
- deduplicate repeated signals
- retain correlation IDs
- separate raw telemetry from analyst-facing summaries
- enforce tenant/privacy boundaries

SIEM integration receives security telemetry; it does not become a source of product truth.
