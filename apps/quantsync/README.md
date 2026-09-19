# QuantWave (`@quant/quantwave`)

> Directory is `apps/quantsync`; the package is **`@quant/quantwave`**. `turbo --filter` and
> `pnpm --filter` take the **package** name, not the directory.

Public-square social app: feed, posts/reposts/quotes, polls, communities, anonymous posting,
audio Spaces, notifications, and search/explore.

## Ports

Two processes, two ports. Getting these confused breaks every `/api/*` call:

| Process               | Port   | Source                              |
| --------------------- | ------ | ----------------------------------- |
| Next.js (UI + `/api`) | `3003` | `package.json` → `next dev -p 3003` |
| Fastify backend       | `3004` | `backend/app.ts` → `PORT ?? 3004`   |

Route handlers under `src/app/api/**` proxy to the backend using the single shared constant
in [`src/app/api/_lib/backend.ts`](./src/app/api/_lib/backend.ts). Override the target with
`QUANTSYNC_BACKEND_URL`. Do **not** re-declare a local `BACKEND_URL` in a route file — the
previous copy-pasted constants all defaulted to `3003`, which pointed the app at itself.

## Run it

```bash
pnpm --filter @quant/quantwave dev          # Next.js on :3003
pnpm --filter @quant/quantwave dev:backend  # Fastify on :3004
```

Copy `.env.example` to `.env` first. `JWT_SECRET` is **required** in production
(`backend/app.ts` throws without it). `DATABASE_URL` is needed for anything Prisma-backed.

## Checks

```bash
pnpm --filter @quant/quantwave typecheck   # tsc over src/** and backend/**
pnpm --filter @quant/quantwave lint
pnpm --filter @quant/quantwave test
```

## Layout

| Path                  | What                                                         |
| --------------------- | ------------------------------------------------------------ |
| `src/app/**`          | App Router pages and the `/api` proxy layer                  |
| `src/app/api/_lib/`   | Shared proxy plumbing (`backend.ts`)                         |
| `src/components/**`   | UI components                                                |
| `src/hooks/**`        | Data hooks (`useFeed`, `useSpaces`, `useCommunity`)          |
| `backend/routes/**`   | Fastify route modules, registered in `backend/app.ts`        |
| `backend/services/**` | Prisma-backed domain services                                |
| `src/legacy-pages/**` | **Dead** Pages-Router leftovers, not routed. Port or delete. |

Styling is Tailwind via `tailwind.config.ts` + `postcss.config.js`; the brand palette lives as
CSS custom properties in `src/app/globals.css`, which components read through arbitrary values
such as `dark:bg-[var(--quant-card)]`. Dark mode is class-based (`.dark`).
