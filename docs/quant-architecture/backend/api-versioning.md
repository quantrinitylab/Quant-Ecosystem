# M23 — API Versioning

## Policy
Use explicit major versions for incompatible contracts. Additive, backward-compatible changes remain within the supported major version.

## Lifecycle
Preview → current → deprecated → sunset.

## Requirements
Deprecation includes migration documentation, telemetry on affected clients, published dates, and a defined support window.

Never silently change field meaning, authorization semantics, pagination behavior, or error meaning.
