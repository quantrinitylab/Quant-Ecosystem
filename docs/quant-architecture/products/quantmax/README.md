# QuantMax — Deep Product Architecture

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