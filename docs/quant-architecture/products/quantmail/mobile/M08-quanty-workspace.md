# QuantMail Flutter — M08 Quanty Workspace

## Structure

QuantyWorkspaceScreen
- task header
- request
- plan
- execution timeline
- approval action
- result
- verification
- memory choice

## Mobile safety

Approval action must be:
- explicit
- visually prominent
- target-specific

Never use ambiguous swipe-to-approve for consequential actions.

## Connectivity

On reconnect:
- fetch persisted session state
- reconcile any in-flight step
- never duplicate an already accepted mutation

## Accessibility

All tool state and approval changes are announced semantically.
