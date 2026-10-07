# QuantChat C10 — Quanty Deep Screen Architecture

**Status:** Target-state architecture / execution contract  
**Scope:** C10 Quanty inside QuantChat  
**Product law:** Quanty is an operating layer, not a chat sidebar. It can understand and orchestrate authorized Quant resources, but it never becomes their source of truth.

## 0. C10 thesis

Quanty inside QuantChat is the user's governed AI control surface for communication, meetings, communities and ecosystem actions.

Core pipeline:

intent -> context assembly -> policy -> planner -> typed tools -> approval -> execution -> observation -> verification -> response -> optional memory/audit.

Quanty must feel native to every QuantChat surface while remaining one shared AI runtime. The UI changes by context; the security and capability model does not.

Primary modes:
1. Personal
2. Conversation
3. Meeting
4. Community Moderator
5. Automation

---

# 1. C10 screen inventory

| Screen | Purpose |
|---|---|
| C10.1 Quanty Home | AI workspace, recent tasks, capabilities and entry |
| C10.2 Composer | prompt/task input with context controls |
| C10.3 Context Picker | select authorized resources and scope |
| C10.4 Conversation Quanty | assistant inside a chat |
| C10.5 Meeting Quanty | live meeting copilot |
| C10.6 Community Quanty | moderation/community assistance |
| C10.7 Plan Preview | inspect proposed multi-step plan |
| C10.8 Approval Center | approve/deny sensitive actions |
| C10.9 Live Run | execution timeline and tool activity |
| C10.10 Tool Detail | capability, permission, inputs, outputs |
| C10.11 Verification | post-action business verification |
| C10.12 Result / Evidence | answer, citations, resource refs, provenance |
| C10.13 Memory Review | inspect proposed durable memory |
| C10.14 Automation Builder | create governed recurring/conditional automation |
| C10.15 Automation Run | monitor automation execution |
| C10.16 Agent / Mode Settings | permissions, model and behavior controls |
| C10.17 Quanty Safety / Privacy | AI context, retention and data controls |
| C10.18 Failure / Recovery | recover paused, failed or partially completed runs |

---

# 2. C10.1 Quanty Home

## Mobile
- Full-screen AI workspace inside QuantChat.
- Top shows current mode and active scope.
- Main composer dominates.
- Recent runs appear as compact cards.
- Suggested actions are derived from current authorized context, never fabricated.
- Quick modes: Ask, Find, Summarize, Plan, Act.

## Web/Tauri
- Three-column workspace:
  left: modes/history
  center: conversation/run
  right: context + tools + evidence.
- Tauri can expose native desktop shortcuts.
- Web supports keyboard command palette.

## Muse placement
Muse is the visible conversational identity of Quanty in product surfaces, but the runtime remains the shared Quanty platform.
- Muse avatar/animation can appear in the header and live execution timeline.
- Muse must communicate state: thinking, waiting for approval, executing, verifying, completed, failed.
- It must never visually imply that an action succeeded before verification.

---

# 3. C10.2 Composer

Composer supports:
- natural language
- structured commands
- attachments
- resource references
- voice input where available
- image/media context
- model/mode selection
- action vs answer distinction

Composer shows context scope before execution:
"Chat only", "This meeting", "Selected files", "Ecosystem".

No hidden broad-account context.

High-impact request examples:
- "Draft a reply" -> draft only.
- "Send this to Rahul" -> side effect; approval required.
- "Find all action items from today's meetings" -> read/search.
- "Schedule a follow-up" -> Calendar side effect; confirmation required.

---

# 4. C10.3 Context Picker

Context is represented by typed QuantResourceRef and QuantContextEnvelope.

Context chip displays:
- resource title
- owning product
- access scope
- freshness where meaningful
- expiry
- remove control

Context modes:
- current conversation
- selected messages
- meeting
- community
- selected ecosystem resources
- temporary task context

Context expiry is explicit. A resource used once must not silently become permanent memory.

---

# 5. C10.4 Conversation Quanty

Quanty can appear:
- as a dedicated side panel
- as an inline assistant sheet
- as a message-level action
- as a composer mode

Capabilities:
- summarize thread
- translate
- rewrite draft
- find referenced resource
- extract tasks
- answer questions using authorized conversation context
- draft response
- start call/Meet
- create resource handoff

Quanty must distinguish:
- generated draft
- executed action
- source message
- derived conclusion.

