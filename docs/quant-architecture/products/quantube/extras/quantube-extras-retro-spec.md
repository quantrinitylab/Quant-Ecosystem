# QuanTube — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B6).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/shows` | Show catalog | Backend-backed shows query with genre filter (drama/comedy/action/thriller/documentary) | loading, error+retry, filtered catalog |
| `/playlist/[id]` | Playlist detail | `GET /api/playlists/{id}` via react-query (audit's mock loader already replaced) | loading, error+retry, tracks |
| `/podcasts` | **remove** | Hardcoded `MOCK_PODCASTS`/`MOCK_EPISODES` — deletion wave | — |

## Fix-queue referral (not removal)

The fake-data cluster (fabricated live chat, simulated viewer/bitrate/fps
metrics, fake search, theatrical transcoding, mock music product, "TechVision"
error masking) is a P0 **fix** item: the surfaces are real and stay; the data
must be made real. Tracked in the fix queue, not the removal list.

## Backend extras (kept, group verdict)

`cross-publish, music, segments, history, payments, feed, ai, interactions` —
present under `apps/quantube/backend/routes/`, spot-checked real.
Endpoint-level contracts are a follow-up via `18-backend-spec-template.md`.
