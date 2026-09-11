-- Migration 0059: Rehash legacy plaintext client secrets to SHA-256 hex
-- Ensures backward compatibility for pre-existing confidential clients without breaking live integrations.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

UPDATE "oauth_clients"
SET "clientSecretHash" = encode(digest("clientSecretHash", 'sha256'), 'hex')
WHERE "clientSecretHash" IS NOT NULL
  AND length("clientSecretHash") != 64;
