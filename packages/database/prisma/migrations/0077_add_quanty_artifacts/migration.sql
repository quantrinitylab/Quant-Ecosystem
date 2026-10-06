-- Add QuantyArtifact: user's saved artifacts + media library (Muse S6 parity).
-- kind: 'artifact' | 'media'. systemFile marks built-in templates/docs (read-only list).

CREATE TABLE "quanty_artifacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'artifact',
    "type" TEXT,
    "language" TEXT,
    "code" TEXT,
    "markdown" TEXT,
    "previewHtml" TEXT,
    "contentRef" TEXT,
    "systemFile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "quanty_artifacts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quanty_artifacts" ADD CONSTRAINT "quanty_artifacts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "quanty_artifacts_userId_idx" ON "quanty_artifacts"("userId");
CREATE INDEX "quanty_artifacts_userId_kind_idx" ON "quanty_artifacts"("userId", "kind");
CREATE INDEX "quanty_artifacts_userId_updatedAt_idx" ON "quanty_artifacts"("userId", "updatedAt");
