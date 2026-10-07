# M09 — Notifications & Attention Center

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Purpose

Notifications are an attention system, not an event dump.

M09 converts product events into user-visible attention items while preserving product ownership of canonical state.

## Sources

- Mail: new message, reply-needed, delivery/security signal
- Calendar: upcoming event, changed event, attendee response
- Drive: share, comment, access request
- QuantGit: review/request/CI signal
- Quanty: verified task completion, approval request, blocked task
- Security: account/security event

## Attention item

Required:
- attentionId
- sourceProduct
- sourceType
- sourceObjectId
- category
- priority
- title
- concise body
- route
- createdAt
- readAt
- resolvedAt
- dedupeKey

Optional:
- actor
- deadline
- action
- relatedObjectRefs
- Quanty explanation
- security severity

## Priority

P0: immediate/security-critical
P1: action needed soon
P2: useful awareness
P3: low-value informational

Priority is computed from source severity, deadline, user context, recurrence and policy. Products remain authoritative for business severity.

## Center modes

- All
- Needs You
- Today
- Security
- Completed

No mode silently hides P0 security events.

## UX

Desktop:
- global attention entry
- grouped attention list
- filter/search
- contextual detail rail
- bulk read/archive only where safe

Mobile:
- attention inbox
- swipe for read/dismiss only
- source deep-link
- action sheet for consequential actions

Do not make destructive actions one-swipe gestures.

## Empty/loading/error

Every state has designed UI and retry behavior.

## Evidence

- notification ingestion
- deduplication
- priority ranking
- cross-product grouping
- deep links
- realtime update
- offline/reconnect
- security event visibility
- accessibility
