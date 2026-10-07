# M08 — Quanty Mail Workspace

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Purpose

Quanty Workspace is the agentic control surface inside QuantMail.

It is not a generic chatbot. It coordinates:
intent -> context -> plan -> policy -> tools -> approval -> execution -> verification -> response -> memory decision.

## User outcome

A user can ask Quanty to understand mail and perform safe multi-step work while retaining control over consequential actions.

Examples:
- summarize this thread
- find messages needing replies
- draft replies to the three urgent threads
- find the invoice and save it to Drive
- identify meetings related to this conversation
- prepare a response but do not send

## Workspace regions

Desktop:
- conversation/task header
- user request
- context chips
- plan/steps
- tool activity
- approval cards
- result
- verification
- memory controls

Mobile:
- task header
- request
- compact plan
- tool progress
- approval sheet
- result
- follow-up

## Agent states

IDLE
UNDERSTANDING
GATHERING_CONTEXT
PLANNING
WAITING_FOR_APPROVAL
EXECUTING
VERIFYING
COMPLETED
PARTIAL
FAILED
CANCELLED

The UI must never show "completed" merely because the model produced a response.

## Plan display

For multi-step work show:
1. goal
2. planned actions
3. affected resources
4. risk/approval requirements
5. current step

Do not expose hidden chain-of-thought. Show concise action summaries and evidence/results instead.

## Tool activity

Each tool step shows:
- tool name
- purpose
- target resource class
- state
- result summary
- retry/cancel when supported

Never expose credentials or internal secrets.

## Approval

Approval card must identify:
- exact action
- target
- affected recipients/resources
- irreversible/reversible status
- expected consequence

Approve/deny is explicit.

## Verification

After execution:
- verify target state
- show evidence
- distinguish successful, partial and failed work
- offer retry/recovery where safe

## Memory

After completion, Quanty may propose:
- no memory
- session memory
- user-approved durable memory

Sensitive content is never persisted merely because it appeared in a thread.

## Evidence

- read-only task
- multi-step task
- approval-required action
- denied action
- tool failure
- partial completion
- verification mismatch
- cancellation
- memory decision
