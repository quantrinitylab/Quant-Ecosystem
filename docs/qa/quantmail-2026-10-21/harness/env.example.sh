# Environment for running QuantMail locally for QA.
# Copy to env.sh, replace the throwaway secrets, and `source` it before each step.
# NOTE: adjust the tool paths (PG_BIN/REDIS_BIN) to wherever you built/installed them.

export PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"   # dir containing postgres/psql/pg_ctl/initdb
export REDIS_BIN="${REDIS_BIN:-/usr/bin}"               # dir containing redis-server/redis-cli

# ---- QuantMail backend env ----
# 'staging' (not 'development'): the dev-only pino-pretty transport cannot resolve
# its thread-stream worker inside the esbuild bundle (see report Finding F8).
# 'staging' is production-like but keeps cookies non-Secure so http://localhost works.
export NODE_ENV=staging
export PORT=3010
export HOST=127.0.0.1
export DATABASE_URL="postgresql://quant:quant@127.0.0.1:5432/quantdb?schema=public"
export REDIS_URL="redis://127.0.0.1:6379"

# Secrets — REPLACE THESE. Must be >=32 chars and not contain a placeholder marker
# like "change-in-production" (server-core asserts real secrets outside dev/test).
export JWT_SECRET="REPLACE_ME_with_a_random_48_char_hex_string_000000"
export JWT_REFRESH_SECRET="REPLACE_ME_with_a_different_random_48_char_string0"
export JWT_ISSUER="quantmail"
export JWT_AUDIENCE="quant-ecosystem"
# Fail-closed in ALL environments (no dev fallback) — /emails/changes cursor signing:
export SYNC_CURSOR_SECRET="REPLACE_ME_with_a_random_40_char_string_0000000000"

export CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
export MAIL_SENDER_DOMAIN="quantmail.in"
export CALL_REMINDER_SWEEP_INTERVAL_MS=0
export LOG_LEVEL=info
export RATE_LIMIT_MAX=1000          # raise to e.g. 5000000 for raw-throughput load phases

# ---- Frontend env (apps/quantmail/.env.local) ----
export QUANTMAIL_BACKEND_URL="http://127.0.0.1:3010"
export NEXT_PUBLIC_API_URL="/api"
