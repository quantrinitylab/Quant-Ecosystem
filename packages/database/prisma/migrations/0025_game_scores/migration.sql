-- CreateTable: cross-app game leaderboard (scores from every Quant app, app-tagged)
CREATE TABLE "game_scores" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "displayName" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_scores_gameId_score_idx" ON "game_scores"("gameId", "score");
CREATE INDEX "game_scores_userId_idx" ON "game_scores"("userId");
CREATE INDEX "game_scores_app_idx" ON "game_scores"("app");

-- AddForeignKey
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
