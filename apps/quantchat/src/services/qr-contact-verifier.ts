// ============================================================================
// QuantChat - Whoxa QR Code Contact Scanner & Peer Verification Engine
// Cryptographic Peer Safety Verification & Instant Contact QR Scanner
// ============================================================================

import * as crypto from 'node:crypto';

export interface ContactQrPayload {
  version: number;
  userId: string;
  username: string;
  displayName: string;
  publicKeyFingerprint: string;
  expiresAt: number; // unix timestamp in seconds
  signature: string;
}

export interface PeerVerificationResult {
  verified: boolean;
  fingerprintMatch: boolean;
  safetyNumber: string; // 60-digit grouped string "XXXXX XXXXX ..."
  status: 'VERIFIED' | 'UNVERIFIED' | 'MISMATCH' | 'EXPIRED';
  errorMessage?: string;
}

export interface VerificationBadgeInfo {
  badge: 'green-shield' | 'red-warning' | 'gray-unverified';
  label: string;
  color: string;
  isVerified: boolean;
}

/**
 * Strictly decodes a base64 identity public key into its raw bytes.
 *
 * Cross-client contract (QC-F-398): identity keys are 32 raw bytes carried
 * as canonical padded standard base64 — the exact form Flutter's
 * `base64.encode` produces and the form the Flutter client requires
 * (chat_core/lib/src/crypto/safety_number.dart). Node's base64 decoder is
 * lenient (it ignores invalid characters and tolerates missing padding), so
 * canonical form is enforced with a round-trip check: a string is accepted
 * only if decoding and re-encoding reproduces it byte-for-byte. Anything
 * else — empty, invalid base64, non-canonical form, or not exactly
 * 32 bytes — throws (fail-closed, matching Dart's ArgumentError behaviour).
 * No degraded or fabricated value is ever produced from a bad key.
 */
function decodeIdentityKeyBytes(publicKey: string): Buffer {
  if (typeof publicKey !== 'string' || publicKey.length === 0) {
    throw new Error('Identity public key must decode to exactly 32 bytes');
  }
  const bytes = Buffer.from(publicKey, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== publicKey) {
    throw new Error('Identity public key must decode to exactly 32 bytes');
  }
  return bytes;
}

/**
 * Computes the identity-key fingerprint of an identity public key.
 *
 * Cross-client contract (QC-F-398): base64(SHA-256(raw key bytes)) — the
 * pinned Flutter value (chat_core safety_number.dart
 * `identityKeyFingerprint`). The key STRING is never hashed; its decoded
 * 32 raw bytes are. Throws on any key that is not a canonical 32-byte
 * base64 identity key.
 */
export function computePublicKeyFingerprint(publicKey: string): string {
  const keyBytes = decodeIdentityKeyBytes(publicKey);
  return crypto.createHash('sha256').update(keyBytes).digest('base64');
}

/**
 * Generates canonical signing string for the QR payload.
 */
function buildCanonicalSignString(
  version: number,
  userId: string,
  username: string,
  displayName: string,
  publicKeyFingerprint: string,
  expiresAt: number,
): string {
  return `${version}:${userId}:${username}:${displayName}:${publicKeyFingerprint}:${expiresAt}`;
}

/**
 * Generates an HMAC-SHA256 signature for contact QR payload fields.
 */
function computeQrSignature(canonicalString: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(canonicalString).digest('hex');
}

/**
 * Generates a signed, Base64-encoded QR code payload for instant contact sharing.
 *
 * @param user User identity information including public key
 * @param secretKey Cryptographic secret key used to HMAC-sign the payload
 * @param ttlSeconds Optional time-to-live in seconds (defaults to 86400 / 24 hours)
 * @returns Base64-encoded JSON payload string
 */
