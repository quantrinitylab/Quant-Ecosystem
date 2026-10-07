# QuantWave — Product Screen Specs

App: `apps/quantwave`
Routers: Next.js app router

Role: ecosystem microblogging surface (Twitter/X + Threads + Reddit hybrid) — short posts, threads, communities, live audio spaces. Text-first; identity is the shared Quant Account.

Mobile: Flutter app at `flutter_apps/apps/quant_wave` plus responsive web.

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| W01 | Home | IMPLEMENTED | `/` |
| W02 | Thread | MISSING | `(none)` |
| W03 | Compose | IMPLEMENTED | `/compose` |
| W04 | Communities | IMPLEMENTED | `/communities` |
| W05 | Explore/Trends | IMPLEMENTED | `/trending` |
| W06 | Profile | IMPLEMENTED | `/profile` |
| W07 | Search | MISSING | `(none)` |
| W08 | Notifications | IMPLEMENTED | `/notifications` |
| W09 | Report | MISSING | `(none)` |
| W10 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
