import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { TypedEventEmitter, MessageReadEvent, RealtimeEvent } from '@quant/realtime';

export type DeliveryStatus = 'sent' | 'delivered' | 'read';

export interface MessageDeliveryInfo {
  messageId: string;
  status: DeliveryStatus;
  deliveredAt?: Date;
  readAt?: Date;
}

export interface DeliveryEventEmitter {
  emit(eventType: 'message:read', event: RealtimeEvent<MessageReadEvent>): void;
}

export class DeliveryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter?: DeliveryEventEmitter,
  ) {}

  async markDelivered(messageId: string, userId: string): Promise<MessageDeliveryInfo> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // Verify user is in the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // Cannot mark own messages as delivered
    if (message.senderId === userId) {
      throw createAppError('Cannot mark own message as delivered', 400, 'OWN_MESSAGE');
    }

    // Update metadata with delivery info
    const metadata = (message.metadata as Record<string, unknown>) ?? {};
    const deliveries = (metadata['deliveries'] as Record<string, unknown>) ?? {};

    if (deliveries[userId]) {
      // Already delivered, return current status
      return {
        messageId,
        status: 'delivered',
        deliveredAt: new Date((deliveries[userId] as Record<string, string>)['deliveredAt'] ?? ''),
      };
    }

    deliveries[userId] = { deliveredAt: new Date().toISOString() };
    metadata['deliveries'] = deliveries;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });

    return {
      messageId,
      status: 'delivered',
      deliveredAt: new Date(),
    };
  }

  async markRead(messageId: string, userId: string): Promise<MessageDeliveryInfo> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    if (message.senderId === userId) {
      throw createAppError('Cannot mark own message as read', 400, 'OWN_MESSAGE');
    }

    const metadata = (message.metadata as Record<string, unknown>) ?? {};
    const deliveries = (metadata['deliveries'] as Record<string, unknown>) ?? {};
    const userDelivery = (deliveries[userId] as Record<string, string>) ?? {};

    // Check if already read to prevent duplicate events
    if (userDelivery['readAt']) {
      return {
        messageId,
        status: 'read',
        deliveredAt: userDelivery['deliveredAt']
          ? new Date(userDelivery['deliveredAt'])
          : undefined,
        readAt: new Date(userDelivery['readAt']),
      };
    }

    const now = new Date();
    deliveries[userId] = {
      deliveredAt: userDelivery['deliveredAt'] ?? now.toISOString(),
      readAt: now.toISOString(),
    };
    metadata['deliveries'] = deliveries;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });

    // Update lastReadAt on the member record
    await this.prisma.conversationMember.updateMany({
      where: { conversationId: message.conversationId, userId },
      data: { lastReadAt: now },
    });

    // Emit WebSocket event
    if (this.eventEmitter) {
      this.eventEmitter.emit('message:read', {
        id: `evt_${Date.now()}`,
        type: 'message:read',
        channel: `conversation:${message.conversationId}`,
        payload: {
          conversationId: message.conversationId,
          userId,
          lastReadMessageId: messageId,
        },
        senderId: userId,
        timestamp: Date.now(),
      });
    }

    return {
      messageId,
      status: 'read',
      deliveredAt: userDelivery['deliveredAt'] ? new Date(userDelivery['deliveredAt']) : now,
      readAt: now,
    };
  }

  async getDeliveryStatus(messageId: string): Promise<{
    messageId: string;
    aggregateStatus: DeliveryStatus;
    recipients: Record<string, { status: DeliveryStatus; deliveredAt?: string; readAt?: string }>;
  }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    const metadata = (message.metadata as Record<string, unknown>) ?? {};
    const deliveries = (metadata['deliveries'] as Record<string, Record<string, string>>) ?? {};

    const recipients: Record<
      string,
      { status: DeliveryStatus; deliveredAt?: string; readAt?: string }
    > = {};
    let allRead = true;
    let allDelivered = true;

    for (const [uid, info] of Object.entries(deliveries)) {
      if (info['readAt']) {
        recipients[uid] = {
          status: 'read',
          deliveredAt: info['deliveredAt'],
          readAt: info['readAt'],
        };
      } else if (info['deliveredAt']) {
        recipients[uid] = { status: 'delivered', deliveredAt: info['deliveredAt'] };
        allRead = false;
      } else {
        allRead = false;
        allDelivered = false;
      }
    }

    let aggregateStatus: DeliveryStatus = 'sent';
    if (Object.keys(recipients).length > 0) {
      if (allRead) aggregateStatus = 'read';
      else if (allDelivered) aggregateStatus = 'delivered';
    }

    return { messageId, aggregateStatus, recipients };
  }
}
