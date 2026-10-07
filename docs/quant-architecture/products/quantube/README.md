# QuanTube — Product Screen Specs

App: `apps/quantube`
Routers: Next.js pages router (UI) + app router (API only)

Role: ecosystem video surface (YouTube-style) — watch, shorts, music, live, creator studio, monetization. Shares the feed-ranking package family with QuantGram/QuantMax. Creator payouts run through the real payout service (see T12 honesty note below).

Mobile: Flutter app at `flutter_apps/apps/quant_tube` plus responsive web.

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| T01 | Home | IMPLEMENTED | `/ (index)` |
| T02 | Watch | IMPLEMENTED | `/watch/[id]` |
| T03 | Shorts | IMPLEMENTED | `/shorts` |
| T04 | Music | IMPLEMENTED | `/music` |
| T05 | Search | IMPLEMENTED | `/search` |
| T06 | Channel | IMPLEMENTED | `/channel/[id]` |
| T07 | Upload | IMPLEMENTED | `/upload` |
| T08 | Studio | IMPLEMENTED | `/studio` |
| T09 | Live | IMPLEMENTED | `/live` |
| T10 | Library | IMPLEMENTED | `/library` |
| T11 | Premium | IMPLEMENTED | `/premium` |
| T12 | Creator Analytics | PARTIAL | `/monetization` |
| T13 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
