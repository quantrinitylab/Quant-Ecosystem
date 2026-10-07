// ============================================================================
// ZK Email - Key Discovery Service
// WKD (Web Key Directory) lookup for recipient public keys
// Implements WKD URL generation per RFC draft
// ============================================================================

import * as crypto from 'node:crypto';

export interface PublishedKey {
  email: string;
  publicKey: string;
  publishedAt: number;
}

// z-base-32 encoding alphabet
const Z_BASE_32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

/**
 * Encode bytes using z-base-32 encoding as specified in the WKD RFC draft.
 */
function zBase32Encode(data: Buffer): string {
  let result = '';
  let buffer = 0;
  let bufferLength = 0;

  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    bufferLength += 8;

    while (bufferLength >= 5) {
      bufferLength -= 5;
      const index = (buffer >>> bufferLength) & 0x1f;
      result += Z_BASE_32_ALPHABET[index];
    }
  }

  // Handle remaining bits
  if (bufferLength > 0) {
    const index = (buffer << (5 - bufferLength)) & 0x1f;
    result += Z_BASE_32_ALPHABET[index];
  }

  return result;
}

export class KeyDiscoveryService {
  private keyStore: Map<string, PublishedKey> = new Map();

  /**
   * Generate a WKD (Web Key Directory) URL for the given email address.
   * Uses the "advanced" WKD method: hash local part with SHA-1, encode with z-base-32.
   * Format: https://openpgpkey.<domain>/.well-known/openpgpkey/<domain>/hu/<hash>
   */
  generateWKDUrl(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex === -1) {
      throw new Error('Invalid email address');
    }

    const localPart = email.substring(0, atIndex).toLowerCase();
    const domain = email.substring(atIndex + 1).toLowerCase();

    // Hash the local part with SHA-1 as per the WKD spec
    const hash = crypto.createHash('sha1').update(localPart).digest();
    const encodedHash = zBase32Encode(hash);

    // Advanced method URL
    return `https://openpgpkey.${domain}/.well-known/openpgpkey/${domain}/hu/${encodedHash}`;
  }

  /**
   * Publish a public key for the given email address.
   * In production, this would upload to the WKD server.
   */
  async publishKey(email: string, publicKey: string): Promise<PublishedKey> {
    const normalizedEmail = email.toLowerCase();
    const published: PublishedKey = {
      email: normalizedEmail,
      publicKey,
      publishedAt: Date.now(),
    };
    this.keyStore.set(normalizedEmail, published);
    return published;
  }

  /**
   * Look up a public key for the given email address.
   * In production, this would fetch from the WKD URL.
   */
  async lookupKey(email: string): Promise<PublishedKey | null> {
    const normalizedEmail = email.toLowerCase();
    return this.keyStore.get(normalizedEmail) ?? null;
  }
}

export { zBase32Encode };
