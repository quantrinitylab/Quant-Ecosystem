#!/usr/bin/env bash
# Seeds the throw-away Postgres (compose profile "sqldir") with lab/postgres-fixture.sql.
# Runs on the VM. Needs docker, openssl and stalwart/.env with PG_ADMIN_PASSWORD, PG_PASSWORD, PG_DB.
#
#   cd infra/mail/stalwart
#   docker compose --profile sqldir up -d postgres
#   ../lab/seed-sql-directory.sh
#   # then set DIRECTORY=sql in .env and run ./provision.sh apply
#
# argon2id hashes use the same parameters as Quant (packages/auth/src/crypto/password.ts):
# memory 19456 KiB, 2 passes, 1 lane. They are produced by argon2-cffi in a short-lived container.
# The plain passwords of carol and dave go to stalwart/.rendered/sql-accounts.env (VM only, mode 600).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STALWART_DIR="${HERE}/../stalwart"
cd "$STALWART_DIR"
umask 077

[ -f .env ] || { echo "error: stalwart/.env not found" >&2; exit 1; }
set -a; . ./.env; set +a
: "${PG_ADMIN_PASSWORD:?set PG_ADMIN_PASSWORD in .env}" "${PG_PASSWORD:?set PG_PASSWORD in .env}"
PG_DB="${PG_DB:-quantusers}"
PYTHON_IMAGE='python:3.13-alpine@sha256:bf12ecc0bea3f171d55145dd02c78b5eeb09f30ee2ac9cc2b4c9e4e8f5e30741'

mkdir -p .rendered
chmod 700 .rendered

hash_password() { # hash_password <plain>
  docker run --rm -i -e PW="$1" "$PYTHON_IMAGE" sh -c \
    'pip install --quiet --disable-pip-version-check --root-user-action=ignore argon2-cffi >/dev/null && python -c "import os; from argon2 import PasswordHasher; print(PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1).hash(os.environ[\"PW\"]))"'
}

carol_pw="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-20)-Cc1"
dave_pw="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-20)-Dd2"
carol_hash="$(hash_password "$carol_pw")"
dave_hash="$(hash_password "$dave_pw")"
case "$carol_hash" in '$argon2id$v=19$m=19456,t=2,p=1$'*) ;; *) echo "error: unexpected hash format" >&2; exit 1 ;; esac

{
  echo "SQL_CAROL_PASSWORD=${carol_pw}"
  echo "SQL_DAVE_PASSWORD=${dave_pw}"
} > .rendered/sql-accounts.env
chmod 600 .rendered/sql-accounts.env

docker compose --profile sqldir exec -T postgres \
  psql -U pgadmin -d "$PG_DB" -v ON_ERROR_STOP=1 \
  -v "carol_hash=${carol_hash}" -v "dave_hash=${dave_hash}" -v "ro_password=${PG_PASSWORD}" \
  -f - < "${HERE}/postgres-fixture.sql"

echo "seeded. carol/dave passwords: stalwart/.rendered/sql-accounts.env"
