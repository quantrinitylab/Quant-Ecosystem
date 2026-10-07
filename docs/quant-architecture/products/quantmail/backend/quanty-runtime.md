# QuantMail Backend — Quanty Runtime

## Runtime boundary

QuantMail supplies mail capabilities to the shared Quanty agent runtime.

Quanty runtime owns:
- agent session
- plan
- tool invocation
- policy evaluation
- approval state
- execution trace
- verification state

Mail owns:
- mail data
- mail domain commands
- mail authorization checks
- mail events

## Execution lifecycle

1. authenticate user
2. classify request
3. resolve allowed context
4. create plan
5. evaluate tool risk
6. request approval when required
7. execute typed tools
8. verify results
9. generate user response
10. evaluate memory policy

## Tool contract

Every tool declares:
- toolId
- version
- input schema
- output schema
- required capabilities
- risk class
- side effects
- idempotency behavior
- verification method

Mail tools must fail closed on missing authorization.

## Identity

Agent identity is derived from the user session plus a scoped agent capability set.

Quanty is not equivalent to the user and must not inherit unrestricted user credentials.

## Cancellation

Cancellation:
- stops future tool execution
- attempts safe cancellation of running work
- records partial state
- never reports success after cancellation

## Recovery

If a tool fails:
- classify retryable/non-retryable
- retry only idempotent safe operations
- re-plan when required
- surface partial completion
