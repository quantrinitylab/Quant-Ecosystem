# M21 — Quanty Privacy Boundary

## Default
Quanty receives only the minimum context needed for the requested task.

## Context classes
- public/product metadata
- user-private content
- sensitive content
- security-protected content
- cross-domain derived context

Each class has explicit tool and model-access rules.

## Memory
Seeing content does not create durable memory. Memory creation follows declared policy and user controls.

## Tool use
Quanty cannot use privacy access as a substitute for authorization. A model instruction cannot expand its data scope.

## Logging
Prompts, tool arguments, outputs, and traces are minimized/redacted according to sensitivity. Raw private content is not logged by default.
