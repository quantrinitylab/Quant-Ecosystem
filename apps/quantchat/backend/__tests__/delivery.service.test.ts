import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeliveryService } from '../services/delivery.service';

function createMockPrisma() {
  return {
    message: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    conversationMember: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('DeliveryService', () => {
  let service: DeliveryService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let mockEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createMockPrisma();
    mockEmitter = { emit: vi.fn() };
    service = new DeliveryService(prisma as never, mockEmitter);
  });

  describe('markDelivered', () => {
    it('marks a message as delivered and stores delivery info', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        userId: 'user-recipient',
      });
      prisma.message.update.mockResolvedValue({});

      const result = await service.markDelivered('msg-1', 'user-recipient');

      expect(result.messageId).toBe('msg-1');
      expect(result.status).toBe('delivered');
      expect(result.deliveredAt).toBeInstanceOf(Date);
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: {
          metadata: {
            deliveries: {
              'user-recipient': { deliveredAt: expect.any(String) },
            },
          },
        },
      });
    });

    it('throws MESSAGE_NOT_FOUND for non-existent message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.markDelivered('missing', 'user-1')).rejects.toThrow('Message not found');
    });

    it('throws NOT_A_MEMBER if user is not in the conversation', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.markDelivered('msg-1', 'user-outsider')).rejects.toThrow(
        'User is not a member of this conversation',
      );
    });

    it('throws OWN_MESSAGE when trying to mark own message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });

      await expect(service.markDelivered('msg-1', 'user-sender')).rejects.toThrow(
        'Cannot mark own message as delivered',
      );
    });

    it('returns existing status if already delivered', async () => {
      const existingDeliveredAt = '2024-01-01T00:00:00.000Z';
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {
          deliveries: {
            'user-recipient': { deliveredAt: existingDeliveredAt },
          },
        },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });

      const result = await service.markDelivered('msg-1', 'user-recipient');

      expect(result.status).toBe('delivered');
      // Should not call update since already delivered
      expect(prisma.message.update).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('marks a message as read and emits WebSocket event', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.message.update.mockResolvedValue({});
      prisma.conversationMember.updateMany.mockResolvedValue({});

      const result = await service.markRead('msg-1', 'user-reader');

      expect(result.messageId).toBe('msg-1');
      expect(result.status).toBe('read');
      expect(result.readAt).toBeInstanceOf(Date);
      expect(mockEmitter.emit).toHaveBeenCalledWith('message:read', {
        id: expect.any(String),
        type: 'message:read',
        channel: 'conversation:conv-1',
        payload: {
          conversationId: 'conv-1',
          userId: 'user-reader',
          lastReadMessageId: 'msg-1',
        },
        senderId: 'user-reader',
        timestamp: expect.any(Number),
      });
    });

    it('prevents duplicate read events', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {
          deliveries: {
            'user-reader': {
              deliveredAt: '2024-01-01T00:00:00.000Z',
              readAt: '2024-01-01T01:00:00.000Z',
            },
          },
        },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });

      const result = await service.markRead('msg-1', 'user-reader');

      expect(result.status).toBe('read');
      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws OWN_MESSAGE when trying to mark own message as read', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });

      await expect(service.markRead('msg-1', 'user-sender')).rejects.toThrow(
        'Cannot mark own message as read',
      );
    });

    it('updates lastReadAt on the conversation member', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.message.update.mockResolvedValue({});
      prisma.conversationMember.updateMany.mockResolvedValue({});

      await service.markRead('msg-1', 'user-reader');

      expect(prisma.conversationMember.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', userId: 'user-reader' },
        data: { lastReadAt: expect.any(Date) },
      });
    });
  });

  describe('getDeliveryStatus', () => {
    it('returns aggregate status as sent when no deliveries', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        metadata: {},
      });

      const result = await service.getDeliveryStatus('msg-1');

      expect(result.aggregateStatus).toBe('sent');
      expect(result.recipients).toEqual({});
    });

    it('returns aggregate status as delivered when all delivered but not read', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        metadata: {
          deliveries: {
            'user-a': { deliveredAt: '2024-01-01T00:00:00.000Z' },
            'user-b': { deliveredAt: '2024-01-01T00:01:00.000Z' },
          },
        },
      });

      const result = await service.getDeliveryStatus('msg-1');

      expect(result.aggregateStatus).toBe('delivered');
      expect(result.recipients['user-a']!.status).toBe('delivered');
      expect(result.recipients['user-b']!.status).toBe('delivered');
    });

    it('returns aggregate status as read when all have read', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        metadata: {
          deliveries: {
            'user-a': { deliveredAt: '2024-01-01', readAt: '2024-01-02' },
            'user-b': { deliveredAt: '2024-01-01', readAt: '2024-01-02' },
          },
        },
      });

      const result = await service.getDeliveryStatus('msg-1');

      expect(result.aggregateStatus).toBe('read');
    });

    it('throws MESSAGE_NOT_FOUND for non-existent message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.getDeliveryStatus('missing')).rejects.toThrow('Message not found');
    });
  });
});
