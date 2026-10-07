-- QuantSync Anonymous section: posts whose author identity is hidden from
-- readers (a stable per-thread pseudonymous alias is shown instead). The real
-- author is retained in "posts"."userId" for abuse handling but never exposed
-- by the anonymous feed projection.

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "posts" ADD COLUMN "anonymousAlias" TEXT;

-- CreateIndex
CREATE INDEX "posts_isAnonymous_idx" ON "posts"("isAnonymous");
