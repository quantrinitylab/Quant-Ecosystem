# M36 — Quanty UX Intelligence Contract

Quanty is a workspace intelligence layer, not the navigation system.

## Placement

Global launcher: available everywhere.
Contextual suggestions: attached to the current object/workflow.
Focused workspace: opens when the user explicitly asks for broader assistance.

## Context

Quanty receives only the minimum authorized context required for the requested task. Context labels must distinguish canonical source facts, derived signals, and model-generated suggestions.

## Action UX

Read-only assistance can execute within normal authorization. External mutations show the action, risk, affected objects, and required approval before execution. High-risk actions use explicit approval cards.

## Verification

After an action, Quanty reports verified outcome, partial outcome, failure, or pending reconciliation. It never represents a timeout as success.

## Anti-intrusion rules

No unsolicited full-screen takeover, no invisible rewriting, no fabricated facts, no hidden cross-product access, and no bypass of product permissions.
