# 15 — Definition of Done

## Screen
Real route, real data, loading/empty/error states, permissions, mobile/desktop behavior, accessibility, analytics, audit where needed, no production fake data, browser/device verification and regression tests.

## Backend
Domain ownership, schema/migration, authorization, validation, idempotency, typed errors, observability, audit, safe retry, outbox/events where needed, integration tests and fail-closed production configuration.

## AI
Typed tool, scoped permission, risk tier, cost estimate/reserve/settle, context policy, output validation, side-effect verification, audit trace, kill/stop behavior, evaluation tests and provider-failure behavior.

## Algorithm
Versioned features, training/serving parity, baseline, experiment, guardrails, safety constraints, rollback and online telemetry.

## Product
Critical journeys work end-to-end on every supported platform and survive partial failure of another product.

## Evidence
A static screenshot, green TypeScript check or successful route response alone is never sufficient.