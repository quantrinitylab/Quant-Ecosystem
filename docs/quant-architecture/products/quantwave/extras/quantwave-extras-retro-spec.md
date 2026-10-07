# QuantWave — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B5).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/bookmarks` | Saved posts | `useQuery(['bookmarks'])` → `quantSyncAPI.getBookmarks()` → backend | loading, error+retry, empty, list |
| `/spaces` | Audio/listening spaces | Backend-backed spaces (browse/join) | loading, empty, in-space |

## Backend extras (kept, group verdict)

`anonymous, pk-battle, radar, ai` — present under
`apps/quantwave/backend/routes/`, spot-checked real. Note: `radar.ts` trusted a
client `x-user-id` header (P0 impersonation) — a **fix**, not a removal; the
file already carries a fail-closed guard comment and hardening stays in the fix
queue. Endpoint-level contracts are a follow-up via `18-backend-spec-template.md`.
