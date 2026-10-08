# 24 — Quanty Live Agent Runtime

Status: Architecture V1.

## 1. Product law
Quanty is the persistent intelligence and action layer across the nine Quant products. The user experiences one Quanty identity; internally Quanty uses an orchestrator, specialist agents, governed tools, shared context, task state and platform-native execution adapters.

Quanty is not a chatbot embedded in each app. It is a cross-product runtime that can converse, clarify, plan, execute, observe, verify, remember and navigate while preserving one user-visible session.

## 2. User experience
Every Quant product exposes the same Quanty entry point with product-aware context. Tapping Quanty opens two primary modes: Chat and Voice Agent.

Chat mode is a persistent conversation surface. Voice Agent is a live execution surface with a compact premium capsule near the device camera/island on supported mobile layouts and an equivalent floating/embedded surface on web, Tauri and desktop.

Voice states: idle, wake, listening, transcribing, thinking, speaking, asking, confirming, executing, waiting, verifying, completed, failed, paused and muted.

The live capsule shows Quanty identity/avatar, listening/speaking state, concise current action and an accessible transcript. It can expand into a full live-agent sheet showing plan steps, current app, pending confirmation and recent actions.

## 3. Runtime pipeline
User speech/text → session router → streaming ASR/text normalization → intent/context extraction → ambiguity detector → planner → policy/capability check → clarification or approval → typed tool command → product command bus → UI/resource projection → observation → business verification → user response → memory/audit projection.

No agent may report success solely because an HTTP request returned 2xx. Business state must be observed or an authoritative event must confirm completion.

## 4. Agent topology
Quanty Orchestrator owns user intent decomposition and task coordination. Specialist agents own product expertise: Mail, Chat, Meet, AI/Research, Gram, Wave, Max, Cooks, Tube, Ads and Git. Agents do not bypass product boundaries. They invoke typed capabilities exposed by the owning product.

The same specialist may participate in a multi-product plan. The orchestrator maintains dependency edges, cancellation semantics, compensation/undo metadata and progress.

## 5. Tool governance
Every tool declares name/version, owner product, input/output schema, required capability, resource scope, risk tier, approval rule, timeout, retry policy, idempotency key, verification strategy, audit policy and optional undo/compensation action.

Risk 0: read-only. Risk 1: draft/local preparation. Risk 2: reversible low-impact mutation. Risk 3: external side effect. Risk 4: destructive, administrative or financial. Confirmation is default for risk 3; risk 4 additionally requires step-up authentication where policy requires it.

Agents receive only the minimum tool grants required for the current task. No universal unrestricted tool token exists.

## 6. Clarification engine
Quanty must ask a focused question whenever required entities, destination, scope, timing, permissions or user intent remain materially ambiguous. It should prefer one compact question that resolves the largest uncertainty.

Example: “Rahul ko email bhejo” with two matching contacts → “Rahul Kumar ya Rahul Sharma?”

Clarification becomes a first-class PlanStep, not an error. The plan pauses while preserving all prior context and resumes after the answer.

## 7. Confirmation engine
Confirmation is risk- and confidence-aware. Quanty does not ask confirmation for harmless navigation or drafts merely because an action exists. It does ask before external side effects when policy requires it.

Confirmation UI must state target, action and important irreversible consequence in plain language. Voice confirmation is accepted only after the command is restated when ambiguity or speech-recognition risk is material.

## 8. Continuous voice session
After an explicit wake/tap, Quanty enters a bounded live session. Streaming VAD and ASR maintain turn detection; barge-in interrupts speech playback; silence and inactivity policies end the session. The user can say “stop listening”, mute the microphone or close the capsule at any time.

The wake phrase is not the sole safety boundary. Sensitive actions still pass through authorization and confirmation. The system visibly indicates microphone/listening state.

## 9. Multi-task runtime
A TaskGraph contains goals, dependencies, foreground task, background tasks, status, progress, deadlines, cancellation and provenance. Example: send an email while opening a QuantMax game. Mail execution can continue as a background node while Max becomes the foreground surface.

Background tasks never silently acquire new privileges. If a task becomes blocked on confirmation or authentication, Quanty surfaces the exact pending decision.

## 10. Observation and verification
Quanty observes product events and authoritative resource state. Verification adapters can check message delivery state, meeting creation, build status, game-room readiness, upload processing, publishing state or payment settlement. Unknown outcome is a first-class state; Quanty must never convert uncertainty into success.

## 11. Memory boundary
Quanty uses QuantDrive as governed personal context, not as a replacement for product source-of-truth data. Context requests are purpose-bound and minimum-useful-context filtered. E2EE content remains protected by the owning product's cryptographic boundary.

Memory candidates require provenance, confidence, retention class and policy evaluation. Personalization uses explicit preferences, durable memories, episodic context and derived signals; it does not silently mutate foundation-model weights per user.

## 12. Security
Every action carries actor, tenant, session, capability, resource reference, risk tier, trace and idempotency metadata. Prompt injection in user content is treated as untrusted data. A message, webpage, file or game asset cannot grant Quanty a new capability.

## 13. Failure model
If an agent fails, the task graph preserves completed nodes and marks dependent nodes blocked. Retry is bounded and idempotent. If a product is unavailable, Quanty can explain the dependency and keep unrelated tasks running. UI navigation failure never implies business-action failure.

## 14. Observability
Trace spans cover speech turn, planning, tool invocation, product command, event confirmation and verification. Metrics include time-to-first-response, clarification rate, confirmation rate, tool success, verification latency, unknown outcomes, cancellation, model latency/cost and cross-app handoff failures.

## 15. Implementation sequence
QY-01 runtime/session model; QY-02 agent registry; QY-03 typed tool registry; QY-04 capability/approval policy; QY-05 clarification engine; QY-06 task graph; QY-07 observation/verification; QY-08 memory gateway; QY-09 live voice runtime; QY-10 UI shell; QY-11 cross-app navigation; QY-12 background execution; QY-13 platform adapters; QY-14 audit/telemetry; QY-15 chaos/security/evaluation.

## Invariant
One user-facing Quanty session may orchestrate many specialist agents and products, but every mutation remains owned, authorized, observable and verifiable by the product that owns the resource.
