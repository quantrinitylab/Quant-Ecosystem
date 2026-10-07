-- QuantNeon: saved (bookmarked) posts
-- Additive, relation-free table backing POST /posts/:id/save and GET /posts/saved.

CREATE TABLE "saved_posts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_posts_userId_postId_key" ON "saved_posts"("userId", "postId");
CREATE INDEX "saved_posts_userId_idx" ON "saved_posts"("userId");
CREATE INDEX "saved_posts_postId_idx" ON "saved_posts"("postId");
