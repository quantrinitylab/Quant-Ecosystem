-- QuantChat Encrypted Blind-Index Search Migration (W5)
-- Adds one QuantChat-specific table:
--   * blind_index_entries — client-built blind search index. The client
--                           tokenizes plaintext, computes HMAC(Search_Key, token)
--                           for each distinct token, and uploads ONLY the opaque
--                           token hashes. The server stores and matches token
--                           hashes only — it never sees plaintext tokens, message
--                           plaintext, or the Search_Key (Requirements 14.3, 16.1).
--
-- Zero-knowledge invariant: one row per (message, token hash). The owner column
-- scopes search results to the Search_Key owner; no plaintext is ever persisted.

-- CreateTable: blind_index_entries (opaque HMAC token hashes only)
CREATE TABLE "blind_index_entries" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blind_index_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: owner-scoped token-hash matching (drives search lookups)
CREATE INDEX "blind_index_entries_userId_tokenHash_idx" ON "blind_index_entries"("userId", "tokenHash");

-- CreateIndex: conversation-scoped lookups / reindex
CREATE INDEX "blind_index_entries_conversationId_idx" ON "blind_index_entries"("conversationId");
