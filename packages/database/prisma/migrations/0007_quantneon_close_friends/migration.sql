-- QuantNeon: close-friends edges
-- Additive, relation-free table backing the close-friends list and toggles.

CREATE TABLE "close_friends" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "close_friends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "close_friends_userId_friendId_key" ON "close_friends"("userId", "friendId");
CREATE INDEX "close_friends_userId_idx" ON "close_friends"("userId");
CREATE INDEX "close_friends_friendId_idx" ON "close_friends"("friendId");
