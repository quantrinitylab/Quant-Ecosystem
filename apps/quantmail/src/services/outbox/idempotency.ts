/**
 * UUIDv7 Time-Ordered Key Generator & 24-Hour Idempotency Ledger
 *
 * Complies with RFC 9562 UUID Version 7 specification:
 * - 48 bits: Unix timestamp in milliseconds
 * - 4 bits: Version (0b0111)
 * - 12 bits: Monotonic counter / entropy
 * - 2 bits: Variant (0b10)
 * - 62 bits: Random entropy
 *
 * Guarantees monotonic chronological ordering and deduplication across flaky networks.
 */

import { randomBytes } from 'crypto';

let lastTimestamp = -1;
let sequenceCounter = 0;

/**
 * Generates an RFC 9562 compliant UUIDv7 string.
 */
export function generateUuidV7(customTimestampMs?: number): string {
  const now = customTimestampMs ?? Date.now();

  if (now === lastTimestamp) {
    sequenceCounter = (sequenceCounter + 1) & 0xfff;
  } else {
    lastTimestamp = now;
    sequenceCounter = 0;
  }

  // 1. 48-bit timestamp
  const timeHex = now.toString(16).padStart(12, '0');

  // 2. 4-bit version (7) + 12-bit sequence
  const verSeq = ((0x7 << 12) | (sequenceCounter & 0xfff)).toString(16).padStart(4, '0');

  // 3. 2-bit variant (0b10 = 0x8) + 14-bit random + 48-bit random
  const rand = randomBytes(8);
  // Set variant 10xxxxxx on first byte
  rand[0] = (rand[0] & 0x3f) | 0x80;
  const randHex = rand.toString('hex');

  // Format: 8-4-4-4-12
  const part1 = timeHex.slice(0, 8);
  const part2 = timeHex.slice(8, 12);
  const part3 = verSeq;
  const part4 = randHex.slice(0, 4);
  const part5 = randHex.slice(4, 16);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
}

/**
 * Validates whether a string is a valid UUIDv7.
 */
export function isUuidV7(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

/**
 * Extracts the 48-bit Unix timestamp from a UUIDv7 string.
 */
export function extractTimestampFromUuidV7(uuid: string): number {
  if (!isUuidV7(uuid)) {
    throw new Error(`Invalid UUIDv7: ${uuid}`);
  }
  const clean = uuid.replace(/-/g, '');
  const timeHex = clean.slice(0, 12);
  return parseInt(timeHex, 16);
}

export interface IdempotencyRecord {
  key: string;
  createdAt: number;
  expiresAt: number;
  status: 'PENDING' | 'COMMITTED' | 'FAILED';
  responsePayload?: any;
}

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * 24-Hour Sliding Window Idempotency Ledger
 */
export class IdempotencyLedger {
  private records = new Map<string, IdempotencyRecord>();
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Attempts to claim an idempotency key.
   * Returns true if newly claimed, false if key is already active/committed (duplicate).
   */
  public claim(key: string): boolean {
    this.purgeExpired();

    const existing = this.records.get(key);
    if (existing) {
      if (Date.now() > existing.expiresAt) {
        this.records.delete(key);
      } else {
        return false; // Already claimed or committed
      }
    }

    const now = Date.now();
    this.records.set(key, {
      key,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: 'PENDING',
    });

    return true;
  }

  /**
   * Marks a claimed key as committed with cached response data.
   */
  public commit(key: string, responsePayload?: any): void {
    const record = this.records.get(key);
    if (record) {
      record.status = 'COMMITTED';
      record.responsePayload = responsePayload;
    }
  }

  public has(key: string): boolean {
    this.purgeExpired();
    return this.records.has(key);
  }

  public get(key: string): IdempotencyRecord | undefined {
    this.purgeExpired();
    return this.records.get(key);
  }

  public purgeExpired(): number {
    const now = Date.now();
    let purgedCount = 0;
    for (const [k, v] of this.records.entries()) {
      if (now > v.expiresAt) {
        this.records.delete(k);
        purgedCount++;
      }
    }
    return purgedCount;
  }

  public size(): number {
    return this.records.size;
  }

  public clear(): void {
    this.records.clear();
  }
}
