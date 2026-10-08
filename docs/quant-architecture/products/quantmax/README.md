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

---

## Deep product architecture (architecture branch)

**Status:** Target-state architecture / execution contract
**Product ID:** `quantmax`
**Role:** Gaming, playable media, social discovery, dating, live rooms and play economy.

> **Boundary:** QuantMax owns play. QuantChat connects people to play. QuantTrinity settles the economy.

## Deep architecture

- `01-gaming-mini-games-playable-media-architecture.md` — Full gaming runtime: Snapchat/YouTube-style playable media, WePlay-style party games, instant mini-games, matchmaking, authoritative sessions, 3D rooms, creator games, tournaments, inventory, economy, Quanty, safety and cross-app integration.

## Product scope
- TikTok-style short video
- safe random discovery
- dating/matching
- multiplayer game rooms
- instant mini-games
- party games
- creator/UGC games
- playable video
- playable advertising
- tournaments
- spectators
- squads
- spatial voice
- 3D social worlds
- game creator tools
- game inventory/cosmetics
- verified rewards and achievements
- Quanty game copilot.

## Ownership law
QuantMax is authoritative for game catalog, versions, sessions, matchmaking, results, leaderboards, tournaments, inventory, game entitlements, creator game state and gaming analytics.

QuantChat may launch games, invite players and notify users, but must not become the source of truth for game state.

QuantTrinity owns credits/ledger and settlement. Games receive economy operation references rather than wallet database access.

## Implementation rule
Before implementation, Muse must inspect existing code, map it to this architecture, preserve working behavior, implement one coherent slice, add tests, run affected validation, inspect runtime behavior and record evidence. No fake game state, fake rewards or placeholder success paths.