# 34 — Quanty Platform Conformance and E2E Plan

## Objective
The same Quanty contract must behave consistently across native web, Flutter Android, Flutter iOS, Tauri desktop and supported QuantMeet surfaces.

## Conformance matrix
Every capability is tested across:
- supported/unsupported platform
- foreground/background
- permission granted/denied
- online/offline
- app installed/missing
- session active/expired
- confirmation required/not required
- successful/failed/unknown verification
- voice available/unavailable.

## Golden scenarios
1. “Quanty, open QuantMax and start a game.”
2. “Quanty, draft an email to Rahul.”
3. “Send it.” with recipient ambiguity.
4. “Send it” with required confirmation.
5. “Send the email and open QuantMax.”
6. Navigate to Mail, inspect an item, return to the original Max game.
7. Voice barge-in while Quanty is speaking.
8. Microphone permission denied.
9. App unavailable during handoff.
10. Background task completes after mobile suspension.
11. Mutation times out and verification finds it already completed.
12. Memory suggestion is rejected and preference confidence decays.

## Security tests
Prompt-injection strings in messages, webpages, game metadata and files must never grant tools. Expired handoff capabilities, cross-tenant resources, revoked devices, stale approvals and replayed idempotency keys must fail closed.

## Performance budgets
Define measurable budgets before production: wake-to-listening latency, partial-ASR latency, first-response latency, tool-start latency, navigation latency and verification latency. Track p50/p95/p99 per platform.

## Release gate
No platform is “supported” because the UI renders. A capability is supported only when contract tests, authorization tests, failure-state tests, telemetry checks and end-to-end golden scenarios pass.

## Implementation
E2E-01 contract fixtures; E2E-02 registry conformance; E2E-03 web; E2E-04 Android; E2E-05 iOS; E2E-06 Tauri; E2E-07 voice; E2E-08 cross-app; E2E-09 background; E2E-10 security; E2E-11 performance; E2E-12 release gate.
