// ============================================================================
// QuantChat - Whoxa QR Code Contact Scanner & Peer Verification Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  generateContactQrPayload,
  parseAndVerifyContactQr,
  computePeerSafetyNumber,
  formatSafetyNumberForDisplay,
  verifyPeerFingerprints,
  computePublicKeyFingerprint,
  isValidSafetyNumberFormat,
  getContactVerificationBadge,
  QrContactVerifier,
} from '../services/qr-contact-verifier';

describe('Whoxa QR Code Contact Scanner & Peer Verification Engine', () => {
  const secretKey = 'quantchat-super-secure-cluster-hmac-secret-key-32b';
  const alice = {
    userId: 'usr_alice_001',
    username: 'alice_crypt',
    displayName: 'Alice Sterling',
    publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0alicePublicKeyExample',
  };
  const bob = {
    userId: 'usr_bob_002',
    username: 'bob_protocol',
    displayName: 'Bob Henderson',
    publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1bobPublicKeyExample',
  };

  describe('1. Contact QR Code Generation & Verification', () => {
    it('generates contact QR payload as a valid Base64 string with signature and future expiry', () => {
      const qrString = generateContactQrPayload(alice, secretKey, 3600);
      expect(typeof qrString).toBe('string');
      expect(qrString.length).toBeGreaterThan(20);

      // Verify it decodes to valid JSON
      const decodedJson = Buffer.from(qrString, 'base64').toString('utf8');
      const payload = JSON.parse(decodedJson);

      expect(payload.version).toBe(1);
      expect(payload.userId).toBe(alice.userId);
      expect(payload.username).toBe(alice.username);
      expect(payload.displayName).toBe(alice.displayName);
      expect(payload.publicKeyFingerprint).toBe(computePublicKeyFingerprint(alice.publicKey));
      expect(payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(payload.signature).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex string
    });

    it('parses valid QR string and returns payload with valid: true', () => {
      const qrString = generateContactQrPayload(alice, secretKey, 7200);
      const result = parseAndVerifyContactQr(qrString, secretKey);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.userId).toBe(alice.userId);
      expect(result.payload?.username).toBe(alice.username);
      expect(result.payload?.displayName).toBe(alice.displayName);
      expect(result.payload?.publicKeyFingerprint).toBe(
        computePublicKeyFingerprint(alice.publicKey),
      );
      expect(result.error).toBeUndefined();
    });

    it('rejects expired QR string with valid: false and expiration error', () => {
      // Generate with negative TTL so it is already expired
      const expiredQrString = generateContactQrPayload(alice, secretKey, -60);
      const result = parseAndVerifyContactQr(expiredQrString, secretKey);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });

    it('rejects tampered QR payload when username or userId has been altered', () => {
      const qrString = generateContactQrPayload(alice, secretKey, 3600);
      const jsonStr = Buffer.from(qrString, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr);

      // Tamper with username while keeping original signature
      payload.username = 'malicious_impersonator';
      const tamperedQrString = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

      const result = parseAndVerifyContactQr(tamperedQrString, secretKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/tampered|invalid.*signature/i);
    });

    it('rejects QR string signed with a different secret key', () => {
      const wrongSecretKey = 'attacker-wrong-secret-key-999';
      const qrString = generateContactQrPayload(alice, wrongSecretKey, 3600);

      const result = parseAndVerifyContactQr(qrString, secretKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/tampered|invalid.*signature/i);
    });

    it('handles malformed base64 or non-JSON input gracefully', () => {
      const result1 = parseAndVerifyContactQr('not_a_valid_base64_!@#$', secretKey);
      expect(result1.valid).toBe(false);
      expect(result1.error).toBeDefined();

      const nonJsonBase64 = Buffer.from('plain text without json', 'utf8').toString('base64');
      const result2 = parseAndVerifyContactQr(nonJsonBase64, secretKey);
      expect(result2.valid).toBe(false);
      expect(result2.error).toMatch(/invalid/i);
    });
  });

  describe('2. Cryptographic Peer Safety Number Computation', () => {
    it('is symmetric: A + B produces the exact same safety number as B + A', () => {
      const safetyNumberAtoB = computePeerSafetyNumber(alice.publicKey, bob.publicKey);
      const safetyNumberBtoA = computePeerSafetyNumber(bob.publicKey, alice.publicKey);

      expect(safetyNumberAtoB).toBe(safetyNumberBtoA);
    });

    it('produces exactly 12 blocks of 5 digits separated by spaces (60 digits total)', () => {
      const safetyNumber = computePeerSafetyNumber(alice.publicKey, bob.publicKey);

      // Format check: "XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX XXXXX"
      const blocks = safetyNumber.split(' ');
      expect(blocks).toHaveLength(12);

      for (const block of blocks) {
        expect(block).toHaveLength(5);
        expect(block).toMatch(/^\d{5}$/);
      }

      const totalDigits = safetyNumber.replace(/\s/g, '');
      expect(totalDigits).toHaveLength(60);
      expect(isValidSafetyNumberFormat(safetyNumber)).toBe(true);
    });

    it('produces different safety numbers for different public key pairs', () => {
      const evePublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3eveThirdPartyPublicKey';
      const safetyAliceBob = computePeerSafetyNumber(alice.publicKey, bob.publicKey);
      const safetyAliceEve = computePeerSafetyNumber(alice.publicKey, evePublicKey);

      expect(safetyAliceBob).not.toBe(safetyAliceEve);
    });
  });

  describe('3. Safety Number Formatting & Validation', () => {
    it('formats unspaced 60-digit string into 12 blocks of 5 digits', () => {
      const unspaced = '123456789012345678901234567890123456789012345678901234567890';
      const formatted = formatSafetyNumberForDisplay(unspaced);

      expect(formatted).toBe(
        '12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890',
      );
      expect(isValidSafetyNumberFormat(formatted)).toBe(true);
    });

    it('is idempotent when formatting an already formatted safety number', () => {
      const original = '54321 09876 54321 09876 54321 09876 54321 09876 54321 09876 54321 09876';
      const formatted = formatSafetyNumberForDisplay(original);

      expect(formatted).toBe(original);
    });
  });

  describe('4. Peer Fingerprint Verification & Shield Badges', () => {
    const aliceFingerprint = computePublicKeyFingerprint(alice.publicKey);
    const bobFingerprint = computePublicKeyFingerprint(bob.publicKey);

    it('verifies matching fingerprints and returns status: VERIFIED and verified: true', () => {
      const result = verifyPeerFingerprints(aliceFingerprint, aliceFingerprint);

      expect(result.verified).toBe(true);
      expect(result.fingerprintMatch).toBe(true);
      expect(result.status).toBe('VERIFIED');
      expect(isValidSafetyNumberFormat(result.safetyNumber)).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    it('returns status: MISMATCH when scanned fingerprint differs from expected', () => {
      const result = verifyPeerFingerprints(aliceFingerprint, bobFingerprint);

      expect(result.verified).toBe(false);
      expect(result.fingerprintMatch).toBe(false);
      expect(result.status).toBe('MISMATCH');
      expect(result.errorMessage).toMatch(/mismatch/i);
    });

    it('returns status: UNVERIFIED when fingerprint is missing or empty', () => {
      const result = verifyPeerFingerprints('', aliceFingerprint);

      expect(result.verified).toBe(false);
      expect(result.fingerprintMatch).toBe(false);
      expect(result.status).toBe('UNVERIFIED');
      expect(result.errorMessage).toMatch(/missing/i);
    });

    it('returns status: EXPIRED when expired option is provided', () => {
      const result = verifyPeerFingerprints(aliceFingerprint, aliceFingerprint, { expired: true });

      expect(result.verified).toBe(false);
      expect(result.fingerprintMatch).toBe(false);
      expect(result.status).toBe('EXPIRED');
      expect(result.errorMessage).toMatch(/expired/i);
    });

    it('returns correct Whoxa UI verification shield badges for chat header', () => {
      const verifiedBadge = getContactVerificationBadge('VERIFIED');
      expect(verifiedBadge.badge).toBe('green-shield');
      expect(verifiedBadge.isVerified).toBe(true);
      expect(verifiedBadge.color).toBe('#10B981');

      const mismatchBadge = getContactVerificationBadge('MISMATCH');
      expect(mismatchBadge.badge).toBe('red-warning');
      expect(mismatchBadge.isVerified).toBe(false);
      expect(mismatchBadge.color).toBe('#EF4444');

      const unverifiedBadge = getContactVerificationBadge('UNVERIFIED');
      expect(unverifiedBadge.badge).toBe('gray-unverified');
      expect(unverifiedBadge.isVerified).toBe(false);
    });
  });

  describe('5. QrContactVerifier Class Wrapper', () => {
    it('provides instance-based generation, parsing, and verification', () => {
      const verifier = new QrContactVerifier(secretKey);

      const qrPayload = verifier.generateQrPayload(bob, 1800);
      const parsed = verifier.verifyScannedQr(qrPayload);

      expect(parsed.valid).toBe(true);
      expect(parsed.payload?.userId).toBe(bob.userId);

      const safetyNumber = verifier.computeSafetyNumber(alice.publicKey, bob.publicKey);
      expect(isValidSafetyNumberFormat(safetyNumber)).toBe(true);

      const bobFingerprint = computePublicKeyFingerprint(bob.publicKey);
      const verifyResult = verifier.verifyFingerprints(bobFingerprint, bobFingerprint);
      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.status).toBe('VERIFIED');
    });
  });
});
