import { describe, it, expect } from 'vitest';
import { AppealsQueue } from './appeals-queue';
import type { AppealRecord } from '../types';

function createAppeal(overrides: Partial<AppealRecord> = {}): AppealRecord {
  return {
    id: `ar_${Date.now()}_${Math.random()}`,
    contentId: 'content-1',
    userId: 'user-1',
    originalAction: 'flag',
    reason: 'test appeal',
    evidence: [],
    status: 'submitted',
    source: 'user_initiated',
    priority: 'medium',
    slaDeadline: Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('AppealsQueue', () => {
  describe('SLA ordering', () => {
    it('should dequeue cases in SLA-urgency order (most urgent first)', () => {
      const queue = new AppealsQueue();
      const now = Date.now();

      const low = createAppeal({ id: 'low', priority: 'low', slaDeadline: now + 72 * 3600000 });
      const critical = createAppeal({
        id: 'critical',
        priority: 'critical',
        slaDeadline: now + 1 * 3600000,
      });
      const medium = createAppeal({
        id: 'medium',
        priority: 'medium',
        slaDeadline: now + 24 * 3600000,
      });
      const high = createAppeal({ id: 'high', priority: 'high', slaDeadline: now + 4 * 3600000 });

      // Enqueue in random order
      queue.enqueue(low);
      queue.enqueue(critical);
      queue.enqueue(medium);
      queue.enqueue(high);

      // Should dequeue critical first (earliest deadline)
      const first = queue.dequeue('reviewer-1');
      expect(first?.id).toBe('critical');

      const second = queue.dequeue('reviewer-1');
      expect(second?.id).toBe('high');

      const third = queue.dequeue('reviewer-1');
      expect(third?.id).toBe('medium');

      const fourth = queue.dequeue('reviewer-1');
      expect(fourth?.id).toBe('low');
    });

    it('should dequeue overdue cases before non-overdue ones', () => {
      const queue = new AppealsQueue();
      const now = Date.now();

      const overdue = createAppeal({ id: 'overdue', slaDeadline: now - 1000 });
      const fresh = createAppeal({ id: 'fresh', slaDeadline: now + 1000000 });

      queue.enqueue(fresh);
      queue.enqueue(overdue);

      const first = queue.dequeue('reviewer-1');
      expect(first?.id).toBe('overdue');
    });
  });

  describe('overdue detection', () => {
    it('should report overdue count in stats', () => {
      const queue = new AppealsQueue();
      const now = Date.now();

      queue.enqueue(createAppeal({ id: 'overdue1', slaDeadline: now - 5000 }));
      queue.enqueue(createAppeal({ id: 'overdue2', slaDeadline: now - 1000 }));
      queue.enqueue(createAppeal({ id: 'ok', slaDeadline: now + 100000 }));

      const stats = queue.getQueueStats(now);
      expect(stats.overdue).toBe(2);
      expect(stats.pending).toBe(3);
    });

    it('should return zero overdue when all are within SLA', () => {
      const queue = new AppealsQueue();
      const now = Date.now();

      queue.enqueue(createAppeal({ slaDeadline: now + 100000 }));
      queue.enqueue(createAppeal({ slaDeadline: now + 200000 }));

      const stats = queue.getQueueStats(now);
      expect(stats.overdue).toBe(0);
    });
  });

  describe('workload distribution', () => {
    it('should track reviewer workload', () => {
      const queue = new AppealsQueue();
      const now = Date.now();

      queue.enqueue(createAppeal({ id: 'a1', slaDeadline: now + 1000 }));
      queue.enqueue(createAppeal({ id: 'a2', slaDeadline: now + 2000 }));
      queue.enqueue(createAppeal({ id: 'a3', slaDeadline: now + 3000 }));

      queue.dequeue('reviewer-A');
      queue.dequeue('reviewer-A');
      queue.dequeue('reviewer-B');

      const workloadA = queue.getReviewerWorkload('reviewer-A');
      expect(workloadA.assigned).toBe(2);
      expect(workloadA.resolved).toBe(0);

      const workloadB = queue.getReviewerWorkload('reviewer-B');
      expect(workloadB.assigned).toBe(1);
    });

    it('should return empty workload for unknown reviewer', () => {
      const queue = new AppealsQueue();
      const workload = queue.getReviewerWorkload('nobody');
      expect(workload.assigned).toBe(0);
      expect(workload.resolved).toBe(0);
    });
  });

  describe('queue stats', () => {
    it('should track average resolution time', () => {
      const queue = new AppealsQueue();
      const now = Date.now();

      const appeal1 = createAppeal({ createdAt: now - 5000, resolvedAt: now });
      const appeal2 = createAppeal({ createdAt: now - 3000, resolvedAt: now });

      queue.markResolved(appeal1);
      queue.markResolved(appeal2);

      const stats = queue.getQueueStats(now);
      expect(stats.avgResolutionTime).toBe(4000); // (5000 + 3000) / 2
    });

    it('should return zero avg resolution time when no resolved items', () => {
      const queue = new AppealsQueue();
      const stats = queue.getQueueStats();
      expect(stats.avgResolutionTime).toBe(0);
    });
  });

  describe('dequeue returns undefined when empty', () => {
    it('should return undefined when queue is empty', () => {
      const queue = new AppealsQueue();
      const result = queue.dequeue('reviewer-1');
      expect(result).toBeUndefined();
    });
  });
});
