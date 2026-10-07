// ============================================================================
// Reindex Job Manager - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ReindexJobManager } from './reindex-job';

describe('ReindexJobManager', () => {
  let manager: ReindexJobManager;

  beforeEach(() => {
    manager = new ReindexJobManager();
  });

  describe('startReindex', () => {
    it('should create a new job in pending state', () => {
      const job = manager.startReindex('emails');

      expect(job.id).toBeDefined();
      expect(job.indexName).toBe('emails');
      expect(job.state).toBe('pending');
      expect(job.progress).toBe(0);
      expect(job.createdAt).toBeInstanceOf(Date);
    });

    it('should assign unique job IDs', () => {
      const a = manager.startReindex('emails');
      const b = manager.startReindex('messages');
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('getJobStatus', () => {
    it('should retrieve a job by ID', () => {
      const job = manager.startReindex('emails');
      const result = manager.getJobStatus(job.id);
      expect(result).toEqual(job);
    });

    it('should return undefined for non-existent job', () => {
      const result = manager.getJobStatus('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('listJobs', () => {
    it('should list all jobs sorted by creation time descending', () => {
      manager.startReindex('emails');
      manager.startReindex('messages');
      manager.startReindex('files');

      const jobs = manager.listJobs();
      expect(jobs).toHaveLength(3);
      // All created in same tick, so order is by ID (counter) descending
      expect(jobs[0]!.indexName).toBe('files');
      expect(jobs[1]!.indexName).toBe('messages');
      expect(jobs[2]!.indexName).toBe('emails');
    });

    it('should return empty array when no jobs exist', () => {
      const jobs = manager.listJobs();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('cancelJob', () => {
    it('should cancel a pending job', () => {
      const job = manager.startReindex('emails');
      const cancelled = manager.cancelJob(job.id);

      expect(cancelled?.state).toBe('cancelled');
      expect(cancelled?.completedAt).toBeInstanceOf(Date);
    });

    it('should cancel a running job', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      const cancelled = manager.cancelJob(job.id);

      expect(cancelled?.state).toBe('cancelled');
    });

    it('should not change state for already completed jobs', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      manager.markCompleted(job.id);
      const result = manager.cancelJob(job.id);

      expect(result?.state).toBe('completed');
    });

    it('should return undefined for non-existent job', () => {
      const result = manager.cancelJob('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('markRunning', () => {
    it('should transition pending job to running', () => {
      const job = manager.startReindex('emails');
      const running = manager.markRunning(job.id);

      expect(running?.state).toBe('running');
      expect(running?.startedAt).toBeInstanceOf(Date);
    });

    it('should not transition non-pending jobs', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      // Try to mark running again
      const result = manager.markRunning(job.id);
      expect(result).toBeUndefined();
    });
  });

  describe('updateProgress', () => {
    it('should update progress for a running job', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      const updated = manager.updateProgress(job.id, 50);

      expect(updated?.progress).toBe(50);
    });

    it('should clamp progress to 0-100 range', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);

      const over = manager.updateProgress(job.id, 150);
      expect(over?.progress).toBe(100);

      const under = manager.updateProgress(job.id, -10);
      expect(under?.progress).toBe(0);
    });

    it('should not update progress for non-running jobs', () => {
      const job = manager.startReindex('emails');
      const result = manager.updateProgress(job.id, 50);
      expect(result).toBeUndefined();
    });
  });

  describe('markCompleted', () => {
    it('should mark a running job as completed with 100% progress', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      const completed = manager.markCompleted(job.id);

      expect(completed?.state).toBe('completed');
      expect(completed?.progress).toBe(100);
      expect(completed?.completedAt).toBeInstanceOf(Date);
    });

    it('should not complete a non-running job', () => {
      const job = manager.startReindex('emails');
      const result = manager.markCompleted(job.id);
      expect(result).toBeUndefined();
    });
  });

  describe('markFailed', () => {
    it('should mark a running job as failed with error', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      const failed = manager.markFailed(job.id, 'Connection timeout');

      expect(failed?.state).toBe('failed');
      expect(failed?.error).toBe('Connection timeout');
      expect(failed?.completedAt).toBeInstanceOf(Date);
    });

    it('should mark a pending job as failed', () => {
      const job = manager.startReindex('emails');
      const failed = manager.markFailed(job.id, 'Invalid index');

      expect(failed?.state).toBe('failed');
      expect(failed?.error).toBe('Invalid index');
    });

    it('should not fail an already completed job', () => {
      const job = manager.startReindex('emails');
      manager.markRunning(job.id);
      manager.markCompleted(job.id);
      const result = manager.markFailed(job.id, 'error');
      expect(result).toBeUndefined();
    });
  });
});
