// ============================================================================
// QuantChat - Message Reactions Service
// Emoji reactions with tracking, notifications, and frequency analytics
// ============================================================================

export interface Reaction {
  emoji: string;
  userId: string;
  timestamp: number;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface ReactionNotification {
  messageId: string;
  emoji: string;
  userId: string;
  timestamp: number;
}

export class MessageReactionsService {
  private reactions: Map<string, Reaction[]> = new Map();
  private userEmojiUsage: Map<string, Map<string, number>> = new Map();
  private notifications: Map<string, ReactionNotification[]> = new Map();

  addReaction(messageId: string, userId: string, emoji: string): Reaction {
    const messageReactions = this.reactions.get(messageId) ?? [];

    // Prevent duplicate reactions with the same emoji from the same user
    const existing = messageReactions.find((r) => r.userId === userId && r.emoji === emoji);
    if (existing) {
      return existing;
    }

    const reaction: Reaction = {
      emoji,
      userId,
      timestamp: Date.now(),
    };

    messageReactions.push(reaction);
    this.reactions.set(messageId, messageReactions);

    // Track emoji usage for analytics
    const userUsage = this.userEmojiUsage.get(userId) ?? new Map<string, number>();
    userUsage.set(emoji, (userUsage.get(emoji) ?? 0) + 1);
    this.userEmojiUsage.set(userId, userUsage);

    // Store notification for message owner
    const msgNotifications = this.notifications.get(messageId) ?? [];
    msgNotifications.push({
      messageId,
      emoji,
      userId,
      timestamp: reaction.timestamp,
    });
    this.notifications.set(messageId, msgNotifications);

    return reaction;
  }

  removeReaction(messageId: string, userId: string, emoji: string): boolean {
    const messageReactions = this.reactions.get(messageId);
    if (!messageReactions) {
      return false;
    }

    const index = messageReactions.findIndex((r) => r.userId === userId && r.emoji === emoji);

    if (index === -1) {
      return false;
    }

    messageReactions.splice(index, 1);

    if (messageReactions.length === 0) {
      this.reactions.delete(messageId);
    } else {
      this.reactions.set(messageId, messageReactions);
    }

    return true;
  }

  getReactions(messageId: string, currentUserId?: string): ReactionSummary[] {
    const messageReactions = this.reactions.get(messageId) ?? [];
    const emojiMap = new Map<string, { count: number; users: string[] }>();

    for (const reaction of messageReactions) {
      const entry = emojiMap.get(reaction.emoji) ?? { count: 0, users: [] };
      entry.count += 1;
      entry.users.push(reaction.userId);
      emojiMap.set(reaction.emoji, entry);
    }

    const summaries: ReactionSummary[] = [];
    for (const [emoji, data] of emojiMap.entries()) {
      summaries.push({
        emoji,
        count: data.count,
        users: data.users,
        hasReacted: currentUserId ? data.users.includes(currentUserId) : false,
      });
    }

    return summaries;
  }

  getMostUsedEmojis(userId: string, limit: number): string[] {
    const userUsage = this.userEmojiUsage.get(userId);
    if (!userUsage) {
      return [];
    }

    return Array.from(userUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([emoji]) => emoji);
  }

  getReactionNotifications(userId: string): ReactionNotification[] {
    const allNotifications: ReactionNotification[] = [];
    for (const notifications of this.notifications.values()) {
      for (const notification of notifications) {
        if (notification.userId !== userId) {
          allNotifications.push(notification);
        }
      }
    }
    return allNotifications.sort((a, b) => b.timestamp - a.timestamp);
  }
}
