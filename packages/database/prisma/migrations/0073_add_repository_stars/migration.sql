-- Star integrity: one row per (repository, user).
-- `repositories.starCount` becomes a derived cache of this table instead of an
-- unbounded counter that any reader could increment on every request.

CREATE TABLE "repository_stars" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_stars_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repository_stars_repositoryId_userId_key" ON "repository_stars"("repositoryId", "userId");
CREATE INDEX "repository_stars_userId_idx" ON "repository_stars"("userId");
CREATE INDEX "repository_stars_repositoryId_idx" ON "repository_stars"("repositoryId");

ALTER TABLE "repository_stars" ADD CONSTRAINT "repository_stars_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repository_stars" ADD CONSTRAINT "repository_stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing counters were inflatable and are not reconstructible from history,
-- so reset them to the (currently empty) join table. Stars are re-earned, not
-- silently trusted.
UPDATE "repositories" SET "starCount" = 0;
