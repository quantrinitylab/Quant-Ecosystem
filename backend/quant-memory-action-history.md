# M41 — Agent Action Memory

Action memory records what Quanty agents did, not just what they knew.

Fields:
actionId, agentId, userId, intentId, sourceContextRefs, plannedOperations, approvalRef, riskClass, commandRefs, executionState, verificationState, resultSummary, failureReason, rollbackRef, createdAt, completedAt.

States:
PLANNED → APPROVAL_REQUIRED → APPROVED → EXECUTING → VERIFYING → VERIFIED
with FAILED, PARTIAL, CANCELLED and EXPIRED terminal branches.

Action memory is useful for continuity (“what did we already do?”) and duplicate-action prevention. It is not permission inheritance.
