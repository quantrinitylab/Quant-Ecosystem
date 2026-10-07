import type { TypedEventEmitter, MessageTypingEvent, RealtimeEvent } from '@quant/realtime';

export interface TypingEventEmitter {
  emit(eventType: 'message:typing', event: RealtimeEvent<MessageTypingEvent>): void;
}

interface TypingState {
  userId: string;
  startedAt: number;
  timeout: NodeJS.Timeout;
}

const TYPING_TIMEOUT_MS = 5000;

export class TypingService {
  private typingUsers: Map<string, Map<string, TypingState>> = new Map();

  constructor(private readonly eventEmitter?: TypingEventEmitter) {}

  setTyping(conversationId: string, userId: string, isTyping: boolean): void {
    if (!this.typingUsers.has(conversationId)) {
      this.typingUsers.set(conversationId, new Map());
    }

    const conversationTyping = this.typingUsers.get(conversationId)!;

    if (isTyping) {
      // Clear existing timeout for this user
      const existing = conversationTyping.get(userId);
      if (existing) {
        clearTimeout(existing.timeout);
      }

      // Set auto-clear timeout
      const timeout = setTimeout(() => {
        this.clearTyping(conversationId, userId);
      }, TYPING_TIMEOUT_MS);

      conversationTyping.set(userId, {
        userId,
        startedAt: Date.now(),
        timeout,
      });
    } else {
      this.clearTyping(conversationId, userId);
    }

    // Emit typing event
    if (this.eventEmitter) {
      this.eventEmitter.emit('message:typing', {
        id: `evt_${Date.now()}_${userId}`,
        type: 'message:typing',
        channel: `conversation:${conversationId}`,
        payload: {
          conversationId,
          userId,
          isTyping,
        },
        senderId: userId,
        timestamp: Date.now(),
      });
    }
  }

  getTypingUsers(conversationId: string): string[] {
    const conversationTyping = this.typingUsers.get(conversationId);
    if (!conversationTyping) return [];
    return Array.from(conversationTyping.keys());
  }

  startTyping(conversationId: string, userId: string): void {
    this.setTyping(conversationId, userId, true);
  }

  stopTyping(conversationId: string, userId: string): void {
    this.setTyping(conversationId, userId, false);
  }

  private clearTyping(conversationId: string, userId: string): void {
    const conversationTyping = this.typingUsers.get(conversationId);
    if (!conversationTyping) return;

    const state = conversationTyping.get(userId);
    if (state) {
      clearTimeout(state.timeout);
      conversationTyping.delete(userId);
    }

    if (conversationTyping.size === 0) {
      this.typingUsers.delete(conversationId);
    }
  }

  /** Clean up all timers on service shutdown */
  destroy(): void {
    for (const conversationTyping of this.typingUsers.values()) {
      for (const state of conversationTyping.values()) {
        clearTimeout(state.timeout);
      }
    }
    this.typingUsers.clear();
  }
}
