# QuantCooks — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B8).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/brand-kit` | Brand kit manager | `/api/brand-kit` CRUD (428-line surface) | loading, error+retry, empty, editing |
| `/collaborate` | Collaboration | `/api/collaboration/*` (537-line surface) | loading, invites, active session |

## Backend extras (kept, group verdict)

`auto-edit, brand-kits, effects, collaboration, ai` — present under
`apps/quantcooks/backend/routes/`, spot-checked real. Endpoint-level contracts
are a follow-up via `18-backend-spec-template.md`.
