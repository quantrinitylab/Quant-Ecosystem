# QuantGram — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B4).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/games`, `/game/[id]` | Game hub + player | Backend `apps/quantgram/backend/routes/games.ts`; game catalog (title/description/thumbnail/rating/plays), player HUD (score/level/lives) | loading, catalog, playing |
| `/shopping` | In-app shopping | `/api/shopping/products`, `/cart`, `/checkout` — real catalog/cart/checkout (audit's MOCK_PRODUCTS already replaced) | catalog, cart, checkout |
| `/map` | Social map | Story-location pins (`features/map/social-map`, `SocialMapView`); pin → story deep-link | loading, pins, empty |
| `/close-friends` | Close-friends list + exclusive story mode | User search + list management with refetch states | search, list, toggling |
| `/highlights` | **remove** | Hardcoded `MOCK_HIGHLIGHTS`/`MOCK_AVAILABLE` — deletion wave | — |
| `/collab` | **remove** | Hardcoded `MOCK_COLLABS`/`MOCK_PENDING`/`MOCK_SEARCH` — deletion wave | — |

Already-resolved (never shipped; no action): `/notes`, `/broadcast`, `/guides`,
`/shop` (only `/shopping` ships — canonical).

## Backend extras (kept, group verdict)

`ar-lenses, games, shopping, filters, dm, explore, federation, ai` — present
under `apps/quantgram/backend/routes/`, spot-checked real. Endpoint-level
contracts are a follow-up via `18-backend-spec-template.md`.

## Structure note

Source headers still say "QuantNeon" (`src/pages/index.tsx`) while the product is
QuantGram — rename cleanup belongs to the structure track, recorded here only.
