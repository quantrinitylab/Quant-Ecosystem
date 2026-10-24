-- Lab fixture for the alternative SQL directory (Stalwart reads the Quant users table in Postgres).
--
-- The "users" table mirrors the columns of the Quant `User` model that matter for mail
-- (packages/database/prisma/schema.prisma: email, username, displayName, passwordHash, status).
-- Quant stores passwords with argon2id through packages/auth (src/crypto/password.ts):
--     $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>      (memory 19 MiB, 2 passes, 1 lane)
-- Stalwart accepts that PHC string as is (any hash starting with "$argon2").
--
-- Password hashes are NOT stored in this file. Pass them as psql variables:
--     psql -v ON_ERROR_STOP=1 -v carol_hash="$HASH1" -v dave_hash="$HASH2" \
--          -v ro_password="$PW" -d quantusers -f postgres-fixture.sql
-- lab/seed-sql-directory.sh generates the hashes with the same parameters and runs this file.
-- Plain passwords go to lab/.state/ (git-ignored), never into the repository.

\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- Extra addresses of a user (aliases), as the Quant alias feature would store them.
CREATE TABLE IF NOT EXISTS user_aliases (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  PRIMARY KEY (user_id, address)
);

-- Two accounts that have NEVER signed in to Stalwart. Mail to them must still be accepted (test T8).
INSERT INTO users (id, email, username, display_name, password_hash, status) VALUES
  ('lab-user-carol', 'carol@lab.quantrinity.in', 'carol', 'Carol (lab SQL account)', :'carol_hash', 'ACTIVE'),
  ('lab-user-dave',  'dave@lab.quantrinity.in',  'dave',  'Dave (lab SQL account, suspended)', :'dave_hash', 'SUSPENDED')
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      password_hash = EXCLUDED.password_hash,
      status = EXCLUDED.status;

INSERT INTO user_aliases (user_id, address) VALUES
  ('lab-user-carol', 'carol.lab@lab.quantrinity.in')
ON CONFLICT DO NOTHING;

-- Views with the column names the Stalwart SQL directory expects (plan/45-directory-sql.ndjson.tmpl).
-- Only ACTIVE users can authenticate or receive mail. SUSPENDED users disappear from the directory.
CREATE OR REPLACE VIEW stalwart_accounts AS
  SELECT email AS name,
         password_hash AS secret,
         display_name AS description,
         'individual'::text AS type
    FROM users
   WHERE status = 'ACTIVE';

CREATE OR REPLACE VIEW stalwart_emails AS
  SELECT u.email AS name, a.address AS address
    FROM user_aliases a
    JOIN users u ON u.id = a.user_id
   WHERE u.status = 'ACTIVE';

-- No groups in the lab. The view exists so the default query shape works.
CREATE OR REPLACE VIEW stalwart_group_members AS
  SELECT ''::text AS name, ''::text AS member_of WHERE false;

-- Read-only role used by Stalwart (PG_USER / PG_PASSWORD in .env). It can see the views, nothing else.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stalwart_ro') THEN
    CREATE ROLE stalwart_ro LOGIN;
  END IF;
END
$$;
ALTER ROLE stalwart_ro WITH PASSWORD :'ro_password';
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM stalwart_ro;
GRANT SELECT ON stalwart_accounts, stalwart_emails, stalwart_group_members TO stalwart_ro;

COMMIT;
