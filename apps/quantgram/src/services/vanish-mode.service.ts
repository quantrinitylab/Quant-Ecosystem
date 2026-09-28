// ============================================================================
// QuantNeon - Vanish Mode Service
// Self-destructing messages after being seen
// ============================================================================

export interface VanishSession {
  conversationId: string;
  startedAt: number;
  messageCount: number;
}

export class VanishModeService {
  private sessions: Map<string, VanishSession> = new Map();
  private seenMessages: Map<string, Set<string>> = new Map();
  private ttl = 5000; // Default 5 seconds after seen

  enable(conversationId: string): VanishSession {
    const existing = this.sessions.get(conversationId);
    if (existing) {
      return { ...existing };
    }

    const session: VanishSession = {
      conversationId,
      startedAt: Date.now(),
      messageCount: 0,
    };

    this.sessions.set(conversationId, session);
    this.seenMessages.set(conversationId, new Set());
    return { ...session };
  }

  disable(conversationId: string): void {
    this.sessions.delete(conversationId);
    this.seenMessages.delete(conversationId);
  }

  isEnabled(conversationId: string): boolean {
    return this.sessions.has(conversationId);
  }

  onMessageSeen(conversationId: string, messageId: string): boolean {
    const session = this.sessions.get(conversationId);
    if (!session) {
      return false;
    }

    const seen = this.seenMessages.get(conversationId);
    if (!seen) {
      return false;
    }

    if (seen.has(messageId)) {
      return false;
    }

    seen.add(messageId);
    session.messageCount += 1;

    // Message will be deleted after TTL
    return true;
  }

  getActiveSessions(): VanishSession[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }

  getMessageTTL(): number {
    return this.ttl;
  }

  setMessageTTL(ms: number): void {
    if (ms > 0) {
      this.ttl = ms;
    }
  }
}
