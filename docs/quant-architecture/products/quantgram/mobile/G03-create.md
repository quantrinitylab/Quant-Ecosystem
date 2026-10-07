# QuantGram — G03 Create (Mobile)

Flutter app exists: `flutter_apps/apps/quant_gram` (mobile surface alongside the responsive web build).
Mobile web: same Next.js route, touch targets >=44px, safe-area aware.

## Behavior

Full-screen flow; camera roll / capture entry.

## Offline

- cached snapshots may render where a hook implements them
- writes require connectivity; no fake success states
- queued actions only where conflict semantics are implemented

