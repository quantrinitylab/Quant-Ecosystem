# QuanTube — T03 Shorts (Mobile)

Flutter app exists: `flutter_apps/apps/quant_tube` (mobile surface alongside the responsive web build).
Mobile web: same Next.js route, touch targets >=44px, safe-area aware.

## Behavior

Primary surface: full-bleed vertical feed, double-tap like.

## Offline

- cached snapshots may render where a hook implements them
- writes require connectivity; no fake success states
- queued actions only where conflict semantics are implemented