For E2EE conversations, Quanty access follows the final governed E2EE architecture and explicit user/device authorization. Server-side plaintext access is never assumed.

---

# 6. C10.5 Meeting Quanty

Meeting mode connects to C08.

Live capabilities:
- meeting Q&A
- action capture
- decision extraction
- agenda tracking
- translation
- participant assistance
- controlled moderation suggestions
- post-meeting recap preparation

Media access is capability-scoped.

Quanty cannot silently:
- start recording
- activate microphone/camera
- invite participants
- change roles
- send messages
- create calendar events.

Every action is visible as a proposed or executing operation.

---

# 7. C10.6 Community Quanty

Moderator mode is separate from personal assistance.

Capabilities:
- summarize reports
- classify moderation queues
- identify likely spam patterns
- draft moderation response
- explain policy matches
- propose role/channel changes

High-impact moderation operations require human authorization according to capability risk.

Quanty should never silently ban/remove users.

All moderation decisions require audit provenance.

---

# 8. C10.7 Plan Preview

For multi-step requests, Quanty renders an executable plan.

Example:

"Arrange a product review meeting and tell everyone."

Plan:
1. Find available calendar slots.
2. Draft meeting details.
3. Create Calendar event.
4. Prepare Chat invitation.
5. Send invitation after approval.

Each step displays:
- tool
- source/target resource
- risk tier
- expected side effect
- estimated cost if applicable
- dependency
- reversibility
- approval state.

User can edit/remove/reorder safe plan steps where supported.

---

# 9. C10.8 Approval Center

Approval card must be impossible to mistake for ordinary chat.

Displays:
- action name
- actor
- exact target
- exact data to be sent
- tool
- risk tier
- side effect
- reversibility
- expiry
- approve/deny

Risk model:
- Tier 0: read-only
- Tier 1: draft-only
- Tier 2: low-risk reversible
- Tier 3: external side effect
- Tier 4: admin/destructive/financial

Tier 3+ confirmation by default.
Tier 4 additionally requires step-up authentication.

No "approve all future actions" shortcut for high-risk operations.

---

# 10. C10.9 Live Run

Execution timeline:

received
-> context locked
-> planning
-> awaiting approval
-> executing
-> observing
-> verifying
-> completed / failed / paused / cancelled.

Each tool call displays:
- tool name
- status
- duration
- safe summary of input
- output reference
- retry state

Secrets, tokens and private credentials never appear in the UI.

For long-running work:
- progress
- current step
- next dependency
- pause/cancel
- background execution state.

---

# 11. C10.10 Tool Detail

Tool detail is a trust surface.

Shows:
- stable tool name/version
- description
- permission scope
- risk tier
- input schema summary
- output schema
- estimated cost
- timeout
- idempotency
- undo metadata
- owning service
- audit behavior

Users should understand what Quanty is allowed to do before granting access.

---

# 12. C10.11 Verification

Quanty must never equate HTTP success with business success.

Verification screen shows:
- requested operation
- execution result
- observed source-of-truth state
- discrepancies
- retry/repair path

Example:
"Calendar request accepted" is not enough.
Quanty must verify that the event exists with the requested time/participants before reporting success.

If verification fails:
- status becomes uncertain
- no false success message
- user gets recovery options.

---

# 13. C10.12 Result / Evidence

Every substantive answer should expose evidence proportional to the task.

Result can contain:
- answer
- source snippets
- resource refs
- timestamps
- provenance
- confidence/ambiguity
- actions
- generated artifacts

Generated text must be distinguishable from source content.

Cross-app references use typed resource cards.

---

# 14. C10.13 Memory Review

Memory is not an automatic transcript dump.

Layers remain separate:
- source-of-truth data
- short-term context
- durable user memory
- knowledge graph
- embeddings

When Quanty proposes durable memory:
- show exact proposed memory
- source/provenance
- why it may be useful
- retention behavior
- sensitivity classification
- accept/reject where policy requires

Derived emotional or sensitive inference must not silently become durable personal truth.

Temporary context expires according to its envelope.

---

# 15. C10.14 Automation Builder

Automation is a governed recurring/conditional Quanty run.

UI:
- trigger
- schedule/condition
- scope
- task
- tools
- risk level
- notification policy
- stop condition
- execution budget
- approval policy

Examples:
- summarize a channel every morning
- check a project and draft updates
- notify when a meeting action becomes overdue

Automation cannot silently escalate permissions because it runs repeatedly.

High-risk actions require explicit policy and approval semantics.

