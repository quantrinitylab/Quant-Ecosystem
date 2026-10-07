// ============================================================================
// QuantChat - Read Receipts Service
// Message delivery status tracking with state machine transitions
// ============================================================================

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ReadReceipt {
  messageId: string;
  userId: string;
  status: DeliveryStatus;
  timestamp: number;
}

interface MessageState {
  status: DeliveryStatus;
  receipts: Map<string, ReadReceipt>;
  conversationId: string;
}

const STATUS_ORDER: Record<DeliveryStatus, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: -1,
};

export class ReadReceiptsService {
  private messages: Map<string, MessageState> = new Map();
  private conversationMessages: Map<string, Set<string>> = new Map();

  registerMessage(messageId: string, conversationId: string): void {
    this.messages.set(messageId, {
      status: 'sending',
      receipts: new Map(),
      conversationId,
    });

    const convMessages = this.conversationMessages.get(conversationId) ?? new Set();
    convMessages.add(messageId);
    this.conversationMessages.set(conversationId, convMessages);
  }

  markAsSent(messageId: string): ReadReceipt {
    const state = this.getRegisteredState(messageId);

    if (state.status === 'failed') {
      // Allow retry from failed
      state.status = 'sent';
    } else if (STATUS_ORDER[state.status] < STATUS_ORDER['sent']) {
      state.status = 'sent';
    }

    const receipt: ReadReceipt = {
      messageId,
      userId: '',
      status: 'sent',
      timestamp: Date.now(),
    };

    return receipt;
  }

  markAsDelivered(messageId: string, userId: string): ReadReceipt {
    const state = this.getRegisteredState(messageId);

    const receipt: ReadReceipt = {
      messageId,
      userId,
      status: 'delivered',
      timestamp: Date.now(),
    };

    const existingReceipt = state.receipts.get(userId);
    if (existingReceipt && STATUS_ORDER[existingReceipt.status] >= STATUS_ORDER['delivered']) {
      return existingReceipt;
    }

    state.receipts.set(userId, receipt);
    this.updateAggregateStatus(messageId);

    return receipt;
  }

  markAsRead(messageId: string, userId: string): ReadReceipt {
    const state = this.getRegisteredState(messageId);

    const receipt: ReadReceipt = {
      messageId,
      userId,
      status: 'read',
      timestamp: Date.now(),
    };

    const existingReceipt = state.receipts.get(userId);
    if (existingReceipt && STATUS_ORDER[existingReceipt.status] >= STATUS_ORDER['read']) {
      return existingReceipt;
    }

    state.receipts.set(userId, receipt);
    this.updateAggregateStatus(messageId);

    return receipt;
  }

  markAsFailed(messageId: string): ReadReceipt {
    const state = this.getRegisteredState(messageId);
    state.status = 'failed';

    return {
      messageId,
      userId: '',
      status: 'failed',
      timestamp: Date.now(),
    };
  }

  getStatus(messageId: string): DeliveryStatus {
    const state = this.messages.get(messageId);
    if (!state) {
      return 'sending';
    }
    return state.status;
  }

  getReadBy(messageId: string): ReadReceipt[] {
    const state = this.messages.get(messageId);
    if (!state) {
      return [];
    }

    return Array.from(state.receipts.values()).filter((receipt) => receipt.status === 'read');
  }

  getConversationReadState(conversationId: string, _userId: string): Map<string, DeliveryStatus> {
    const messageIds = this.conversationMessages.get(conversationId) ?? new Set();
    const result = new Map<string, DeliveryStatus>();

    for (const messageId of messageIds) {
      result.set(messageId, this.getStatus(messageId));
    }

    return result;
  }

  private getRegisteredState(messageId: string): MessageState {
    const state = this.messages.get(messageId);
    if (!state) {
      throw new Error(
        `Message "${messageId}" has not been registered. Call registerMessage() before tracking delivery status.`,
      );
    }
    return state;
  }

  private updateAggregateStatus(messageId: string): void {
    const state = this.messages.get(messageId);
    if (!state || state.receipts.size === 0) {
      return;
    }

    let allRead = true;
    let allDelivered = true;

    for (const receipt of state.receipts.values()) {
      if (receipt.status !== 'read') {
        allRead = false;
      }
      if (receipt.status !== 'read' && receipt.status !== 'delivered') {
        allDelivered = false;
      }
    }

    if (allRead) {
      state.status = 'read';
    } else if (allDelivered) {
      state.status = 'delivered';
    } else {
      state.status = 'sent';
    }
  }
}
