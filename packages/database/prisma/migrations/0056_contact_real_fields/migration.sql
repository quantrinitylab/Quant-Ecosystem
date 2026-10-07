-- Contacts: give the columns the UI has always pretended existed.
--
-- The contacts screen collects a phone, a company and tags in its create/edit
-- form, renders a company line and tag chips in the list, writes TEL and ORG
-- into the vCard export, and has a star that POSTs {"isFavorite":true}. None of
-- those had a column. `updateContactSchema` made every field optional and was
-- not `.strict()`, so the star's body parsed to `{}`, Prisma ran an empty
-- update, the toast said "Added to favorites", and the star reverted on the next
-- refetch. Same for phone/company/tags on create.
--
-- Additive and idempotent: every statement is IF NOT EXISTS, the two NOT NULL
-- columns carry defaults, and nothing is rewritten. The currently deployed image
-- does not know these columns and is unaffected by them, so this can be applied
-- before the rollout that uses them.

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- Set when a send addresses this contact. Nullable: a contact added by hand and
-- never written to has genuinely never been contacted, and 1970 would be a lie.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3);

-- The Favorites tab filters on exactly this pair.
CREATE INDEX IF NOT EXISTS "contacts_userId_isFavorite_idx" ON "contacts" ("userId", "isFavorite");
