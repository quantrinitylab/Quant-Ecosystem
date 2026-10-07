// ============================================================================
// QuantChat - Pinned Messages Service
// Pin/unpin management with per-conversation limits
// ============================================================================

export interface PinnedMessage {
  messageId: string;
  pinnedBy: string;
  pinnedAt: number;
  content: string;
}

export class PinnedMessagesService {
  private static readonly MAX_PINS_PER_CONVERSATION = 50;
  private pinnedMessages: Map<string, PinnedMessage[]> = new Map();
  private messageToConversation: Map<string, string> = new Map();
  private pinCounter: number = 0;

  pin(conversationId: string, messageId: string, userId: string, content: string): PinnedMessage {
    const pins = this.pinnedMessages.get(conversationId) ?? [];

    // Check if already pinned
    const existing = pins.find((p) => p.messageId === messageId);
    if (existing) {
      return existing;
    }

    // Enforce max pins limit
    if (pins.length >= PinnedMessagesService.MAX_PINS_PER_CONVERSATION) {
      throw new Error(
        `Maximum of ${PinnedMessagesService.MAX_PINS_PER_CONVERSATION} pinned messages per conversation`,
      );
    }

    const pinnedMessage: PinnedMessage = {
      messageId,
      pinnedBy: userId,
      pinnedAt: Date.now() + this.pinCounter++,
      content,
    };

    pins.push(pinnedMessage);
    this.pinnedMessages.set(conversationId, pins);
    this.messageToConversation.set(messageId, conversationId);

    return pinnedMessage;
  }

  unpin(conversationId: string, messageId: string): boolean {
    const pins = this.pinnedMessages.get(conversationId);
    if (!pins) {
      return false;
    }

    const index = pins.findIndex((p) => p.messageId === messageId);
    if (index === -1) {
      return false;
    }

    pins.splice(index, 1);
    this.pinnedMessages.set(conversationId, pins);
    this.messageToConversation.delete(messageId);

    return true;
  }

  getPinned(conversationId: string): PinnedMessage[] {
    const pins = this.pinnedMessages.get(conversationId) ?? [];
    // Return sorted by most recently pinned first
    return [...pins].sort((a, b) => b.pinnedAt - a.pinnedAt);
  }

  isPinned(messageId: string): boolean {
    return this.messageToConversation.has(messageId);
  }

  getPinCount(conversationId: string): number {
    const pins = this.pinnedMessages.get(conversationId);
    return pins ? pins.length : 0;
  }

  getMaxPins(): number {
    return PinnedMessagesService.MAX_PINS_PER_CONVERSATION;
  }
}
