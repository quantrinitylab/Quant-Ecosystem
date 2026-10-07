import { describe, it, expect, beforeEach } from 'vitest';
import { ReadReceiptsService } from '../services/read-receipts.service';

describe('ReadReceiptsService', () => {
  let service: ReadReceiptsService;

  beforeEach(() => {
    service = new ReadReceiptsService();
  });

  describe('state transitions', () => {
    it('should start in sending state', () => {
      service.registerMessage('msg-1', 'conv-1');
      expect(service.getStatus('msg-1')).toBe('sending');
    });

    it('should transition sending -> sent', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      expect(service.getStatus('msg-1')).toBe('sent');
    });

    it('should transition to delivered when user receives', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      service.markAsDelivered('msg-1', 'user-2');
      expect(service.getStatus('msg-1')).toBe('delivered');
    });

    it('should transition to read when all users read', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      service.markAsDelivered('msg-1', 'user-2');
      service.markAsRead('msg-1', 'user-2');
      expect(service.getStatus('msg-1')).toBe('read');
    });

    it('should handle failed state', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsFailed('msg-1');
      expect(service.getStatus('msg-1')).toBe('failed');
    });

    it('should allow retry from failed to sent', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsFailed('msg-1');
      service.markAsSent('msg-1');
      expect(service.getStatus('msg-1')).toBe('sent');
    });
  });

  describe('markAsDelivered', () => {
    it('should not downgrade from read to delivered', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      service.markAsRead('msg-1', 'user-2');
      const receipt = service.markAsDelivered('msg-1', 'user-2');
      expect(receipt.status).toBe('read');
    });
  });

  describe('markAsRead', () => {
    it('should not duplicate read receipts', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      service.markAsRead('msg-1', 'user-2');
      const receipt = service.markAsRead('msg-1', 'user-2');
      expect(receipt.status).toBe('read');

      const readBy = service.getReadBy('msg-1');
      expect(readBy).toHaveLength(1);
    });
  });

  describe('getReadBy', () => {
    it('should return list of users who read the message', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      service.markAsRead('msg-1', 'user-2');
      service.markAsRead('msg-1', 'user-3');

      const readBy = service.getReadBy('msg-1');
      expect(readBy).toHaveLength(2);
      expect(readBy.map((r) => r.userId)).toContain('user-2');
      expect(readBy.map((r) => r.userId)).toContain('user-3');
    });

    it('should return empty array for unread message', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.markAsSent('msg-1');
      expect(service.getReadBy('msg-1')).toHaveLength(0);
    });

    it('should return empty array for unknown message', () => {
      expect(service.getReadBy('unknown')).toHaveLength(0);
    });
  });

  describe('getConversationReadState', () => {
    it('should return read state for all messages in a conversation', () => {
      service.registerMessage('msg-1', 'conv-1');
      service.registerMessage('msg-2', 'conv-1');
      service.markAsSent('msg-1');
      service.markAsRead('msg-1', 'user-2');
      service.markAsSent('msg-2');

      const state = service.getConversationReadState('conv-1', 'user-1');
      expect(state.get('msg-1')).toBe('read');
      expect(state.get('msg-2')).toBe('sent');
    });
  });

  describe('getStatus', () => {
    it('should return sending for unknown messages', () => {
      expect(service.getStatus('unknown')).toBe('sending');
    });
  });

  describe('unregistered message handling', () => {
    it('should throw when marking unregistered message as sent', () => {
      expect(() => service.markAsSent('unregistered')).toThrow(
        'Message "unregistered" has not been registered',
      );
    });

    it('should throw when marking unregistered message as delivered', () => {
      expect(() => service.markAsDelivered('unregistered', 'user-1')).toThrow(
        'Message "unregistered" has not been registered',
      );
    });

    it('should throw when marking unregistered message as read', () => {
      expect(() => service.markAsRead('unregistered', 'user-1')).toThrow(
        'Message "unregistered" has not been registered',
      );
    });

    it('should throw when marking unregistered message as failed', () => {
      expect(() => service.markAsFailed('unregistered')).toThrow(
        'Message "unregistered" has not been registered',
      );
    });
  });
});
