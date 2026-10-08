# 26 — Quanty Universal App Shell and Navigation

## Principle
The nine products remain independently owned applications/domains, while Quanty provides a persistent cross-product session and typed navigation protocol. Changing the visible product does not destroy Quanty context.

## Product contract
Every product publishes an App Manifest containing product ID, supported platforms, routes, resource types, navigation destinations, Quanty capabilities, handoff actions, deep-link scheme, authentication requirements, background task capabilities and version compatibility.

## Navigation model
NavigationRequest = source product, target product, destination, resource refs, requested action, session ID, task ID, context scope, expiry and trace ID. The target product reauthorizes the request and resolves the resource; the source never passes privileged authority through a deep link.

## Navigation stack
Quanty maintains a bounded task-aware navigation stack. Foreground route, previous route, active resource, pending confirmation and return destination are explicit state. Temporary detours can return the user to the previous task without losing background work.

## Web
Use one authenticated Quant ecosystem shell and typed routes such as /mail, /chat, /max, etc. Route changes preserve the Quanty session. Cross-origin destinations require explicit handoff rather than assuming shared authority.

## Mobile
Flutter owns shared Quanty UI and navigation contracts. Android and iOS adapters translate typed navigation into approved native intents/deep links/App Intents/universal links. The design must not depend on unsupported arbitrary control of other apps.

## Desktop
Tauri uses the same contract to open product windows/views, maintain a persistent Quanty panel and coordinate approved local integrations. Window focus is a presentation concern; task state remains in the Quanty runtime.

## Handoff
A handoff creates a short-lived capability scoped to the destination resource and requested action. The destination reauthenticates and can reject stale, revoked or over-broad context.

## Cross-app examples
Chat invite → Max game room; Mail event → Calendar/Meet; Max clip → Gram/Wave; Cooks effect → Chat/Gram camera; Git release → Max/Cooks publishing; Ads campaign → supported product placement.

## Failure
If target app is unavailable, Quanty preserves the task and reports the navigation dependency. A deep link opening successfully is not proof that the requested business action completed.

## Implementation
NAV-01 manifest schema; NAV-02 registry; NAV-03 typed navigation; NAV-04 handoff capability; NAV-05 navigation stack; NAV-06 web shell; NAV-07 Flutter bridge; NAV-08 Android; NAV-09 iOS; NAV-10 Tauri; NAV-11 background task continuity; NAV-12 tests.
