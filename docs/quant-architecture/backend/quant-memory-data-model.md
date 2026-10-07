# Quant Memory Data Model

## MemoryRecord

memoryId, tenantId, subjectType, subjectId, memoryType, representation, sourceRefs, provenance, confidence, sensitivity, explicitness, freshness, status, validFrom, validUntil, expiresAt, createdAt, updatedAt, version, policyVersion.

## MemorySourceRef

sourceProduct, sourceObjectType, sourceObjectId, sourceVersion, eventId, observedAt, extractionMethod, extractionModelVersion.

## MemoryEvidence

Evidence is separate from the memory statement. It may include source snippets or structured attributes only when permitted. Evidence is minimized and access-controlled.

## MemoryFeedback

feedbackId, memoryId, actor, action, reason, previousVersion, resultingVersion, createdAt.

## ContextSnapshot

contextId, requester, purpose, productScope, taskType, memoryRefs, graphRefs, recentSignals, expiry, policyVersion, createdAt.

## Design rule

No memory record stores an unbounded copy of the source object. Large source content remains in the owning product.
