# Quant Memory Policy Engine

## Decision pipeline

REQUEST → PURPOSE → SCOPE → SOURCE AUTHORIZATION → SENSITIVITY → RETENTION → USER CONTROLS → AGENT CAPABILITY → ALLOW/DENY/REDACT/EPHEMERAL.

## Policy dimensions

- who is requesting
- which product is requesting
- why context is required
- memory sensitivity
- source permissions
- user personalization setting
- organizational policy
- legal/retention state
- agent capability
- requested operation

## Important rule

A memory match never grants permission to its source. Authorization is evaluated independently.

## Outcomes

ALLOW, ALLOW_REDACTED, EPHEMERAL_ONLY, DENY, REQUIRE_APPROVAL.

## Audit

Policy decisions are auditable with policy version and reason category, without storing unnecessary private content.
