-- QuantChat E2EE Durable Key Store Migration (W1)
-- Adds durable, zero-knowledge key-store tables for the QuantChat E2EE workstream.
-- Stores PUBLIC key material only: public identity/signed/one-time prekeys and
-- server-relayed X3DH session material. No private keys, ratchet secrets, or
-- plaintext are ever persisted.

-- CreateTable: prekey_bundles (one current bundle per user)
CREATE TABLE "prekey_bundles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "signedPreKey" TEXT NOT NULL,
    "signedPreKeySignature" TEXT NOT NULL,
    "registrationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prekey_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: onetime_prekeys (consumable pool)
CREATE TABLE "onetime_prekeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onetime_prekeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable: key_sessions (durable X3DH session)
CREATE TABLE "key_sessions" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL,
    "established" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: prekey_bundles (one bundle per user)
CREATE UNIQUE INDEX "prekey_bundles_userId_key" ON "prekey_bundles"("userId");

-- CreateIndex: onetime_prekeys (drives unclaimed lookup / atomic claim)
CREATE INDEX "onetime_prekeys_userId_claimed_idx" ON "onetime_prekeys"("userId", "claimed");

-- CreateIndex: key_sessions
CREATE UNIQUE INDEX "key_sessions_initiatorId_responderId_key" ON "key_sessions"("initiatorId", "responderId");
CREATE INDEX "key_sessions_responderId_idx" ON "key_sessions"("responderId");

-- AddForeignKey: prekey_bundles -> users (cascade)
ALTER TABLE "prekey_bundles" ADD CONSTRAINT "prekey_bundles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: onetime_prekeys -> prekey_bundles (cascade)
ALTER TABLE "onetime_prekeys" ADD CONSTRAINT "onetime_prekeys_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "prekey_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
