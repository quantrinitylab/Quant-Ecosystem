import { describe, it, expect } from 'vitest';
import {
  generateUuidV7,
  isUuidV7,
  extractTimestampFromUuidV7,
  IdempotencyLedger,
} from '../idempotency.js';
import { OutboxMutationQueue, QueuedMutation } from '../mutation-queue.js';

describe('Task W35-04: UUIDv7 Time-Ordered Idempotent Outbox Queue', () => {
  describe('UUIDv7 Generation & Verification', () => {
    it('generates valid RFC 9562 compliant UUIDv7 strings', () => {
      const id = generateUuidV7();
      expect(isUuidV7(id)).toBe(true);

      // 13th char must be '7' (version 7)
      expect(id[14]).toBe('7');
      // 17th char must be 8, 9, a, or b (variant 10xx)
      expect(['8', '9', 'a', 'b']).toContain(id[19].toLowerCase());
    });

    it('extracts accurate milliseconds timestamp from UUIDv7', () => {
      const now = Date.now();
      const id = generateUuidV7(now);
      const extracted = extractTimestampFromUuidV7(id);
      expect(extracted).toBe(now);
    });

    it('generates strictly monotonically increasing UUIDv7 identifiers', () => {
      const id1 = generateUuidV7(1700000000000);
      const id2 = generateUuidV7(1700000001000);
      const id3 = generateUuidV7(1700000002000);

      expect(id1 < id2).toBe(true);
      expect(id2 < id3).toBe(true);
    });
  });

  describe('24-Hour Idempotency Ledger', () => {
    it('claims key on first attempt and prevents duplicates', () => {
      const ledger = new IdempotencyLedger(3600000); // 1 hour TTL
      const key = generateUuidV7();

      expect(ledger.claim(key)).toBe(true);
      // Second attempt with same key must return false (duplicate)
      expect(ledger.claim(key)).toBe(false);

      ledger.commit(key, { emailId: 'msg_100', status: 'SENT' });
      const record = ledger.get(key);
      expect(record?.status).toBe('COMMITTED');
      expect(record?.responsePayload.emailId).toBe('msg_100');
    });

    it('purges expired keys after TTL has elapsed', () => {
      const ledger = new IdempotencyLedger(50); // 50ms TTL
      const key1 = generateUuidV7();
      ledger.claim(key1);

      expect(ledger.has(key1)).toBe(true);

      // Simulate time passing by modifying expiresAt
      const rec = ledger.get(key1);
      if (rec) rec.expiresAt = Date.now() - 100;

      const purged = ledger.purgeExpired();
      expect(purged).toBe(1);
      expect(ledger.has(key1)).toBe(false);
    });
  });

  describe('Outbox Mutation Queue', () => {
    it('queues mutations chronologically and flushes with Idempotency-Key', async () => {
      const queue = new OutboxMutationQueue();
      const serverCalls: { id: string; key: string; payload: any }[] = [];

      queue.enqueue('SEND_MAIL', {
        to: 'colleague@quant.local',
        subject: 'Draft 1',
        body: 'Hello',
      });

      queue.enqueue('SET_FLAGS', {
        emailId: 'msg_99',
        flags: { read: 1 },
      });

      queue.enqueue('MOVE_FOLDER', {
        emailId: 'msg_99',
        targetFolder: 'ARCHIVE',
      });

      expect(queue.size()).toBe(3);

      const res = await queue.flush(async (mutation: QueuedMutation, idempotencyKey: string) => {
        serverCalls.push({
          id: mutation.id,
          key: idempotencyKey,
          payload: mutation.payload,
        });
        return { success: true };
      });

      expect(res.processedCount).toBe(3);
      expect(res.failedCount).toBe(0);
      expect(queue.size()).toBe(0); // All processed mutations removed

      expect(serverCalls.length).toBe(3);
      // Verify idempotencyKey matches mutation.id
      for (const call of serverCalls) {
        expect(call.key).toBe(call.id);
        expect(isUuidV7(call.key)).toBe(true);
      }
    });

    it('retries on failure and marks as failed when max retries exceeded', async () => {
      const queue = new OutboxMutationQueue(2); // 2 retries max

      queue.enqueue('SEND_MAIL', { subject: 'Failing draft' });

      // First flush: fails
      const res1 = await queue.flush(async () => ({ success: false, error: 'Network 503' }));
      expect(res1.failedCount).toBe(1);
      expect(queue.getPending().length).toBe(1); // Still queued for retry
      expect(queue.getPending()[0].retryCount).toBe(1);

      // Second flush: fails again, hits max retries -> FAILED
      const res2 = await queue.flush(async () => ({ success: false, error: 'Network 503' }));
      expect(res2.failedCount).toBe(1);
      expect(queue.getPending().length).toBe(0); // No longer in queued state
      expect(queue.getAll()[0].status).toBe('FAILED');
    });
  });
});
