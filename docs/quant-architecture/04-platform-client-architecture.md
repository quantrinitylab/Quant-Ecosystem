# 04 — Platform and Client Architecture

## Target platforms
Web, Android, iOS, Windows, macOS and Linux. Future tablet, TV, XR, watch and automotive clients must be addable without changing domain ownership.

## Web
Next.js/React, server rendering where useful, Web Workers, WebAssembly where useful, WebGPU/WebGL for genuine graphics needs, WebCodecs for supported media and offline storage through browser primitives.

## Flutter
Flutter is the primary cross-platform native UI strategy for Android, iOS and desktop where it improves delivery and consistency. Shared packages cover domain contracts, API client, auth, realtime, design tokens, navigation contracts, analytics, Quanty client and offline state.

Native bridges remain allowed for camera, microphone, contacts, files, notifications, background execution, Bluetooth, secure storage, payments, screen capture and device AI.

## Desktop
Desktop clients require native window lifecycle, global search, keyboard command system, notifications, file integration, secure credential storage, background tasks, deep links and offline cache.

## Shared versus native
Share domain semantics, API schemas, permissions, analytics event names, design tokens and business rules. Do not force identical pixels across platforms.

Every feature receives a capability matrix for web, Android, iOS, Windows, macOS and Linux before it is marked complete.