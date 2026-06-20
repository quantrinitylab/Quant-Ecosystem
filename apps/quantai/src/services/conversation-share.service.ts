// ============================================================================
// QuantAI - Conversation Share Service
// Share conversations with permissions
// ============================================================================

import { randomInt } from 'node:crypto';

export type SharePermission = 'view' | 'edit' | 'comment';

export interface ShareLink {
  id: string;
  conversationId: string;
  token: string;
  permission: SharePermission;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  maxViews: number | null;
  viewCount: number;
  isActive: boolean;
}

export interface ShareAccessResult {
  allowed: boolean;
  reason?: string;
  share?: ShareLink;
}

export class ConversationShareService {
  private shares: Map<string, ShareLink> = new Map();
  private conversationShares: Map<string, string[]> = new Map();
  private idCounter = 0;

  createShare(
    conversationId: string,
    createdBy: string,
    options: {
      permission?: SharePermission;
      expiresInHours?: number;
      maxViews?: number;
    } = {},
  ): ShareLink {
    this.idCounter += 1;
    const token = this.generateToken();
    const share: ShareLink = {
      id: `share-${this.idCounter}`,
      conversationId,
      token,
      permission: options.permission || 'view',
      createdBy,
      createdAt: Date.now(),
      expiresAt: options.expiresInHours
        ? Date.now() + options.expiresInHours * 60 * 60 * 1000
        : null,
      maxViews: options.maxViews || null,
      viewCount: 0,
      isActive: true,
    };

    this.shares.set(share.id, share);
    const existing = this.conversationShares.get(conversationId) || [];
    existing.push(share.id);
    this.conversationShares.set(conversationId, existing);

    return share;
  }

  revokeShare(shareId: string): boolean {
    const share = this.shares.get(shareId);
    if (!share) return false;
    share.isActive = false;
    return true;
  }

  getShare(shareId: string): ShareLink | null {
    return this.shares.get(shareId) || null;
  }

  getShareByToken(token: string): ShareLink | null {
    for (const share of this.shares.values()) {
      if (share.token === token) return share;
    }
    return null;
  }

  getSharesForConversation(conversationId: string): ShareLink[] {
    const shareIds = this.conversationShares.get(conversationId) || [];
    return shareIds.map((id) => this.shares.get(id)).filter((s): s is ShareLink => s !== undefined);
  }

  checkAccess(token: string): ShareAccessResult {
    const share = this.getShareByToken(token);
    if (!share) {
      return { allowed: false, reason: 'Share link not found' };
    }

    if (!share.isActive) {
      return { allowed: false, reason: 'Share link has been revoked', share };
    }

    if (share.expiresAt && Date.now() > share.expiresAt) {
      return { allowed: false, reason: 'Share link has expired', share };
    }

    if (share.maxViews !== null && share.viewCount >= share.maxViews) {
      return { allowed: false, reason: 'Maximum views reached', share };
    }

    share.viewCount += 1;
    return { allowed: true, share };
  }

  getShareUrl(share: ShareLink, baseUrl: string = 'https://quant.ai'): string {
    return `${baseUrl}/share/${share.token}`;
  }

  deleteSharesForConversation(conversationId: string): number {
    const shareIds = this.conversationShares.get(conversationId) || [];
    for (const id of shareIds) {
      this.shares.delete(id);
    }
    this.conversationShares.delete(conversationId);
    return shareIds.length;
  }

  private generateToken(): string {
    // Security: share tokens are bearer credentials granting access to a
    // conversation. They MUST be unpredictable, so use a CSPRNG (crypto.randomInt)
    // rather than Math.random (which is seedable/predictable).
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(randomInt(0, chars.length));
    }
    return token;
  }
}
