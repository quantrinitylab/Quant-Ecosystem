-- Contact groups: admin roles and invite links.
--
-- The group info modal could show a group's members but not manage them: no
-- way to promote/demote an admin, no per-member removal short of the full
-- editor, and no way to invite someone with a link.
--
-- `adminEmails` parallels `emails` deliberately — membership in this schema is
-- an address array, not a join table (see 0057_contact_groups), so per-member
-- roles live in a second array the service keeps a subset of `emails` on every
-- write. The owner (`userId`) is always an admin implicitly and never listed.
--
-- `inviteToken` holds the single active join-link token for the group (null
-- while no link exists or after revocation). Regenerating replaces it, which
-- invalidates every copy of the old link.
--
-- Additive and idempotent: three new columns, nothing existing is altered, and
-- every statement is guarded. Existing rows get an empty admin list and no
-- invite token — both valid states, not missing data.

ALTER TABLE "contact_groups"
  ADD COLUMN IF NOT EXISTS "adminEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "contact_groups"
  ADD COLUMN IF NOT EXISTS "inviteToken" TEXT;

ALTER TABLE "contact_groups"
  ADD COLUMN IF NOT EXISTS "inviteTokenCreatedAt" TIMESTAMP(3);

-- Prisma's `@unique` on inviteToken. A unique index (not a constraint) so the
-- statement can be IF NOT EXISTS: partial-apply convergence, like the rest of
-- this migration history.
CREATE UNIQUE INDEX IF NOT EXISTS "contact_groups_inviteToken_key"
  ON "contact_groups" ("inviteToken");
