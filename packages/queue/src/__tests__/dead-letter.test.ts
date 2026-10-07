// ============================================================================
// Dead Letter Queue - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueDeadLetter } from '../dead-letter';

describe('QueueDeadLetter', () => {
  let dlq: QueueDeadLetter;

  beforeEach(() => {
    dlq = new QueueDeadLetter();
  });

  describe('enqueue', () => {
    it('should add a failed job record', () => {
      const record = dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'SMTP connection failed',
        failedAt: Date.now(),
        attempts: 3,
        payload: { to: 'user@example.com', subject: 'Hello' },
      });

      expect(record.id).toBeDefined();
      expect(record.queue).toBe('email');
      expect(record.jobId).toBe('job-1');
      expect(record.jobName).toBe('send-email');
      expect(record.error).toBe('SMTP connection failed');
      expect(record.attempts).toBe(3);
    });

    it('should assign unique IDs to each record', () => {
      const r1 = dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Error 1',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });

      const r2 = dlq.enqueue({
        queue: 'email',
        jobId: 'job-2',
        jobName: 'send-email',
        error: 'Error 2',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('replay', () => {
    it('should mark a job for retry and return the record', () => {
      vi.useFakeTimers();
      const now = Date.now();

      const record = dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Timeout',
        failedAt: now,
        attempts: 2,
        payload: { to: 'user@test.com' },
      });

      const replayed = dlq.replay(record.id);
      expect(replayed).not.toBeNull();
      expect(replayed!.replayedAt).toBe(now);
      expect(replayed!.jobId).toBe('job-1');

      vi.useRealTimers();
    });

    it('should return null for non-existent ID', () => {
      const result = dlq.replay('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all records', () => {
      dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });
      dlq.enqueue({
        queue: 'media',
        jobId: 'job-2',
        jobName: 'process-media',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });

      const all = dlq.getAll();
      expect(all.length).toBe(2);
    });

    it('should filter by queue name', () => {
      dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });
      dlq.enqueue({
        queue: 'media',
        jobId: 'job-2',
        jobName: 'process-media',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });

      const emailOnly = dlq.getAll({ queue: 'email' });
      expect(emailOnly.length).toBe(1);
      expect(emailOnly[0]!.queue).toBe('email');
    });
  });

  describe('getStats', () => {
    it('should return counts by queue', () => {
      dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });
      dlq.enqueue({
        queue: 'email',
        jobId: 'job-2',
        jobName: 'send-email',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });
      dlq.enqueue({
        queue: 'media',
        jobId: 'job-3',
        jobName: 'process-media',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });

      const stats = dlq.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byQueue['email']).toBe(2);
      expect(stats.byQueue['media']).toBe(1);
    });

    it('should return empty stats when no records', () => {
      const stats = dlq.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byQueue).toEqual({});
    });
  });

  describe('purge', () => {
    it('should remove entries older than specified duration', () => {
      vi.useFakeTimers();
      const now = Date.now();

      dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Error',
        failedAt: now - 10000, // 10s ago
        attempts: 1,
        payload: null,
      });
      dlq.enqueue({
        queue: 'email',
        jobId: 'job-2',
        jobName: 'send-email',
        error: 'Error',
        failedAt: now - 1000, // 1s ago
        attempts: 1,
        payload: null,
      });

      const removed = dlq.purge(5000); // purge entries older than 5s

      expect(removed).toBe(1);
      expect(dlq.size()).toBe(1);

      vi.useRealTimers();
    });

    it('should return 0 when nothing to purge', () => {
      dlq.enqueue({
        queue: 'email',
        jobId: 'job-1',
        jobName: 'send-email',
        error: 'Error',
        failedAt: Date.now(),
        attempts: 1,
        payload: null,
      });

      const removed = dlq.purge(1000);
      expect(removed).toBe(0);
    });
  });
});
