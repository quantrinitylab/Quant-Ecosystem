ALTER TABLE "reel_comments"
ADD COLUMN "parentId" TEXT,
ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "reel_comments_parentId_idx" ON "reel_comments"("parentId");

ALTER TABLE "reel_comments"
ADD CONSTRAINT "reel_comments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reel_comments"
ADD CONSTRAINT "reel_comments_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "reel_comments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reel_comment_likes" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reel_comment_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reel_comment_likes_commentId_userId_key"
ON "reel_comment_likes"("commentId", "userId");
CREATE INDEX "reel_comment_likes_commentId_idx" ON "reel_comment_likes"("commentId");
CREATE INDEX "reel_comment_likes_userId_idx" ON "reel_comment_likes"("userId");

ALTER TABLE "reel_comment_likes"
ADD CONSTRAINT "reel_comment_likes_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "reel_comments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reel_comment_likes"
ADD CONSTRAINT "reel_comment_likes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;