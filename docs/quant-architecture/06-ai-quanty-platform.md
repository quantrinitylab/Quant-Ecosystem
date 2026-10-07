# 06 — Quanty Platform

Quanty is an operating layer, not a chat sidebar.

Pipeline:
intent → context assembly → planner → policy/safety → typed tools → approval → execution → observation → verification → memory/audit.

## Model gateway
Provider-neutral support for reasoning, coding, vision, audio, embeddings, image, video, speech and local/on-device models. Routing considers capability, quality, latency, cost, context, modality, availability and policy.

## Agent runtime
Core objects: Agent, AgentVersion, Goal, Plan, PlanStep, Tool, ToolGrant, Approval, Run, RunStep, Budget, MemoryReference and AuditRecord.

States: draft → approved → executing → verifying → completed/failed/paused/cancelled.

## Tool contract
Stable name, version, schema, permission scope, action tier, estimated cost, timeout, idempotency and undo metadata.

Risk tiers: 0 read-only; 1 draft-only; 2 low-risk reversible; 3 external side effect; 4 admin/destructive/financial. Tier 3+ requires confirmation by default; tier 4 additionally requires step-up authentication.

## Memory
Keep source-of-truth data, short-term context, durable user memory, knowledge graph and embeddings as distinct layers. Memory writes require provenance and policy.

## Verification
Quanty must verify side effects before reporting success. HTTP success is not proof of business success.

## Admin
QuantAI admin owns provider health, routing, budgets, agent versions, tool permissions, safety policies, evaluation, latency, cost and abuse.