-- QM-SCREEN-012: dismissed duplicate pairs for the contacts Dedup tab.
-- One row per pair the user explicitly marked "keep separate" — findDuplicates
-- filters these out, so a dismissed pair never reappears on rescan. Nothing is
-- backfilled: pairs dismissed before this migration did not exist as rows.
CREATE TABLE "dismissed_duplicate_pairs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dismissed_duplicate_pairs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dismissed_duplicate_pairs_userId_pairKey_key" ON "dismissed_duplicate_pairs"("userId", "pairKey");
CREATE INDEX "dismissed_duplicate_pairs_userId_idx" ON "dismissed_duplicate_pairs"("userId");
