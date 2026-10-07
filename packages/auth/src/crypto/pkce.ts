// ============================================================================
// Auth - PKCE (Proof Key for Code Exchange) Utilities
// ============================================================================

import { randomBytes, subtle } from 'node:crypto';

/**
 * Generate a cryptographically random code verifier (43-128 chars)
 */
export function generateCodeVerifier(length: number = 64): string {
  const clamped = Math.max(43, Math.min(128, length));
  const bytes = randomBytes(clamped);
  return base64UrlEncode(bytes).slice(0, clamped);
}

/**
 * Generate a code challenge from a verifier using SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await subtle.digest('SHA-256', data);
  return base64UrlEncode(Buffer.from(digest));
}

/**
 * Validate a code verifier against a challenge
 */
export async function validateCodeChallenge(
  verifier: string,
  challenge: string,
  method: 'plain' | 'S256',
): Promise<boolean> {
  if (method === 'plain') {
    return verifier === challenge;
  }
  const computed = await generateCodeChallenge(verifier);
  return computed === challenge;
}

/**
 * Base64url encode a buffer (no padding)
 */
function base64UrlEncode(buffer: Buffer | ArrayBuffer): string {
  const buf = Buffer.from(buffer as any);
  return buf.toString('base64url');
}
