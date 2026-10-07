// ============================================================================
// Delivery Manager Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeliveryManager } from '../delivery';

describe('DeliveryManager', () => {
  let delivery: DeliveryManager;

  beforeEach(() => {
    delivery = new DeliveryManager({
      ackTimeoutMs: 1000,
      maxRetries: 3,
      retryIntervalMs: 500,
    });
  });

  afterEach(() => {
    delivery.reset();
  });

  describe('sequence numbers', () => {
    it('should assign monotonically increasing sequences per channel', () => {
      const seq1 = delivery.nextSequence('channel1');
      const seq2 = delivery.nextSequence('channel1');
      const seq3 = delivery.nextSequence('channel1');
      expect(seq1).toBe(1);
      expect(seq2).toBe(2);
      expect(seq3).toBe(3);
    });

    it('should maintain separate sequences per channel', () => {
      const seq1a = delivery.nextSequence('channel1');
      const seq2a = delivery.nextSequence('channel2');
      const seq1b = delivery.nextSequence('channel1');
      expect(seq1a).toBe(1);
      expect(seq2a).toBe(1);
      expect(seq1b).toBe(2);
    });

    it('should return current sequence without incrementing', () => {
      delivery.nextSequence('channel1');
      delivery.nextSequence('channel1');
      expect(delivery.getSequence('channel1')).toBe(2);
    });

    it('should return 0 for unknown channels', () => {
      expect(delivery.getSequence('unknown')).toBe(0);
    });
  });

  describe('createEnvelope', () => {
    it('should create envelope with correct fields', () => {
      const envelope = delivery.createEnvelope('channel1', 'message', { text: 'hi' }, 'user1');
      expect(envelope.channel).toBe('channel1');
      expect(envelope.type).toBe('message');
      expect(envelope.payload).toEqual({ text: 'hi' });
      expect(envelope.senderId).toBe('user1');
      expect(envelope.sequence).toBe(1);
      expect(envelope.requiresAck).toBe(true);
      expect(envelope.id).toMatch(/^msg_/);
      expect(envelope.timestamp).toBeGreaterThan(0);
    });

    it('should increment sequence on each envelope', () => {
      const e1 = delivery.createEnvelope('channel1', 'msg', {}, 'user1');
      const e2 = delivery.createEnvelope('channel1', 'msg', {}, 'user1');
      expect(e2.sequence).toBe(e1.sequence + 1);
    });

    it('should respect requiresAck flag', () => {
      const envelope = delivery.createEnvelope('channel1', 'msg', {}, 'user1', false);
      expect(envelope.requiresAck).toBe(false);
    });
  });

  describe('trackSent and acknowledge', () => {
    it('should track sent messages', () => {
      const envelope = delivery.createEnvelope('channel1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', envelope);
      expect(delivery.getPendingCount()).toBe(1);
    });

    it('should not track messages that do not require ack', () => {
      const envelope = delivery.createEnvelope('channel1', 'msg', {}, 'user1', false);
      delivery.trackSent('conn1', envelope);
      expect(delivery.getPendingCount()).toBe(0);
    });

    it('should acknowledge and remove pending message', () => {
      const envelope = delivery.createEnvelope('channel1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', envelope);
      const result = delivery.acknowledge({
        messageId: envelope.id,
        sequence: envelope.sequence,
        acknowledgedAt: Date.now(),
      });
      expect(result).toBe(true);
      expect(delivery.getPendingCount()).toBe(0);
    });

    it('should return false for unknown message ack', () => {
      const result = delivery.acknowledge({
        messageId: 'unknown',
        sequence: 1,
        acknowledgedAt: Date.now(),
      });
      expect(result).toBe(false);
    });
  });

  describe('getPendingForConnection', () => {
    it('should return pending messages for a connection', () => {
      const e1 = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      const e2 = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', e1);
      delivery.trackSent('conn2', e2);
      const pending = delivery.getPendingForConnection('conn1');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe(e1.id);
    });
  });

  describe('sweep (retry)', () => {
    it('should retry unacked messages after timeout', () => {
      const retrySender = vi.fn();
      delivery.setRetrySender(retrySender);

      const envelope = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', envelope);

      // Access the pending map via getPendingForConnection and manipulate sentAt
      // The sweep checks Date.now() - sentAt > ackTimeoutMs
      // We need to make the pending entry appear old
      // Force sweep to see it as timed out by temporarily patching Date.now
      const originalNow = Date.now;
      Date.now = () => originalNow() + 2000;
      try {
        delivery.sweep();
      } finally {
        Date.now = originalNow;
      }

      expect(retrySender).toHaveBeenCalledWith('conn1', envelope);
    });

    it('should drop messages after max retries', () => {
      const retrySender = vi.fn();
      delivery.setRetrySender(retrySender);

      const envelope = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', envelope);

      // Sweep multiple times to exhaust retries
      const originalNow = Date.now;
      let timeOffset = 0;
      Date.now = () => originalNow() + timeOffset;
      try {
        for (let i = 0; i < 4; i++) {
          timeOffset += 2000;
          delivery.sweep();
        }
      } finally {
        Date.now = originalNow;
      }

      expect(delivery.getPendingCount()).toBe(0);
    });

    it('should not retry messages within timeout', () => {
      const retrySender = vi.fn();
      delivery.setRetrySender(retrySender);

      const envelope = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', envelope);

      delivery.sweep(); // Called immediately, message is still fresh
      expect(retrySender).not.toHaveBeenCalled();
    });
  });

  describe('clearConnection', () => {
    it('should remove all pending for a connection', () => {
      const e1 = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      const e2 = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', e1);
      delivery.trackSent('conn1', e2);
      expect(delivery.getPendingCount()).toBe(2);
      delivery.clearConnection('conn1');
      expect(delivery.getPendingCount()).toBe(0);
    });
  });

  describe('startSweep / stopSweep', () => {
    it('should start and stop periodic sweep', () => {
      delivery.startSweep();
      // Just verify it does not throw and can be stopped
      delivery.stopSweep();
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const e1 = delivery.createEnvelope('ch1', 'msg', {}, 'user1');
      delivery.trackSent('conn1', e1);
      delivery.reset();
      expect(delivery.getPendingCount()).toBe(0);
      expect(delivery.getSequence('ch1')).toBe(0);
    });
  });
});
