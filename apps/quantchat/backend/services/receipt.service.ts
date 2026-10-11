import type { PrismaClient } from '@prisma/client';
import { DeliveryReceiptService } from './delivery-receipt.service';
import { getPrivacyService, type PrivacyService } from './privacy.service';

export class ReceiptService {
  private readonly deliveryReceiptService: DeliveryReceiptService;
  private readonly privacy: PrivacyService;

  constructor(
    private readonly prisma: PrismaClient,
    privacy?: PrivacyService,
  ) {
    this.deliveryReceiptService = new DeliveryReceiptService(prisma as never);
    this.privacy = privacy ?? getPrivacyService(prisma);
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
  ): Promise<{ status: 'read'; readAt: string; suppressed?: boolean }> {
    // QC-F-042 reader-side gate: when the READER's showReadReceipts is off,
    // no read receipt is persisted (and the route must not fan a tick out —
    // it checks `suppressed`). The response still says 'read' because the
    // reader DID read the message locally; `suppressed: true` is the honest
    // signal that nothing was shared with the sender. Delivered receipts
    // are never gated — delivery is a transport fact, not a privacy act.
    // A prefs read failure resolves most-restrictive (showReadReceipts
    // false), so an error suppresses rather than leaks.
    const { prefs } = await this.privacy.resolve(recipientId);
    if (!prefs.showReadReceipts) {
      return { status: 'read', readAt: new Date().toISOString(), suppressed: true };
    }
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

    // QC-F-042 sender-side gate (reciprocity, the WhatsApp model): a
    // sender who turned their own read receipts off does not get to see
    // other people's read ticks either. Read rows are presented capped at
    // 'delivered' — the read timestamp is never exposed to this sender and
    // the overall status can never become 'read' for them. The rows
    // themselves are not altered; this is a per-viewer presentation gate.
    const { prefs: senderPrefs } = await this.privacy.resolve(senderId);
    const hideRead = !senderPrefs.showReadReceipts;

    let hasRead = false;
    let hasDelivered = false;

    const receipts = rows.map((r: any) => {
      const isRead = !!r.readAt && !hideRead;
      if (isRead) hasRead = true;
      else if (r.deliveredAt || r.readAt) hasDelivered = true;

      return {
        userId: r.userId,
        status: (isRead ? 'read' : 'delivered') as 'delivered' | 'read',
        timestamp: (isRead
          ? r.readAt
          : r.deliveredAt || r.readAt || new Date()
        ).toISOString(),
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
