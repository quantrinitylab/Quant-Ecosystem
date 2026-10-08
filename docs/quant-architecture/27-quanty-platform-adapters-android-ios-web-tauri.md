# 27 — Quanty Platform Adapter Architecture

## Shared core
Quanty Core remains platform-neutral: session, orchestration, policy, tools, task graph, memory gateway, event handling and verification. Each client supplies a thin platform adapter for audio, UI, navigation, lifecycle and approved system APIs.

## Flutter
Shared package should expose QuantyProvider/session state, VoiceAgentSurface, QuantyCapsule, transcript, task progress, confirmation sheet, navigation bridge and accessibility primitives. Business logic stays outside widgets.

## Android
Native bridge handles audio focus, foreground/background lifecycle, app intents/deep links, notifications, approved overlay/persistent UI mechanisms and platform permissions. Cross-app operation is implemented through signed first-party contracts, not arbitrary accessibility automation. Background execution obeys Android lifecycle and user-visible requirements.

## iOS
Swift bridge handles audio session, App Intents/Shortcuts where appropriate, universal links, notifications and lifecycle. iOS restrictions are treated as product constraints; Quanty does not assume it can arbitrarily manipulate another app's UI.

## Web
Quanty shell provides authenticated session state, Web Audio/WebRTC voice where permitted, route navigation, visibility handling and browser permission UX. Long-running work moves to backend jobs; the page is not the source of truth.

## Tauri/Desktop
Rust/Tauri bridge handles window management, local approved capabilities, notifications, filesystem integrations and desktop audio. Every privileged bridge command is typed, permission checked and audited.

## Capability matrix
Each capability declares supported platforms, foreground/background requirement, permission, user-visible indicator and fallback. If unsupported, Quanty explains the limitation and offers a safe alternative rather than pretending completion.

## Testing
Run contract tests against every adapter. Platform-specific tests cover permission denial, app missing, background suspension, microphone interruption, notification denial, deep-link failure, stale handoff, offline state and process restart.

## Implementation
PLAT-01 capability matrix; PLAT-02 Flutter SDK; PLAT-03 Android bridge; PLAT-04 iOS bridge; PLAT-05 web shell; PLAT-06 Tauri bridge; PLAT-07 lifecycle persistence; PLAT-08 platform conformance suite.
