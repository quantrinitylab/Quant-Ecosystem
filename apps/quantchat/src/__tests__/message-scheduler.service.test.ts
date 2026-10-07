import { describe, it, expect, beforeEach } from 'vitest';
import { MessageSchedulerService } from '../services/message-scheduler.service';

describe('MessageSchedulerService', () => {
  let service: MessageSchedulerService;

  beforeEach(() => {
    service = new MessageSchedulerService();
  });

  describe('schedule', () => {
    it('should schedule a message for the future', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');

      expect(message.id).toBeDefined();
      expect(message.conversationId).toBe('conv-1');
      expect(message.content).toBe('Hello!');
      expect(message.scheduledAt).toBe(futureTime);
      expect(message.status).toBe('pending');
      expect(message.userId).toBe('user-1');
    });

    it('should reject past dates', () => {
      const pastTime = Date.now() - 60000;
      expect(() => {
        service.schedule('conv-1', 'Hello!', pastTime, 'user-1');
      }).toThrow('Scheduled time must be in the future');
    });

    it('should reject empty content', () => {
      const futureTime = Date.now() + 60000;
      expect(() => {
        service.schedule('conv-1', '', futureTime, 'user-1');
      }).toThrow('Message content cannot be empty');
    });

    it('should reject whitespace-only content', () => {
      const futureTime = Date.now() + 60000;
      expect(() => {
        service.schedule('conv-1', '   ', futureTime, 'user-1');
      }).toThrow('Message content cannot be empty');
    });

    it('should trim content', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', '  Hello!  ', futureTime, 'user-1');
      expect(message.content).toBe('Hello!');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending message', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');

      const result = service.cancel(message.id);
      expect(result).toBe(true);
    });

    it('should not cancel a non-existent message', () => {
      const result = service.cancel('non-existent');
      expect(result).toBe(false);
    });

    it('should not cancel an already cancelled message', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');
      service.cancel(message.id);

      const result = service.cancel(message.id);
      expect(result).toBe(false);
    });

    it('should not cancel a sent message', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');
      service.markAsSent(message.id);

      const result = service.cancel(message.id);
      expect(result).toBe(false);
    });
  });

  describe('update', () => {
    it('should update message content', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');

      const updated = service.update(message.id, { content: 'Updated!' });
      expect(updated.content).toBe('Updated!');
    });

    it('should update scheduled time', () => {
      const futureTime = Date.now() + 60000;
      const newTime = Date.now() + 120000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');

      const updated = service.update(message.id, { scheduledAt: newTime });
      expect(updated.scheduledAt).toBe(newTime);
    });

    it('should reject update with past time', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');

      expect(() => {
        service.update(message.id, { scheduledAt: Date.now() - 1000 });
      }).toThrow('Scheduled time must be in the future');
    });

    it('should reject update with empty content', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');

      expect(() => {
        service.update(message.id, { content: '' });
      }).toThrow('Message content cannot be empty');
    });

    it('should throw for non-existent message', () => {
      expect(() => {
        service.update('non-existent', { content: 'test' });
      }).toThrow('Scheduled message not found');
    });

    it('should throw for non-pending message', () => {
      const futureTime = Date.now() + 60000;
      const message = service.schedule('conv-1', 'Hello!', futureTime, 'user-1');
      service.cancel(message.id);

      expect(() => {
        service.update(message.id, { content: 'test' });
      }).toThrow('Cannot update a message that is not pending');
    });
  });

  describe('getScheduled', () => {
    it('should return pending messages for a conversation', () => {
      const futureTime = Date.now() + 60000;
      service.schedule('conv-1', 'First', futureTime, 'user-1');
      service.schedule('conv-1', 'Second', futureTime + 1000, 'user-1');
      service.schedule('conv-2', 'Other', futureTime, 'user-1');

      const scheduled = service.getScheduled('conv-1');
      expect(scheduled).toHaveLength(2);
    });

    it('should not return cancelled messages', () => {
      const futureTime = Date.now() + 60000;
      const msg = service.schedule('conv-1', 'Hello', futureTime, 'user-1');
      service.cancel(msg.id);

      const scheduled = service.getScheduled('conv-1');
      expect(scheduled).toHaveLength(0);
    });

    it('should return messages sorted by scheduled time', () => {
      const base = Date.now() + 60000;
      service.schedule('conv-1', 'Later', base + 2000, 'user-1');
      service.schedule('conv-1', 'Earlier', base + 1000, 'user-1');

      const scheduled = service.getScheduled('conv-1');
      expect(scheduled[0]?.content).toBe('Earlier');
      expect(scheduled[1]?.content).toBe('Later');
    });
  });

  describe('getUpcoming', () => {
    it('should return upcoming messages for a user', () => {
      const futureTime = Date.now() + 60000;
      service.schedule('conv-1', 'Hello', futureTime, 'user-1');
      service.schedule('conv-2', 'World', futureTime + 1000, 'user-1');
      service.schedule('conv-1', 'Other user', futureTime, 'user-2');

      const upcoming = service.getUpcoming('user-1');
      expect(upcoming).toHaveLength(2);
    });
  });
});
