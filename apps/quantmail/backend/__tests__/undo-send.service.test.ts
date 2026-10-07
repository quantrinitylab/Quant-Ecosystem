import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UndoSendService } from '../services/undo-send.service';

function createMockQueue() {
  return {
    add: vi.fn(),
    getJob: vi.fn(),
    addBulk: vi.fn(),
    drain: vi.fn(),
    close: vi.fn(),
  };
}

describe('UndoSendService', () => {
  let service: UndoSendService;
  let queue: ReturnType<typeof createMockQueue>;

  beforeEach(() => {
    queue = createMockQueue();
    service = new UndoSendService(queue as never);
  });

  describe('scheduleSend', () => {
    it('schedules a send with 30s default delay', async () => {
      queue.add.mockResolvedValue('job-123');

      const result = await service.scheduleSend(
        { to: 'bob@example.com', subject: 'Hello', body: 'Hi Bob' },
        'user-1',
      );

      expect(result.jobId).toBe('job-123');
      expect(result.status).toBe('scheduled');
      expect(result.canUndo).toBe(true);
      expect(queue.add).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({
          userId: 'user-1',
          to: 'bob@example.com',
          subject: 'Hello',
          body: 'Hi Bob',
        }),
        expect.objectContaining({ delay: 30000 }),
      );
    });

    it('accepts custom delay', async () => {
      queue.add.mockResolvedValue('job-456');

      const result = await service.scheduleSend(
        { to: 'bob@example.com', subject: 'Hello', body: 'Hi' },
        'user-1',
        60000,
      );

      expect(result.jobId).toBe('job-456');
      expect(queue.add).toHaveBeenCalledWith(
        'send-email',
        expect.anything(),
        expect.objectContaining({ delay: 60000 }),
      );
    });

    it('returns sendsAt based on current time plus delay', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      queue.add.mockResolvedValue('job-789');

      const result = await service.scheduleSend(
        { to: 'bob@example.com', subject: 'Test', body: 'Body' },
        'user-1',
      );

      expect(result.sendsAt).toBe(new Date('2024-01-15T10:00:30Z').getTime());
      vi.useRealTimers();
    });
  });

  describe('cancelSend', () => {
    it('cancels a scheduled job owned by the user', async () => {
      const mockJob = {
        data: { userId: 'user-1', to: 'bob@example.com' },
        getState: vi.fn().mockResolvedValue('delayed'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelSend('job-123', 'user-1');

      expect(result.cancelled).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('returns false for non-existent job', async () => {
      queue.getJob.mockResolvedValue(null);

      const result = await service.cancelSend('nonexistent', 'user-1');
      expect(result.cancelled).toBe(false);
    });

    it('returns false when user does not own the job', async () => {
      const mockJob = {
        data: { userId: 'other-user', to: 'bob@example.com' },
        getState: vi.fn().mockResolvedValue('delayed'),
        remove: vi.fn(),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelSend('job-123', 'user-1');
      expect(result.cancelled).toBe(false);
      expect(mockJob.remove).not.toHaveBeenCalled();
    });

    it('returns false when job is already completed', async () => {
      const mockJob = {
        data: { userId: 'user-1', to: 'bob@example.com' },
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn(),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelSend('job-123', 'user-1');
      expect(result.cancelled).toBe(false);
    });

    it('returns false when job is currently active', async () => {
      const mockJob = {
        data: { userId: 'user-1', to: 'bob@example.com' },
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelSend('job-123', 'user-1');
      expect(result.cancelled).toBe(false);
    });
  });

  describe('getSendStatus', () => {
    it('returns scheduled status for delayed job', async () => {
      const mockJob = {
        data: { userId: 'user-1', scheduledAt: 1705312800000 },
        getState: vi.fn().mockResolvedValue('delayed'),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.getSendStatus('job-123', 'user-1');

      expect(result.status).toBe('scheduled');
      expect(result.canUndo).toBe(true);
      expect(result.jobId).toBe('job-123');
    });

    it('returns sent status for completed job', async () => {
      const mockJob = {
        data: { userId: 'user-1', scheduledAt: 1705312800000 },
        getState: vi.fn().mockResolvedValue('completed'),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.getSendStatus('job-123', 'user-1');

      expect(result.status).toBe('sent');
      expect(result.canUndo).toBe(false);
    });

    it('returns expired for non-existent job', async () => {
      queue.getJob.mockResolvedValue(null);

      const result = await service.getSendStatus('nonexistent', 'user-1');

      expect(result.status).toBe('expired');
      expect(result.canUndo).toBe(false);
    });

    it('returns expired when user does not own the job', async () => {
      const mockJob = {
        data: { userId: 'other-user', scheduledAt: 1705312800000 },
        getState: vi.fn().mockResolvedValue('delayed'),
      };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.getSendStatus('job-123', 'user-1');

      expect(result.status).toBe('expired');
      expect(result.canUndo).toBe(false);
    });
  });
});