---

# 16. C10.15 Automation Run

Shows:
- last run
- next run
- trigger
- plan
- tools
- outcome
- verification
- failures
- resource usage
- pause/resume
- disable

Repeated failures should stop or degrade according to policy rather than retry forever.

---

# 17. C10.16 Agent / Mode Settings

Settings:
- default model
- model routing policy
- response style
- voice
- tool permissions
- approval defaults
- context defaults
- memory policy
- automation limits
- budget limits
- notification behavior

Model gateway remains provider-neutral:
reasoning, coding, vision, audio, embeddings, image, video, speech and local/on-device models.

Routing considers:
quality, latency, cost, context, modality, availability and policy.

---

# 18. C10.17 Quanty Safety / Privacy

Controls:
- which Chat contexts Quanty can access
- meeting media permissions
- community moderation access
- ecosystem app scopes
- memory permissions
- automation permissions
- retention
- telemetry/privacy
- connected tool revocation

Revocation must invalidate future tool grants and active sessions where policy requires.

Broad account bearer tokens are prohibited as a capability shortcut.

---

# 19. C10.18 Failure / Recovery

Run states:
draft -> approved -> executing -> verifying -> completed/failed/paused/cancelled.

Recovery states:
- retry safe step
- resume from checkpoint
- undo reversible operation
- request approval
- repair inconsistent state
- cancel remaining steps

Partial execution must be visible.

Example:
Calendar event created but Chat invitation failed:
- report Calendar success
- report Chat failure
- do not claim whole plan completed
- offer retry of only the failed step.

---

# 20. Quanty architecture

Core objects:
- Agent
- AgentVersion
- Goal
- Plan
- PlanStep
- Tool
- ToolGrant
- Approval
- Run
- RunStep
- Budget
- MemoryReference
- AuditRecord

Core services:
- model gateway
- agent runtime
- context assembler
- policy engine
- tool registry
- approval service
- execution orchestrator
- verification service
- memory gateway
- audit service
- evaluation service
- budget/cost service

Quanty is provider-neutral. Model selection is a runtime decision, not a UI hard-code.

---

# 21. Capability and tool contract

Every tool has:
- stable name
- version
- JSON schema
- permission scope
- risk tier
- estimated cost
- timeout
- idempotency key semantics
- undo metadata
- owning domain
- audit requirements.

Tools are discovered through the capability registry, not arbitrary client-generated endpoints.

Tool execution must re-check authorization server-side immediately before side effects.

---

# 22. Context architecture

Context envelope contains:
- actor
- task
- authorized resource refs
- policy
- provenance
- expiry
- sensitivity
- correlation id
- requested capability

Context assembler must enforce minimum useful context.

Quanty must not automatically retrieve everything the user could theoretically access.

Prompt injection from messages/files/web content is treated as untrusted data, never as a policy instruction.

---

# 23. Event and observability model

Events:
quanty.run.created
quanty.run.started
quanty.plan.created
quanty.approval.requested
quanty.approval.resolved
quanty.tool.started
quanty.tool.completed
quanty.tool.failed
quanty.verification.completed
quanty.run.completed
quanty.run.failed
quanty.memory.proposed
quanty.memory.accepted
quanty.memory.rejected

Every run carries:
- correlation ID
- actor
- model/provider
- agent version
- tool versions
- policy decision
- latency
- cost metadata
- verification status.

Do not put secrets or raw sensitive prompts into telemetry by default.

---

# 24. Cross-app behavior

Quanty can orchestrate:

QuantMail:
- draft/send email after approval.

QuantCalendar:
- find availability/create/update events after approval.

QuantDrive:
- search/read authorized files
- create derived artifacts
- save recap/transcript where policy allows.

QuantGit:
- inspect authorized repo/issue/PR
- draft changes
- execute approved engineering actions through proper capabilities.

QuantChat:
- send message
- start call/Meet
- summarize conversation
- create resource cards.

QuantGram/QuantWave/QuantMax/QuantCooks/QuanTube/QuantAds:
- only through registered capabilities and source-specific permissions.

Quanty does not bypass each app's authorization.

---

# 25. UI state language

Muse's visible state vocabulary must be consistent:

- Ready
- Understanding
- Gathering context
- Planning
- Waiting for approval
- Executing
- Verifying
- Completed
- Needs attention
- Paused
- Failed
- Cancelled

Never use "Done" before verification.

For uncertain results:
"Action may have completed. Verification could not confirm it."

