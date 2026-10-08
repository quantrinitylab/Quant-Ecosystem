# 32 — Quanty Contracts: Session, Task, Tool, Agent, Navigation

## Canonical contract law
All Quanty mutations are commands. Events describe completed facts. Queries read authoritative state. UI state is projection, never source of truth.

## Session
\`QuantySession\`: session_id, user_id, tenant_id, mode, platform, active_product, active_route, status, started_at, last_activity_at, voice_state, current_task_id, context_scope, version.

Modes: chat, voice, hybrid. Status: active, paused, ending, ended.

## Task
\`QuantyTask\`: task_id, session_id, goal, status, priority, foreground_node_id, created_at, updated_at, deadline_at, cancellation_requested_at, verification_state.

\`QuantyTaskNode\`: node_id, task_id, kind, status, depends_on, capability, resource_refs, input_ref, output_ref, risk_tier, approval_id, idempotency_key, verification_ref, retry_policy, compensation_ref.

Node kinds: read, draft, navigate, mutate, wait_for_user, wait_for_event, background_job, verify, compensate.

## Agent
\`QuantyAgentDescriptor\`: agent_id, product_scope, version, capabilities, supported_modalities, tool_refs, model_policy, timeout_policy, evaluation_version, enabled.

## Tool
\`QuantyToolDescriptor\`: tool_id, owner_product, version, input_schema, output_schema, capability, resource_scope, risk_tier, confirmation_policy, timeout_ms, retry_policy, idempotency_policy, verification_strategy, audit_policy, compensation_ref.

## Approval
\`QuantyApprovalRequest\`: approval_id, task_id, node_id, action_summary, target_summary, consequence_summary, risk_tier, expires_at, confirmation_channels, status.

## Navigation
\`QuantyNavigationRequest\`: navigation_id, session_id, task_id, source_product, target_product, destination, resource_refs, requested_action, context_scope, capability_ref, expires_at, trace_id.

## Context
\`QuantyContextRequest\`: purpose, requester_agent, resource_refs, requested_fields, sensitivity_class, max_age_ms, output_scope.

The gateway returns only minimum-useful context plus provenance and freshness.

## Common command metadata
command_id, actor, tenant_id, session_id, task_id, capability, idempotency_key, expected_version, risk_tier, trace_id, created_at.

## Common events
quanty.session.started.v1
quanty.session.updated.v1
quanty.task.created.v1
quanty.task.node.completed.v1
quanty.task.node.failed.v1
quanty.approval.requested.v1
quanty.approval.resolved.v1
quanty.navigation.requested.v1
quanty.navigation.completed.v1
quanty.verification.completed.v1
quanty.memory.candidate.created.v1
quanty.feedback.recorded.v1

## Errors
QUANTY_SESSION_EXPIRED, QUANTY_CAPABILITY_DENIED, QUANTY_APPROVAL_REQUIRED, QUANTY_AMBIGUOUS_INPUT, QUANTY_PLATFORM_UNSUPPORTED, QUANTY_NAVIGATION_FAILED, QUANTY_UNKNOWN_OUTCOME, QUANTY_CONTEXT_DENIED, QUANTY_TOOL_UNAVAILABLE, QUANTY_VERSION_CONFLICT.

## Versioning
All public schemas are versioned. Breaking changes create v2 contracts and a compatibility window.
