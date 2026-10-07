-- The "streaks" table already exists (migration 0002_quantchat_mega_upgrade).
-- The Snapchat-style StreakService engine needs per-side interaction timestamps
-- and an increment marker, and treats lastActivityAt / expiresAt as optional
-- (the engine derives expiry from the per-side timestamps). Extend in place.
ALTER TABLE "streaks" ADD COLUMN IF NOT EXISTS "lastFromA" TIMESTAMP(3);
ALTER TABLE "streaks" ADD COLUMN IF NOT EXISTS "lastFromB" TIMESTAMP(3);
ALTER TABLE "streaks" ADD COLUMN IF NOT EXISTS "lastIncrementAt" TIMESTAMP(3);
ALTER TABLE "streaks" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "streaks" ALTER COLUMN "lastActivityAt" DROP NOT NULL;
ALTER TABLE "streaks" ALTER COLUMN "expiresAt" DROP NOT NULL;