---

# 26. Mobile / Web / Tauri / Capacitor

Mobile/Capacitor:
- composer-first
- bottom sheets for context/tools
- compact execution timeline
- approval cards occupy full-width sheets
- voice interaction available where platform permits

Web:
- persistent context rail
- keyboard shortcuts
- split plan/evidence view
- expandable tool execution

Tauri:
- desktop side panel
- global shortcut
- native notifications
- optional local/on-device models when policy permits

All platforms share:
- same context envelope
- same capability registry
- same approval semantics
- same run state model
- same resource references.

---

# 27. Accessibility

- keyboard access to every action
- screen-reader announcements for run state changes
- focus management for approvals
- action risk communicated as text, not color alone
- captions/transcripts for voice interactions
- reduced motion
- high contrast
- touch-friendly controls
- readable tool/evidence cards
- error recovery described in actionable language.

---

# 28. Safety and security invariants

1. No broad account token as a tool grant.
2. Server re-authorizes every consequential tool call.
3. Tier 3+ actions require confirmation by default.
4. Tier 4 requires step-up authentication.
5. Prompt injection cannot change policy.
6. Secrets never enter model context unless explicitly required and policy-approved.
7. Memory writes require provenance and policy.
8. Quanty never fabricates execution success.
9. Cross-app access uses typed capabilities/resources.
10. Audit records are append-only.
11. User revocation propagates.
12. Destructive actions require stronger confirmation and verification.

---

# 29. Performance and cost

Measure:
- time to first token
- time to plan
- tool latency
- total run latency
- model token usage
- tool cost
- context assembly latency
- verification latency
- failure/retry rate

Routing may choose a cheaper/faster model when task complexity allows, but quality/policy constraints override cost.

Long tasks move to background execution instead of blocking the UI.

---

# 30. Test matrix

Unit:
- context assembly
- policy evaluation
- risk tiers
- plan validation
- tool schemas
- approval rules
- verification
- memory provenance

Integration:
- QuantChat -> Quanty -> Calendar
- QuantChat -> Quanty -> Drive
- QuantChat -> Quanty -> Mail
- QuantChat -> Quanty -> Git
- QuantMeet -> Quanty -> recap
- automation -> tool -> verification

Security:
- privilege escalation
- forged tool grant
- expired grant
- prompt injection
- cross-tenant access
- unauthorized memory write
- secret leakage
- approval bypass
- replay/idempotency attacks

Reliability:
- duplicate tool event
- tool timeout
- provider outage
- partial plan failure
- verification mismatch
- reconnect/resume

Accessibility:
- keyboard
- screen reader
- reduced motion
- high contrast
- mobile touch

E2E:
- ask -> answer
- ask -> resource evidence
- draft -> approval -> execute -> verify
- multi-step plan -> partial failure -> recovery
- memory proposal -> review -> persist
- automation -> run -> notify.

---

# 31. Muse implementation sequence

C10-A: Quanty domain objects + capability/tool registry.
C10-B: context envelope + policy boundary.
C10-C: Quanty Home + Composer.
C10-D: context picker + evidence/result cards.
C10-E: plan preview + approval center.
C10-F: live execution + verification.
C10-G: conversation + meeting + community modes.
C10-H: memory review.
C10-I: automation builder/run.
C10-J: model routing/settings.
C10-K: safety/privacy/security hardening.
C10-L: accessibility/performance/evaluation.

Muse must inspect existing QuantAI/QuantChat code before each slice, reuse shared contracts, never invent provider/tool claims, add tests, run affected validation, inspect runtime behavior and document evidence.

---

# 32. C10 definition of done

C10 is complete only when:
- all Quanty surfaces have responsive UI contracts
- context is minimum-useful and explicitly scoped
- tools are typed/capability-based
- risk tiers are enforced server-side
- approvals are explicit
- execution is observable
- business outcomes are verified
- partial failures are honest
- memory is governed
- automation cannot escalate privilege
- cross-app actions preserve ownership boundaries
- prompt injection is treated as untrusted input
- mobile/Web/Tauri/Capacitor share one runtime contract
- performance/cost are measured
- evaluation and audit exist
- no fake AI success/data is used.

## C10 architectural invariant

**Quanty is the governed intelligence and action layer of QuantChat: it can reason across authorized resources and coordinate the ecosystem, but every capability, context, side effect, memory write and reported success remains policy-bound, auditable and verifiable.**
