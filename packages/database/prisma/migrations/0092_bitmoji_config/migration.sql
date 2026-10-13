-- QC-F-089: the /bitmoji editor page called GET /api/bitmoji/current and
-- POST /api/bitmoji/save, but no backend route, Next proxy, or storage ever
-- existed — Save always failed and a saved avatar never loaded back. This
-- migration creates the storage the new backend /bitmoji routes persist to:
-- one row per user holding the editor configuration verbatim (Json), kept
-- separate from the alien-style "avatars" table whose required
-- style/imageUrl columns describe a different feature.
CREATE TABLE "bitmoji_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bitmoji_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bitmoji_configs_userId_key" ON "bitmoji_configs"("userId");

CREATE INDEX "bitmoji_configs_userId_idx" ON "bitmoji_configs"("userId");

ALTER TABLE "bitmoji_configs" ADD CONSTRAINT "bitmoji_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
