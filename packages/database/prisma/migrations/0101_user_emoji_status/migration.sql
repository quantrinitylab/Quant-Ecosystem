-- QC-F-466: expiring emoji status on the users table.
-- Two nullable columns, always written together (set) or both NULL (clear).
-- No backfill: the feature is new, there is no historical status data.
-- No index: no query filters on these columns; reads happen on user/member
-- rows that are already fetched for the profile/search/participant DTOs.
ALTER TABLE "users" ADD COLUMN "statusEmoji" TEXT;
ALTER TABLE "users" ADD COLUMN "statusEmojiExpiresAt" TIMESTAMP(3);