export function generateContactQrPayload(
  user: { userId: string; username: string; displayName: string; publicKey: string },
  secretKey: string,
  ttlSeconds: number = 86400,
): string {
  const version = 1;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;
  const publicKeyFingerprint = computePublicKeyFingerprint(user.publicKey);

  const canonicalString = buildCanonicalSignString(
    version,
    user.userId,
    user.username,
    user.displayName,
    publicKeyFingerprint,
    expiresAt,
  );

  const signature = computeQrSignature(canonicalString, secretKey);

  const payload: ContactQrPayload = {
    version,
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    publicKeyFingerprint,
    expiresAt,
    signature,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Decodes, validates expiration, and verifies the HMAC signature of a scanned contact QR string.
 *
 * @param qrString Base64-encoded QR payload string
 * @param secretKey Cryptographic secret key to verify HMAC against
 * @returns Verification status and parsed payload or error message
 */
export function parseAndVerifyContactQr(
  qrString: string,
  secretKey: string,
): { valid: boolean; payload?: ContactQrPayload; error?: string } {
  try {
    const jsonStr = Buffer.from(qrString, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonStr) as ContactQrPayload;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.version !== 'number' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.username !== 'string' ||
      typeof parsed.displayName !== 'string' ||
      typeof parsed.publicKeyFingerprint !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      typeof parsed.signature !== 'string'
    ) {
      return { valid: false, error: 'Invalid QR payload format or missing required fields' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.expiresAt <= now) {
      return { valid: false, payload: parsed, error: 'QR code has expired' };
    }

    const canonicalString = buildCanonicalSignString(
      parsed.version,
      parsed.userId,
      parsed.username,
      parsed.displayName,
      parsed.publicKeyFingerprint,
      parsed.expiresAt,
    );

    const expectedSignature = computeQrSignature(canonicalString, secretKey);

    const sigBuf = Buffer.from(parsed.signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, payload: parsed, error: 'Invalid HMAC signature or tampered payload' };
    }

    return { valid: true, payload: parsed };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Corrupted data';
    return { valid: false, error: `Invalid QR code: ${errorMsg}` };
  }
}

/**
 * Computes the 60-digit peer safety number from both users' identity public keys.
 *
 * Cross-client contract (QC-F-398): the DIGITS are the pinned Flutter
 * values (chat_core/lib/src/crypto/safety_number.dart) — both keys are
 * decoded to their raw 32 bytes, sorted byte-wise, concatenated with NO
 * separator, and hashed with SHA-512; the digest is read as 12 chunks of
 * 5-byte big-endian uint40 and each chunk contributes the first 5 digits
 * of its zero-padded decimal form. The spaces in this client's return
 * value are only its display form ("XXXXX XXXXX ..."); the digits are the
 * contract. Symmetrically sorted:
 * computePeerSafetyNumber(A, B) === computePeerSafetyNumber(B, A).
 * Throws on any key that is not a canonical 32-byte base64 identity key.
 *
 * @param userAPublicKey Identity public key of User A (base64, 32 raw bytes)
 * @param userBPublicKey Identity public key of User B (base64, 32 raw bytes)
 * @returns 60-digit string formatted in 12 blocks of 5 digits
 */
export function computePeerSafetyNumber(userAPublicKey: string, userBPublicKey: string): string {
  const keyA = decodeIdentityKeyBytes(userAPublicKey);
  const keyB = decodeIdentityKeyBytes(userBPublicKey);
  const sorted = Buffer.compare(keyA, keyB) <= 0 ? [keyA, keyB] : [keyB, keyA];
  const hash = crypto.createHash('sha512').update(Buffer.concat(sorted)).digest();

  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    // Read a 5-byte big-endian uint40 chunk from the 64-byte SHA-512 digest
    // and take the first 5 digits of its zero-padded decimal form.
    const chunk = hash.readUIntBE(i * 5, 5);
    blocks.push(chunk.toString().padStart(5, '0').slice(0, 5));
  }

  return blocks.join(' ');
}

/**
 * Formats a raw number or unformatted digit sequence into 12 blocks of 5 digits.
 *
 * @param rawNumber Any string containing digits
 * @returns Space-separated 5-digit blocks
 */
export function formatSafetyNumberForDisplay(rawNumber: string): string {
  const digits = rawNumber.replace(/\D/g, '');
  const blocks: string[] = [];
  for (let i = 0; i < digits.length; i += 5) {
    blocks.push(digits.slice(i, i + 5));
  }
  return blocks.join(' ');
}

/**
 * Validates whether a safety number string matches the standard 60-digit format (12 blocks of 5 digits).
 */
export function isValidSafetyNumberFormat(safetyNumber: string): boolean {
  return /^(\d{5}\s){11}\d{5}$/.test(safetyNumber.trim());
}

