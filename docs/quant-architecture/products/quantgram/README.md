# QuantGram — Product Screen Specs

App: `apps/quantgram`
Routers: Next.js pages router (UI) + app router (API only)

Role: ecosystem social surface (Instagram-style) — feed, stories, reels, profiles, DMs. Media-first; identity is the shared Quant Account. Commerce extras (/shop, /shopping, /games) exist in code but are outside the G01–G12 inventory — noted as extras, not spec'd as inventory screens.

Mobile: Flutter app at `flutter_apps/apps/quant_gram` plus responsive web.

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| G01 | Feed | IMPLEMENTED | `/ (index)` |
| G02 | Stories | IMPLEMENTED | `/stories, /story-viewer` |
| G03 | Create | IMPLEMENTED | `/create` |
| G04 | Camera/Editor | IMPLEMENTED | `/camera` |
| G05 | Post Detail | IMPLEMENTED | `/post/[id]` |
| G06 | Profile | IMPLEMENTED | `/profile/[id]` |
| G07 | Explore | IMPLEMENTED | `/explore` |
| G08 | Reels | IMPLEMENTED | `/reels` |
| G09 | Messages Handoff | IMPLEMENTED | `/messages` |
| G10 | Notifications | IMPLEMENTED | `/notifications` |
| G11 | Creator Analytics | MISSING | `(none)` |
| G12 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
