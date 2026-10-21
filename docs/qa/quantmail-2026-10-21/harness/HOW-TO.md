# How to reproduce this QA locally

Prereqs: Node 22, pnpm 10, and a PostgreSQL 16 **with the `vector` (pgvector),
`pg_trgm` and `pgcrypto` extensions available**, plus Redis 7. (In the QA sandbox
these were built from source because Docker wasn't available; with Docker you can
instead use `docker-compose.dev.yml`, which ships `ankane/pgvector` + `redis:7`.)

## 1. Database + Redis
```bash
# create an empty DB named quantdb owned by a superuser 'quant'
createdb quantdb
# start redis however you like (port 6379)
```

## 2. Install + generate + migrate
```bash
cp harness/env.example.sh env.sh   # then edit secrets + tool paths
source env.sh
pnpm install --frozen-lockfile
pnpm --filter @quant/database exec prisma generate --schema=prisma/schema.prisma
pnpm --filter @quant/database exec prisma migrate deploy --schema=prisma/schema.prisma
pnpm --filter @quant/database exec prisma migrate status --schema=prisma/schema.prisma   # must be clean (see Finding F1)
```

## 3. Build + run the backend (the production artifact)
```bash
node infra/scripts/build-backend.mjs apps/quantmail backend/server.ts apps/quantmail/backend/dist/server.mjs
node apps/quantmail/backend/dist/server.mjs            # listens on :3010
curl -s localhost:3010/readyz                          # {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```
> If you set `NODE_ENV=development` the bundle crashes on a missing pino-pretty
> worker (Finding F8) — use `staging`. `JWT_SECRET` **must** be set or login
> succeeds but every authenticated call 401s (the sign/verify fallbacks differ).

## 4. Run the frontend
```bash
printf 'QUANTMAIL_BACKEND_URL=http://127.0.0.1:3010\nNEXT_PUBLIC_API_URL=/api\n' > apps/quantmail/.env.local
pnpm --filter @quant/quantmail exec next dev -p 3000   # http://localhost:3000
```

## 5. Run the tests
```bash
node harness/functional-test.mjs     # -> results/functional-results.json
node harness/load-test.mjs           # -> results/load-results.json  (set RATE_LIMIT_MAX high first)
node harness/verify-bugs.mjs         # -> results/verify-bugs.json
```
All three hit `QM_BASE` (default `http://127.0.0.1:3010`) and require the backend
(and Postgres/Redis) running. They create their own throwaway users each run.

`start-infra.sh` is the sandbox helper that starts the from‑source Postgres/Redis;
adapt it to your environment or use Docker instead.
