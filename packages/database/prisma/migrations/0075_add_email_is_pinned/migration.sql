-- Add isPinned to emails: separates pin-to-top from starring.
-- Previously the UI conflated the two (pin button toggled isStarred), so a
-- filter's "Star message" action appeared to PIN conversations.

ALTER TABLE "emails" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