/**
 * Verifies scanned peer fingerprint against expected peer fingerprint.
 *
 * @param scannedFingerprint The fingerprint retrieved from scanning or remote exchange
 * @param expectedFingerprint The expected local fingerprint of the peer
 * @param options Optional safety number override, user public keys, or expired flag
 * @returns PeerVerificationResult with verification status and 60-digit safety number
 */
export function verifyPeerFingerprints(
  scannedFingerprint: string,
  expectedFingerprint: string,
  options?: {
    userAPublicKey?: string;
    userBPublicKey?: string;
    safetyNumber?: string;
    expired?: boolean;
  },
): PeerVerificationResult {
  if (options?.expired) {
    return {
      verified: false,
      fingerprintMatch: false,
      safetyNumber: options.safetyNumber || '',
      status: 'EXPIRED',
      errorMessage: 'Peer verification expired',
    };
  }

  if (!scannedFingerprint || !expectedFingerprint) {
    return {
      verified: false,
      fingerprintMatch: false,
      safetyNumber: '',
      status: 'UNVERIFIED',
      errorMessage: 'Missing fingerprint for peer verification',
    };
  }

  const match =
    scannedFingerprint.toLowerCase().trim() === expectedFingerprint.toLowerCase().trim();

  let safetyNumber = options?.safetyNumber;
  if (!safetyNumber) {
    if (options?.userAPublicKey && options?.userBPublicKey) {
      safetyNumber = computePeerSafetyNumber(options.userAPublicKey, options.userBPublicKey);
    } else {
      // Honest-empty (QC-F-398): a safety number is computed from identity
      // KEYS, never from fingerprints. Without keys there is no number —
      // fabricating one from the fingerprint strings would produce a
      // plausible-looking number that belongs to no real key pair.
      safetyNumber = '';
    }
  }

  if (match) {
    return {
      verified: true,
      fingerprintMatch: true,
      safetyNumber,
      status: 'VERIFIED',
    };
  } else {
    return {
      verified: false,
      fingerprintMatch: false,
      safetyNumber,
      status: 'MISMATCH',
      errorMessage:
        'Peer fingerprint mismatch: scanned fingerprint does not match expected identity',
    };
  }
}

/**
 * Returns UI badge configuration for the chat header based on peer verification status.
 */
export function getContactVerificationBadge(
  status: 'VERIFIED' | 'UNVERIFIED' | 'MISMATCH' | 'EXPIRED',
): VerificationBadgeInfo {
  switch (status) {
    case 'VERIFIED':
      return {
        badge: 'green-shield',
        label: 'Verified Peer',
        color: '#10B981', // Tailwind green-500
        isVerified: true,
      };
    case 'MISMATCH':
      return {
        badge: 'red-warning',
        label: 'Safety Mismatch',
        color: '#EF4444', // Tailwind red-500
        isVerified: false,
      };
    case 'EXPIRED':
      return {
        badge: 'gray-unverified',
        label: 'Verification Expired',
        color: '#F59E0B', // Tailwind amber-500
        isVerified: false,
      };
    case 'UNVERIFIED':
    default:
      return {
        badge: 'gray-unverified',
        label: 'Unverified Contact',
        color: '#6B7280', // Tailwind gray-500
        isVerified: false,
      };
  }
}

/**
 * Class-based verifier wrapper for convenient dependency injection.
 */
export class QrContactVerifier {
  constructor(private readonly secretKey: string) {}

  generateQrPayload(
    user: { userId: string; username: string; displayName: string; publicKey: string },
    ttlSeconds?: number,
  ): string {
    return generateContactQrPayload(user, this.secretKey, ttlSeconds);
  }

  verifyScannedQr(qrString: string): {
    valid: boolean;
    payload?: ContactQrPayload;
    error?: string;
  } {
    return parseAndVerifyContactQr(qrString, this.secretKey);
  }

  computeSafetyNumber(userAPublicKey: string, userBPublicKey: string): string {
    return computePeerSafetyNumber(userAPublicKey, userBPublicKey);
  }

  verifyFingerprints(
    scannedFingerprint: string,
    expectedFingerprint: string,
    options?: {
      userAPublicKey?: string;
      userBPublicKey?: string;
      safetyNumber?: string;
      expired?: boolean;
    },
  ): PeerVerificationResult {
    return verifyPeerFingerprints(scannedFingerprint, expectedFingerprint, options);
  }
}
