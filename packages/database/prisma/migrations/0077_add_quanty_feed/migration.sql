-- Quanty Feed (Q8): personalized feed — instructions, posts, reactions.
-- Provenance rule enforced at the application layer: 'external' posts MUST
-- carry a real fetched sourceUrl; 'agent_brief' posts are AI-generated and
-- are labeled as such in the UI. No fabricated headlines.

CREATE TABLE "feed_instructions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_instructions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feed_instructions_user_id_key" ON "feed_instructions"("user_id");
CREATE INDEX "feed_instructions_user_id_idx" ON "feed_instructions"("user_id");

CREATE TABLE "feed_posts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "source_url" TEXT,
    "source_name" TEXT,
    "image_url" TEXT,
    "emoji" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'agent_brief',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feed_posts_user_id_created_at_idx" ON "feed_posts"("user_id", "created_at" DESC);

CREATE TABLE "feed_reactions" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_reactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feed_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "feed_reactions_post_id_user_id_key" ON "feed_reactions"("post_id", "user_id");
CREATE INDEX "feed_reactions_post_id_idx" ON "feed_reactions"("post_id");
