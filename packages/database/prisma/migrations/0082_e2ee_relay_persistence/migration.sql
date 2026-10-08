-- K27 (2026-10-08): persistent storage for the QuantChat E2EE zero-knowledge
-- relay (doc 16 §1/§3/§7, §11 multidevice bootstrap).
--
-- Previously `InMemoryE2EERelay` held published pre-key bundles and relayed
-- ciphertext envelopes in process memory: every restart/redeploy silently
-- dropped key-distribution state, breaking multidevice bootstrap and losing
-- undrained ciphertext. These tables make the relay durable and shared across
-- backend instances.
--
-- ZERO-KNOWLEDGE INVARIANT: these tables store ONLY public key-distribution
-- bundles and opaque ciphertext envelopes. They MUST NEVER gain columns for
-- private keys, ratchet/session secrets, or plaintext. A future migration
-- adding such a column is a security bug — review accordingly.

CREATE TABLE "e2ee_relay_bundles" (
  "id" "text" NOT NULL,
  "userId" "text" NOT NULL,
  "deviceId" "text" NOT NULL,
  "identityKey" "text" NOT NULL,
  "signedPreKey" "text" NOT NULL,
  "signedPreKeySignature" "text" NOT NULL,
  "oneTimePreKey" "text",
  "registrationId" "integer" NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "e2ee_relay_bundles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "e2ee_relay_bundles_userId_deviceId_key" ON "e2ee_relay_bundles"("userId", "deviceId");
CREATE INDEX "e2ee_relay_bundles_userId_idx" ON "e2ee_relay_bundles"("userId");

CREATE TABLE "e2ee_relay_envelopes" (
  "id" "text" NOT NULL,
  "senderId" "text" NOT NULL,
  "recipientId" "text" NOT NULL,
  "sessionId" "text",
  "ciphertext" "text" NOT NULL,
  "nonce" "text" NOT NULL,
  "tag" "text" NOT NULL,
  "algorithm" "text" NOT NULL,
  "senderFingerprint" "text" NOT NULL,
  "recipientFingerprint" "text" NOT NULL,
  "payloadTimestamp" TIMESTAMP(3) NOT NULL,
  "version" "integer" NOT NULL,
  "relayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "e2ee_relay_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "e2ee_relay_envelopes_recipientId_relayedAt_idx" ON "e2ee_relay_envelopes"("recipientId", "relayedAt");
