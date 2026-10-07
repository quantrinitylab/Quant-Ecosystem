# M41 — App-Scoped Memory Classification

Every memory is classified by source application and memory class.

| sourceApp | examples | authority |
|---|---|---|
| Mail | communication preference, thread action item | Mail |
| Calendar | meeting preference, event history | Calendar |
| Drive | project/file context | Drive |
| Contacts | person identity/relationship fact | Contacts |
| Git | repository/project/developer workflow | Git |
| Cross-App | derived project/timeline relationship | contributing sources |

Required fields: memoryId, sourceApp, sourceObjectRef, memoryClass, subjectRef, provenance, confidence, explicitness, sensitivity, validFrom, validUntil, expiresAt, permissionScope, policyVersion.

Classification is multi-dimensional: app ownership + memory class + sensitivity + temporal state + confidence. Do not use one flat bucket.

A cross-app memory must retain all contributing source references and cannot replace the canonical records.
