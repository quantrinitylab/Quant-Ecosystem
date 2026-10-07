# QuanTube — T07 Upload (Mobile)

Flutter app exists: `flutter_apps/apps/quant_tube` (mobile surface alongside the responsive web build).
Mobile web: same Next.js route, touch targets >=44px, safe-area aware.

## Behavior

File picker / capture; progress with background resilience note.

## Offline

- cached snapshots may render where a hook implements them
- writes require connectivity; no fake success states
- queued actions only where conflict semantics are implemented

