import type { PrismaClient } from '@prisma/client';
import { DeliveryReceiptService } from './delivery-receipt.service';

export class ReceiptService {
  private readonly deliveryReceiptService: DeliveryReceiptService;

  constructor(private readonly prisma: PrismaClient) {
    this.deliveryReceiptService = new DeliveryReceiptService(prisma as never);
  }

  async markMessageDelivered(
    messageId: string,
    recipientId: string,
  ): Promise<{ status: 'delivered'; deliveredAt: string }> {
    const receipt = await this.deliveryReceiptService.recordDelivered(messageId, recipientId);
    return {
      status: 'delivered',
      deliveredAt: (receipt.deliveredAt ?? new Date()).toISOString(),
    };
  }

  async markMessageRead(
    messageId: string,
    recipientId: string,
  ): Promise<{ status: 'read'; readAt: string }> {
    const receipt = await this.deliveryReceiptService.recordRead(messageId, recipientId);
    return {
      status: 'read',
      readAt: (receipt.readAt ?? new Date()).toISOString(),
    };
  }

  async getMessageReceiptStatus(
    messageId: string,
    senderId: string,
  ): Promise<{
    status: 'sent' | 'delivered' | 'read';
    receipts: Array<{ userId: string; status: 'delivered' | 'read'; timestamp: string }>;
  }> {
    const delegate = (this.prisma as any).messageDelivery;
    if (!delegate?.findMany) {
      return { status: 'sent', receipts: [] };
    }

    const rows = await delegate.findMany({
      where: { messageId },
    });

    if (!rows || rows.length === 0) {
      return { status: 'sent', receipts: [] };
    }

    let hasRead = false;
    let hasDelivered = false;

    const receipts = rows.map((r: any) => {
      const isRead = !!r.readAt;
      if (isRead) hasRead = true;
      else if (r.deliveredAt) hasDelivered = true;

      return {
        userId: r.userId,
        status: (isRead ? 'read' : 'delivered') as 'delivered' | 'read',
        timestamp: (r.readAt || r.deliveredAt || new Date()).toISOString(),
      };
    });

    let overallStatus: 'sent' | 'delivered' | 'read' = 'sent';
    if (hasRead) overallStatus = 'read';
    else if (hasDelivered) overallStatus = 'delivered';

    return {
      status: overallStatus,
      receipts,
    };
  }
}
