# QuantMax — Product Screen Specs

App: `apps/quantmax`
Routers: Next.js pages router (UI) + app router (API only)

Role: ecosystem dating/social-discovery surface — discovery feed, matching, video chat, live, profiles. NOTE: no Flutter app exists for QuantMax in `flutter_apps/` — mobile is responsive web only. Safety is a first-class inventory screen (X08); the code has safety APIs but no safety UI — flagged honestly below.

Mobile: responsive web only (no Flutter app in `flutter_apps/`).

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| X01 | Discovery | IMPLEMENTED | `/discover` |
| X02 | Short Video | IMPLEMENTED | `/ (index)` |
| X03 | People Discovery | IMPLEMENTED | `/nearby` |
| X04 | Match | IMPLEMENTED | `/matching, /matches` |
| X05 | Chat Handoff | PARTIAL | `(no standalone chat screen)` |
| X06 | Live | IMPLEMENTED | `/live` |
| X07 | Profile | IMPLEMENTED | `/profile, /profile-detail` |
| X08 | Safety | PARTIAL | `(no safety UI page)` |
| X09 | Preferences | PARTIAL | `(no preferences UI page)` |
| X10 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
