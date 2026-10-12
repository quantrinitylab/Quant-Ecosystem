import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { DeliveryReceiptService } from './delivery-receipt.service';
import { getPrivacyService, type PrivacyService } from './privacy.service';

interface MessageRef {
  conversationId: string;
  senderId: string;
}

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

  // -------------------------------------------------------------------------
  // QC-F-042 amend (PR #956 review gap 1) — object authorization.
  //
  // QC-F-018 proved the caller's IDENTITY from the JWT, but nothing proved
  // the caller is allowed to touch THIS message: any authenticated user
  // could POST read/delivered receipts for arbitrary message ids (forging
  // read ticks that the routes then fan out live) and could query any
  // message's per-user receipt rows. The checks below mirror the F-038
  // convention (404 MESSAGE_NOT_FOUND, then 403 NOT_A_MEMBER):
  //   - mark* (delivered/read): the caller must be an ACTIVE member of the
  //     message's conversation and must not be the message's sender (the
  //     sender is never a recipient of their own message — a self-ack is a
  //     forged tick).
  //   - status: the caller must be an active member AND the message's
  //     sender — receipt rows are the sender's delivery view.
  // A store that cannot answer (delegate missing) fails CLOSED with 503
  // instead of silently skipping authorization — the same 'unavailable'
  // posture checkCanMessage takes on the whoCanMessage action surface.
  // -------------------------------------------------------------------------

  private async loadMessageRef(messageId: string): Promise<MessageRef> {
    const delegate = (
      this.prisma as unknown as {
        message?: {
          findUnique: (args: unknown) => Promise<MessageRef | null>;
        };
      }
    ).message;
    if (!delegate?.findUnique) {
      throw createAppError(
        'Receipt authorization store unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }
    const row = await delegate.findUnique({
      where: { id: messageId },
      select: { conversationId: true, senderId: true },
    });
    if (!row) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }
    return row;
  }

  private async assertActiveMember(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const delegate = (
      this.prisma as unknown as {
        conversationMember?: {
          findFirst: (args: unknown) => Promise<unknown>;
        };
      }
    ).conversationMember;
    if (!delegate?.findFirst) {
      throw createAppError(
        'Receipt authorization store unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }
    const membership = await delegate.findFirst({
      where: { conversationId, userId, leftAt: null },
    });
    if (!membership) {
      throw createAppError(
        'User is not a member of this conversation',
        403,
        'NOT_A_MEMBER',
      );
    }
  }

  /** Authorization for recording a receipt: member + not the sender. */
  private async authorizeRecipient(
    messageId: string,
    userId: string,
  ): Promise<MessageRef> {
    const message = await this.loadMessageRef(messageId);
    await this.assertActiveMember(message.conversationId, userId);
    if (message.senderId === userId) {
      throw createAppError(
        'The sender cannot record receipts on their own message',
        403,
        'NOT_A_RECIPIENT',
      );
    }
    return message;
  }

  /** Authorization for reading receipt status: member + the sender. */
  private async authorizeStatusViewer(
    messageId: string,
    userId: string,
  ): Promise<MessageRef> {
    const message = await this.loadMessageRef(messageId);
    await this.assertActiveMember(message.conversationId, userId);
    if (message.senderId !== userId) {
      throw createAppError(
        'Only the message sender can view its receipt status',
        403,
        'NOT_MESSAGE_SENDER',
      );
    }
    return message;
  }

  async markMessageDelivered(
    messageId: string,
    recipientId: string,
  ): Promise<{ status: 'delivered'; deliveredAt: string }> {
    await this.authorizeRecipient(messageId, recipientId);
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
    await this.authorizeRecipient(messageId, recipientId);
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
    await this.authorizeStatusViewer(messageId, senderId);

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
