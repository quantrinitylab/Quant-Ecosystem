-- Contact groups: make the inbox's "New group" button mean something.
--
-- The Groups lens has offered "New group" since it shipped. The dialog collected
-- a name and a member list, toasted `Group "X" created with N members!`, and
-- then pushed the user to /compose with those addresses in the To field. There
-- was no table, no route and no API client method: the group did not outlive the
-- toast, and reopening the dialog showed an empty form. This is the storage that
-- claim needed.
--
-- Membership is an address array rather than a join table on "contacts". In this
-- schema an address already is a person's identity — "contacts" is keyed
-- UNIQUE (userId, email) and ContactService.recordInteraction upserts on that
-- pair — so a join table would introduce a second identity for the same thing.
-- It would also force the editor either to drop addresses that are not in the
-- address book, which is the same class of silent lie this migration removes, or
-- to create contacts as a side effect of naming a group. Members that ARE in the
-- book still render with their name and avatar; the client joins on the address.
--
-- Additive and idempotent: one new table, nothing existing is altered or
-- rewritten, and every statement is IF NOT EXISTS. The currently deployed image
-- does not know this table and is unaffected by it, so this can be applied
-- before the rollout that uses it.

CREATE TABLE IF NOT EXISTS "contact_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- Trimmed and lowercased by the service before it gets here. Defaulted so a
    -- group can be named before it is filled, and so emptying one by removing
    -- its last member is an update rather than a constraint violation.
    "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- Two groups with the same name are indistinguishable in a chip row, so the
-- database refuses them instead of leaving the UI to guess. The service also
-- rejects a case-insensitive collision, which this index does not catch:
-- `Family` and `family` read as one group to a human and as two rows here.
CREATE UNIQUE INDEX IF NOT EXISTS "contact_groups_userId_name_key"
    ON "contact_groups" ("userId", "name");

CREATE INDEX IF NOT EXISTS "contact_groups_userId_idx"
    ON "contact_groups" ("userId");

-- AddForeignKey
-- Cascade, like "contacts": a deleted account's groups are not somebody else's
-- to inherit. Dropped first because ADD CONSTRAINT has no IF NOT EXISTS, and
-- this migration has to converge from a partially-applied state.
ALTER TABLE "contact_groups"
  DROP CONSTRAINT IF EXISTS "contact_groups_userId_fkey";
ALTER TABLE "contact_groups"
  ADD CONSTRAINT "contact_groups_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
