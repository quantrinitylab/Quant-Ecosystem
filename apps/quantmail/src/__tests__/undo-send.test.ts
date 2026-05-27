import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UndoSendService } from '../services/undo-send.service';

describe('UndoSendService', () => {
  let service: UndoSendService;

  const testEmail = {
    to: 'recipient@example.com',
    subject: 'Test Subject',
    body: 'Test body content',
  };

  beforeEach(() => {
    service = new UndoSendService();
  });

  describe('queue', () => {
    it('should queue an email with default delay', () => {
      const queued = service.queue(testEmail);

      expect(queued.email).toEqual(testEmail);
      expect(queued.status).toBe('queued');
      expect(queued.sendAt).toBe(queued.queuedAt + 10000);
      expect(queued.id).toBeDefined();
    });

    it('should queue an email with custom delay', () => {
      const queued = service.queue(testEmail, 5000);

      expect(queued.sendAt).toBe(queued.queuedAt + 5000);
    });

    it('should generate unique ids', () => {
      const first = service.queue(testEmail);
      const second = service.queue(testEmail);

      expect(first.id).not.toBe(second.id);
    });
  });

  describe('cancel', () => {
    it('should cancel a queued email', () => {
      const queued = service.queue(testEmail);
      const result = service.cancel(queued.id);

      expect(result).toBe(true);
    });

    it('should return false for non-existent send', () => {
      const result = service.cancel('non-existent');
      expect(result).toBe(false);
    });

    it('should return false if already sent', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const queued = service.queue(testEmail, 1000);

      // Advance past send time
      vi.setSystemTime(now + 2000);
      service.checkAndSend();

      const result = service.cancel(queued.id);
      expect(result).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('getQueued', () => {
    it('should return only queued emails', () => {
      service.queue(testEmail);
      service.queue(testEmail);
      const third = service.queue(testEmail);
      service.cancel(third.id);

      const queued = service.getQueued();
      expect(queued).toHaveLength(2);
    });

    it('should return empty array when nothing is queued', () => {
      const queued = service.getQueued();
      expect(queued).toHaveLength(0);
    });
  });

  describe('getDefaultDelay / setDefaultDelay', () => {
    it('should return default delay of 10000ms', () => {
      expect(service.getDefaultDelay()).toBe(10000);
    });

    it('should update default delay', () => {
      service.setDefaultDelay(5000);
      expect(service.getDefaultDelay()).toBe(5000);
    });

    it('should throw for negative delay', () => {
      expect(() => service.setDefaultDelay(-1)).toThrow('Delay must be non-negative');
    });

    it('should allow zero delay', () => {
      service.setDefaultDelay(0);
      expect(service.getDefaultDelay()).toBe(0);
    });
  });

  describe('checkAndSend', () => {
    it('should send emails whose time has elapsed', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      service.queue(testEmail, 1000);
      service.queue(testEmail, 5000);

      vi.setSystemTime(now + 2000);
      const sent = service.checkAndSend();

      expect(sent).toHaveLength(1);
      expect(sent[0]?.status).toBe('sent');

      vi.useRealTimers();
    });

    it('should not send cancelled emails', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const queued = service.queue(testEmail, 1000);
      service.cancel(queued.id);

      vi.setSystemTime(now + 2000);
      const sent = service.checkAndSend();

      expect(sent).toHaveLength(0);

      vi.useRealTimers();
    });

    it('should not re-send already sent emails', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      service.queue(testEmail, 1000);

      vi.setSystemTime(now + 2000);
      service.checkAndSend();
      const secondCheck = service.checkAndSend();

      expect(secondCheck).toHaveLength(0);

      vi.useRealTimers();
    });
  });
});
