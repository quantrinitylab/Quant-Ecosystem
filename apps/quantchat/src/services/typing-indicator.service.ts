// ============================================================================
// QuantChat - Typing Indicator Service
// Track typing state per conversation with automatic timeout
// ============================================================================

export interface TypingState {
  userId: string;
  conversationId: string;
  startedAt: number;
}

export class TypingIndicatorService {
  private typingUsers: Map<string, Map<string, TypingState>> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private timeoutMs: number;
  private changeHandlers: Set<(conversationId: string, userIds: string[]) => void> = new Set();

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  startTyping(userId: string, conversationId: string): void {
    const key = `${conversationId}:${userId}`;

    const existingTimer = this.timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    if (!this.typingUsers.has(conversationId)) {
      this.typingUsers.set(conversationId, new Map());
    }

    this.typingUsers.get(conversationId)!.set(userId, {
      userId,
      conversationId,
      startedAt: Date.now(),
    });

    const timer = setTimeout(() => {
      this.stopTyping(userId, conversationId);
    }, this.timeoutMs);

    this.timers.set(key, timer);
    this.notifyChange(conversationId);
  }

  stopTyping(userId: string, conversationId: string): void {
    const key = `${conversationId}:${userId}`;

    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(key);
    }

    const convTyping = this.typingUsers.get(conversationId);
    if (convTyping) {
      convTyping.delete(userId);
      if (convTyping.size === 0) {
        this.typingUsers.delete(conversationId);
      }
    }

    this.notifyChange(conversationId);
  }

  getTypingUsers(conversationId: string): string[] {
    const convTyping = this.typingUsers.get(conversationId);
    if (!convTyping) return [];
    return Array.from(convTyping.keys());
  }

  isTyping(userId: string, conversationId: string): boolean {
    return this.typingUsers.get(conversationId)?.has(userId) ?? false;
  }

  getTypingCount(conversationId: string): number {
    return this.typingUsers.get(conversationId)?.size ?? 0;
  }

  getTypingText(conversationId: string, currentUserId?: string): string {
    const users = this.getTypingUsers(conversationId).filter((u) => u !== currentUserId);
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0]} is typing...`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
    return `${users[0]} and ${users.length - 1} others are typing...`;
  }

  stopAllForUser(userId: string): void {
    for (const [conversationId, convTyping] of this.typingUsers) {
      if (convTyping.has(userId)) {
        this.stopTyping(userId, conversationId);
      }
    }
  }

  stopAllForConversation(conversationId: string): void {
    const convTyping = this.typingUsers.get(conversationId);
    if (!convTyping) return;

    for (const userId of convTyping.keys()) {
      const key = `${conversationId}:${userId}`;
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }

    this.typingUsers.delete(conversationId);
    this.notifyChange(conversationId);
  }

  onChange(handler: (conversationId: string, userIds: string[]) => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.typingUsers.clear();
  }

  private notifyChange(conversationId: string): void {
    const users = this.getTypingUsers(conversationId);
    for (const handler of this.changeHandlers) {
      handler(conversationId, users);
    }
  }
}
