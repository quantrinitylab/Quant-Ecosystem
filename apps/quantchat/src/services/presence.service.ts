// ============================================================================
// QuantChat - Presence Service
// Client-side user presence tracking and status management
// ============================================================================

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline' | 'invisible';

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeen: number;
  customStatus?: string;
  activeConversationId?: string;
  deviceType?: 'mobile' | 'desktop' | 'web';
}

export interface PresenceSubscription {
  subscriberId: string;
  targetUserId: string;
  subscribedAt: number;
}

export class PresenceService {
  private presenceMap: Map<string, UserPresence> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();
  private reverseSubscriptions: Map<string, Set<string>> = new Map();
  private statusChangeHandlers: Set<(userId: string, presence: UserPresence) => void> = new Set();
  private awayTimeoutMs: number;
  private offlineTimeoutMs: number;

  constructor(options?: { awayTimeoutMs?: number; offlineTimeoutMs?: number }) {
    this.awayTimeoutMs = options?.awayTimeoutMs ?? 300000;
    this.offlineTimeoutMs = options?.offlineTimeoutMs ?? 600000;
  }

  setOnline(userId: string, deviceType?: 'mobile' | 'desktop' | 'web'): UserPresence {
    const existing = this.presenceMap.get(userId);
    const presence: UserPresence = {
      userId,
      status: existing?.status === 'invisible' ? 'invisible' : 'online',
      lastSeen: Date.now(),
      customStatus: existing?.customStatus,
      deviceType: deviceType ?? existing?.deviceType,
    };

    this.presenceMap.set(userId, presence);
    this.notifyChange(userId, presence);
    return presence;
  }

  setOffline(userId: string): UserPresence | null {
    const existing = this.presenceMap.get(userId);
    if (!existing) return null;

    existing.status = 'offline';
    existing.lastSeen = Date.now();
    this.notifyChange(userId, existing);
    return existing;
  }

  setStatus(userId: string, status: PresenceStatus, customStatus?: string): UserPresence | null {
    const existing = this.presenceMap.get(userId);
    if (!existing) return null;

    existing.status = status;
    if (customStatus !== undefined) existing.customStatus = customStatus;
    existing.lastSeen = Date.now();
    this.notifyChange(userId, existing);
    return existing;
  }

  setActiveConversation(userId: string, conversationId: string | null): void {
    const existing = this.presenceMap.get(userId);
    if (!existing) return;

    existing.activeConversationId = conversationId ?? undefined;
    existing.lastSeen = Date.now();
  }

  heartbeat(userId: string): void {
    const existing = this.presenceMap.get(userId);
    if (!existing) return;

    existing.lastSeen = Date.now();
    if (existing.status === 'away') {
      existing.status = 'online';
      this.notifyChange(userId, existing);
    }
  }

  getPresence(userId: string): UserPresence | null {
    return this.presenceMap.get(userId) ?? null;
  }

  getBulkPresence(userIds: string[]): Map<string, UserPresence> {
    const result = new Map<string, UserPresence>();
    for (const userId of userIds) {
      const presence = this.presenceMap.get(userId);
      if (presence) result.set(userId, presence);
    }
    return result;
  }

  getOnlineUsers(): UserPresence[] {
    const online: UserPresence[] = [];
    for (const presence of this.presenceMap.values()) {
      if (presence.status === 'online' || presence.status === 'busy') {
        online.push(presence);
      }
    }
    return online;
  }

  getOnlineCount(): number {
    return this.getOnlineUsers().length;
  }

  subscribe(subscriberId: string, targetUserId: string): () => void {
    if (!this.subscriptions.has(subscriberId)) {
      this.subscriptions.set(subscriberId, new Set());
    }
    this.subscriptions.get(subscriberId)!.add(targetUserId);

    if (!this.reverseSubscriptions.has(targetUserId)) {
      this.reverseSubscriptions.set(targetUserId, new Set());
    }
    this.reverseSubscriptions.get(targetUserId)!.add(subscriberId);

    return () => this.unsubscribe(subscriberId, targetUserId);
  }

  unsubscribe(subscriberId: string, targetUserId: string): void {
    this.subscriptions.get(subscriberId)?.delete(targetUserId);
    this.reverseSubscriptions.get(targetUserId)?.delete(subscriberId);
  }

  getSubscribers(userId: string): string[] {
    return Array.from(this.reverseSubscriptions.get(userId) ?? []);
  }

  onStatusChange(handler: (userId: string, presence: UserPresence) => void): () => void {
    this.statusChangeHandlers.add(handler);
    return () => this.statusChangeHandlers.delete(handler);
  }

  cleanup(): void {
    const now = Date.now();

    for (const [userId, presence] of this.presenceMap) {
      const inactiveTime = now - presence.lastSeen;

      if (presence.status === 'online' && inactiveTime > this.awayTimeoutMs) {
        presence.status = 'away';
        this.notifyChange(userId, presence);
      }

      if (presence.status === 'away' && inactiveTime > this.offlineTimeoutMs) {
        presence.status = 'offline';
        this.notifyChange(userId, presence);
      }
    }
  }

  getLastSeenText(userId: string): string {
    const presence = this.presenceMap.get(userId);
    if (!presence) return 'Unknown';

    if (presence.status === 'online') return 'Online now';
    if (presence.status === 'busy') return 'Busy';

    const elapsed = Date.now() - presence.lastSeen;
    const minutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  private notifyChange(userId: string, presence: UserPresence): void {
    for (const handler of this.statusChangeHandlers) {
      handler(userId, presence);
    }
  }
}
