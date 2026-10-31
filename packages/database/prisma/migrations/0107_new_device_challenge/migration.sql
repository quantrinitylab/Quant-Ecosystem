-- fix/qm-new-device-challenge (2026-10-26): risk-based new-device sign-in gate.
--
-- Before this, /auth/login issued a full browser session to any correct
-- password from any IP: refresh-token rows captured ipAddress + userAgent,
-- but nothing compared a sign-in against prior sessions. A password login
-- from a device matching no live browser session now mints a row here
-- instead of a session, and POST /auth/new-device/verify burns it for the
-- session. Same contract as email_verification_codes (digest-only code,
-- single-use, 15-minute expiry, attempt cap) in a SEPARATE table, so a
-- sign-in challenge can never be consumed by /auth/verify-email.
-- deviceFingerprint binds the challenge to the login request's
-- ipAddress+userAgent pair, so the code is redeemable only from the device
-- that started the sign-in. Deploy note: this migration must be applied
-- before the gate code serves traffic — until the table exists, unfamiliar
-- device logins fail closed with 503 NEW_DEVICE_GATE_UNAVAILABLE rather
-- than issuing a session (familiar-device logins are unaffected).

CREATE TABLE "new_device_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_device_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "new_device_challenges_userId_idx" ON "new_device_challenges"("userId");
CREATE INDEX "new_device_challenges_expiresAt_idx" ON "new_device_challenges"("expiresAt");

ALTER TABLE "new_device_challenges" ADD CONSTRAINT "new_device_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
