-- CreateTable: per-user preferred default AI model (OpenRouter id). Resolved by
-- the QuantAI ask/chat path when a request does not pin a model.
CREATE TABLE "user_model_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_model_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_model_preferences_userId_key" ON "user_model_preferences"("userId");
