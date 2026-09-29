// ============================================================================
// QuantNeon - Close Friends Service
// Manages close friends list for exclusive sharing
// ============================================================================

export interface CloseFriend {
  userId: string;
  addedAt: number;
}

export class CloseFriendsService {
  private friends: Map<string, CloseFriend> = new Map();
  private interactionCounts: Map<string, number> = new Map();

  add(userId: string): CloseFriend {
    const existing = this.friends.get(userId);
    if (existing) {
      return { ...existing };
    }

    const friend: CloseFriend = {
      userId,
      addedAt: Date.now(),
    };

    this.friends.set(userId, friend);
    return { ...friend };
  }

  remove(userId: string): boolean {
    return this.friends.delete(userId);
  }

  getList(): CloseFriend[] {
    return Array.from(this.friends.values()).map((f) => ({ ...f }));
  }

  isCloseFriend(userId: string): boolean {
    return this.friends.has(userId);
  }

  getCount(): number {
    return this.friends.size;
  }

  shareToCloseFriends(postId: string): { sharedWith: number } {
    // In a real implementation, this would distribute the post to all close friends
    void postId;
    return { sharedWith: this.friends.size };
  }

  getSuggestions(limit: number): string[] {
    // Sort by interaction frequency and filter out existing friends
    const entries = Array.from(this.interactionCounts.entries())
      .filter(([userId]) => !this.friends.has(userId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([userId]) => userId);

    return entries;
  }

  recordInteraction(userId: string): void {
    const current = this.interactionCounts.get(userId) ?? 0;
    this.interactionCounts.set(userId, current + 1);
  }
}
