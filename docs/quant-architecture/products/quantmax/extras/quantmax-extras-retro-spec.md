# QuantMax — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B7).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/challenges` | Creator challenges | `useChallenge` → backend (challenges, submissions, leaderboard; active/upcoming/ended filter) | loading, list, leaderboard |
| `/create` | Short-video creator studio | Client-side creation options (speed/timer/duration/font/color); publish pipeline | editing, publishing |
| `/group-rooms` | Social group rooms | `useGroupRooms` → backend (browse/create/join/leave, in-room chat, mute/camera) | browse, in-room |
| `/profile-detail` | Extended profile | Backend profile; honest empty content grid ("never fake tiles") | loading, empty, populated |
| `/creator-fund` | **remove** | Unwired placeholder ("wire real endpoints first") — deletion wave; re-propose when backend exists | — |
| `/videochat` | **remove** | Simulated fake matching ("User{N}", fake country, fake avatars) — deletion wave | — |

## Backend extras (kept, group verdict)

`commerce, economy, random-chat, squads, videochat, swipes, feed, payments, ai` —
present under `apps/quantmax/backend/routes/`, spot-checked real.
Endpoint-level contracts are a follow-up via `18-backend-spec-template.md`.
Note: with the `/videochat` UI removed, its backend route should be reviewed by
the deletion wave for dead-code follow-up.
