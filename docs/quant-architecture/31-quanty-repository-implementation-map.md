# 31 — Quanty Repository Implementation Map

Status: Architecture V1 implementation contract.

## Repository rule
Quanty is a platform capability, not a product-specific folder. Shared runtime contracts live under packages; durable orchestration and policy live under services; product commands remain in their owning products.

## Target tree

\`\`\`
packages/
  quanty-contracts/
    src/{ids,session,task,agent,tool,approval,navigation,context,events,errors,index}.ts
  quanty-client/
    src/{provider,session,voice,chat,capsule,task-ui,navigation,accessibility}.ts
  quanty-platform/
    src/{capabilities,adapters,permissions,lifecycle,index}.ts
  quanty-memory/
    src/{types,provenance,policy,retrieval,feedback,index}.ts
  quanty-observability/
    src/{trace,metrics,redaction,index}.ts

services/
  quanty-orchestrator/
    src/{session,planner,scheduler,clarification,approval,verification,context,agents,tools,workers}.ts
  quanty-voice/
    src/{audio-session,vad,asr,dialogue,barge-in,tts,turns}.ts
  quanty-navigation/
    src/{registry,router,handoff,stack}.ts
  quanty-memory-gateway/
    src/{retrieval,policy,provenance,write,feedback}.ts
  quanty-task-worker/
    src/{scheduler,executors,recovery,verification}.ts

apps/
  quanty-shell/
    web/
    flutter/
    desktop/

products/*/
  quanty/
    manifest.ts
    tools/
    navigation/
    context/
\`\`\`

## Ownership
packages own stable types and client primitives. Services own server-side orchestration and security boundaries. Product folders own domain commands and UI. Quanty never directly writes another product's database.

## Migration rule
Create packages/services only when the first implementation contract and test exist. Do not mass-create empty directories.

## Dependency direction
Clients → typed contracts → Quanty services → product APIs/events. Product domains never depend on Quanty internals to remain correct; Quanty is an optional orchestration client of those domains.

## Implementation waves
R1 contracts; R2 session/task state; R3 tool registry; R4 agent registry; R5 clarification/approval; R6 navigation/handoff; R7 voice; R8 memory gateway; R9 background workers; R10 platform adapters; R11 UI surfaces; R12 conformance/evaluation.
