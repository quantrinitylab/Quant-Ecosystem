# QuantCooks — K08 Preview/Export (Mobile)

Flutter app exists: `flutter_apps/apps/quant_cooks` (mobile surface alongside the responsive web build).
Mobile web: same Next.js route, touch targets >=44px, safe-area aware.

## Behavior

Stacked layout; export runs server-side so the page can be backgrounded.

## Offline

- cached snapshots may render where a hook implements them
- writes require connectivity; no fake success states
- queued actions only where conflict semantics are implemented

