# Quant-Ecosystem — Canonical Port Registry

> **Source of truth for ports.** This file documents the ports the platform
> actually uses, extracted directly from each app's `Dockerfile` (`EXPOSE` /
> `ENV PORT` / `next start -p`), the per-app `.env.example`, and
> `docker-compose.yml`. It is NOT aspirational — every value below was verified
> against committed code. Update this file whenever a port changes.

## Frontend (Next.js) — production container ports

These are the canonical deployment ports (`Dockerfile` `EXPOSE` == `ENV PORT` ==
`next start -p`). Every deployable Next.js app already ships a Dockerfile.

| App           | Port |
| ------------- | ---- |
| quantmail     | 3010 |
| quantchat     | 3015 |
| quantai       | 3020 |
| admin         | 3100 |
| quantsync     | 3102 |
| quantmax      | 3103 |
| quantneon     | 3104 |
| quantube      | 3105 |
| quantedits    | 3106 |
| quantads      | 3108 |
| quantmeet     | 3109 |
| quantdocs     | 3110 |
| quantdrive    | 3111 |
| quantcalendar | 3112 |
| quanttrinity  | 3113 |

Notes:

- `3107` is intentionally free (previously reserved for the now-removed
  `quantstatus` stub app, deleted in PR #440).
- `marketing` and `status` are **library packages** (`build: tsc`, no `next`
  dependency) — they are not standalone web servers and intentionally have no
  Dockerfile / port. `quant-mobile` is an Expo/React-Native app (built for
  mobile, not a web container).

## Backend (Fastify) — dev ports (`apps/<app>/.env.example` `PORT=`)

These are the standalone backend dev-server ports. In production the backend is
served by the same app container; these are primarily for local `pnpm dev`.

| App           | Backend dev PORT |
| ------------- | ---------------- |
| quantchat     | 3002             |
| quantai       | 3003             |
| quantsync     | 3004             |
| quantube      | 3005             |
| quantmax      | 3007             |
| quantneon     | 3008             |
| quantedits    | 3009             |
| quantmeet     | 3010             |
| quantdocs     | 3011             |
| quantdrive    | 3012             |
| quantcalendar | 3013             |

> ⚠️ **Known dev-only collision to clean up:** `quantmeet`'s backend dev `PORT`
> (3010) overlaps `quantmail`'s frontend container port (3010). They never
> collide in production (separate containers) and rarely in dev (different
> processes), but the dev scripts should be de-conflicted in a follow-up. The
> **frontend container ports above are the authoritative deployment ports.**

## Infra / platform services (`docker-compose.yml`)

| Service            | Host port(s)            |
| ------------------ | ----------------------- |
| PostgreSQL         | 5432                    |
| Redis              | 6379                    |
| ws-gateway         | 8080                    |
| MeiliSearch        | 7700                    |
| Jaeger (UI / OTLP) | 16686 / 4318            |
| Prometheus         | 9090                    |
| Grafana            | 3200 (→ container 3000) |

## Conventions

- New deployable Next.js app → assign the next free port in the `31xx` block
  (next free after `3113` is `3114`; `3107` is also free) and add it here,
  to its `Dockerfile` (`EXPOSE`/`ENV PORT`/`-p`), and to `docker-compose.yml`.
- Keep `EXPOSE`, `ENV PORT`, and the `next start -p` flag identical within a
  Dockerfile.
