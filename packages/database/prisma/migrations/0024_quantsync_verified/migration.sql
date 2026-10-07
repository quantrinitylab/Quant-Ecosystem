-- AlterTable: QuantSync Verified space + user verification badge
ALTER TABLE "users" ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: posts gain a feed "space" (main | verified | anonymous)
ALTER TABLE "posts" ADD COLUMN "space" TEXT NOT NULL DEFAULT 'main';

-- CreateIndex
CREATE INDEX "posts_space_idx" ON "posts"("space");
