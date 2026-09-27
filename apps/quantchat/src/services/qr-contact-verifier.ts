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
 * Computes SHA-256 hex fingerprint of an identity public key.
 */
export function computePublicKeyFingerprint(publicKey: string): string {
  return crypto.createHash('sha256').update(publicKey).digest('hex');
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
 * Computes a 60-digit Signal-grade peer safety number from both users' public keys.
 * Symmetrically sorted: computePeerSafetyNumber(A, B) === computePeerSafetyNumber(B, A).
 * Output format: 12 blocks of 5 digits separated by spaces ("XXXXX XXXXX ...").
 *
 * @param userAPublicKey Identity key or public key of User A
 * @param userBPublicKey Identity key or public key of User B
 * @returns 60-digit string formatted in 12 blocks of 5 digits
 */
export function computePeerSafetyNumber(userAPublicKey: string, userBPublicKey: string): string {
  const sorted = [userAPublicKey, userBPublicKey].sort();
  const hash = crypto.createHash('sha512').update(`${sorted[0]}:${sorted[1]}`).digest();

  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    // Read 4-byte chunk from the 64-byte SHA-512 digest
    const chunk = hash.readUInt32BE(i * 4);
    const num = chunk % 100000;
    blocks.push(num.toString().padStart(5, '0'));
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
      safetyNumber = computePeerSafetyNumber(scannedFingerprint, expectedFingerprint);
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
