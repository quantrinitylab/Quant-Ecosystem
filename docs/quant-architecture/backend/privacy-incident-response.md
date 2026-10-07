# M21 — Privacy Incident Response

## Trigger classes
Unauthorized access, accidental disclosure, telemetry leakage, excessive retention, incorrect deletion, cross-tenant exposure, or AI context leakage.

## Response
Detect → contain → preserve evidence → scope affected data → remediate → verify deletion/access controls → assess notification obligations → review.

## Special AI case
If private context reaches an unauthorized model/tool boundary, immediately stop further propagation, identify affected context, invalidate temporary artifacts where possible, and follow security/privacy incident procedures.

Never claim that leaked data was deleted merely because an application record was removed.
