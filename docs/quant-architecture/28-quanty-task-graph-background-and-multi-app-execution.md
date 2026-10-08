# 28 — Quanty Task Graph, Background Work and Multi-App Execution

## Task model
A Quanty Task has task_id, session_id, goal, priority, foreground node, nodes, dependencies, capability grants, confirmations, deadlines, progress, cancellation, provenance and verification state.

## Node types
Read, draft, navigate, mutate, wait-for-user, wait-for-event, background-job, verify and compensate. Nodes are idempotent where possible and never gain capabilities implicitly from another node.

## Example
“Email Rahul and start a QuantMax game.”

Node A: resolve Rahul.
Node B: create email draft.
Node C: request send confirmation.
Node D: send email.
Node E: verify send.
Node F: resolve game.
Node G: create/start game session.
Node H: navigate foreground to game.

D/E may execute independently from F/G once their dependencies are satisfied. Quanty reports partial completion accurately.

## Background execution
Backend jobs handle durable work that should continue after app suspension. Mobile clients receive status through push/realtime sync. Background work is bounded by capability, expiry, battery/platform policy and user-visible status requirements.

## Cancellation
Cancelling a parent task propagates cancellation to cancellable children. Already-completed side effects are not magically undone; compensation is used only when the product exposes a safe undo operation.

## Unknown outcomes
Timeout after a mutation creates unknown_outcome, not failure. The verification adapter queries authoritative state before retrying to avoid duplicates.

## User controls
Task center shows active, waiting, completed, failed and paused work. Each task exposes stop, retry where safe, view details and return-to-context actions.

## Implementation
TASK-01 schema; TASK-02 durable state; TASK-03 planner compiler; TASK-04 dependency scheduler; TASK-05 background workers; TASK-06 mobile push/recovery; TASK-07 cancellation; TASK-08 unknown-outcome verification; TASK-09 task UI; TASK-10 chaos tests.
