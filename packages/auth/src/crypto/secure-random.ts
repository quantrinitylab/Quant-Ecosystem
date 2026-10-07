// ============================================================================
// Auth - Secure Random Utilities
// ============================================================================

import { randomBytes, randomInt } from 'node:crypto';

/**
 * Generate a cryptographically secure random hex token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a cryptographically secure numeric code (for OTPs)
 */
export function generateSecureCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/**
 * Generate a prefixed unique identifier using crypto
 */
export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}
