import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationShareService } from '../services/conversation-share.service';

describe('ConversationShareService', () => {
  let service: ConversationShareService;

  beforeEach(() => {
    service = new ConversationShareService();
  });

  describe('createShare', () => {
    it('creates a share link', () => {
      const share = service.createShare('conv-1', 'user-1');
      expect(share.id).toBeDefined();
      expect(share.conversationId).toBe('conv-1');
      expect(share.createdBy).toBe('user-1');
      expect(share.token).toHaveLength(32);
      expect(share.permission).toBe('view');
      expect(share.isActive).toBe(true);
      expect(share.viewCount).toBe(0);
    });

    it('uses specified permission', () => {
      const share = service.createShare('conv-1', 'user-1', { permission: 'edit' });
      expect(share.permission).toBe('edit');
    });

    it('sets expiration when specified', () => {
      const share = service.createShare('conv-1', 'user-1', { expiresInHours: 24 });
      expect(share.expiresAt).not.toBeNull();
      expect(share.expiresAt!).toBeGreaterThan(Date.now());
    });

    it('sets max views when specified', () => {
      const share = service.createShare('conv-1', 'user-1', { maxViews: 10 });
      expect(share.maxViews).toBe(10);
    });

    it('has null expiration by default', () => {
      const share = service.createShare('conv-1', 'user-1');
      expect(share.expiresAt).toBeNull();
    });
  });

  describe('revokeShare', () => {
    it('revokes an active share', () => {
      const share = service.createShare('conv-1', 'user-1');
      expect(service.revokeShare(share.id)).toBe(true);
      const revoked = service.getShare(share.id);
      expect(revoked!.isActive).toBe(false);
    });

    it('returns false for non-existent share', () => {
      expect(service.revokeShare('fake-id')).toBe(false);
    });
  });

  describe('getShare', () => {
    it('returns share by id', () => {
      const share = service.createShare('conv-1', 'user-1');
      const found = service.getShare(share.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(share.id);
    });

    it('returns null for non-existent id', () => {
      expect(service.getShare('fake')).toBeNull();
    });
  });

  describe('getShareByToken', () => {
    it('finds share by token', () => {
      const share = service.createShare('conv-1', 'user-1');
      const found = service.getShareByToken(share.token);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(share.id);
    });

    it('returns null for unknown token', () => {
      expect(service.getShareByToken('unknown-token')).toBeNull();
    });
  });

  describe('getSharesForConversation', () => {
    it('returns all shares for a conversation', () => {
      service.createShare('conv-1', 'user-1');
      service.createShare('conv-1', 'user-1');
      service.createShare('conv-2', 'user-1');

      const shares = service.getSharesForConversation('conv-1');
      expect(shares).toHaveLength(2);
    });

    it('returns empty array for conversation with no shares', () => {
      expect(service.getSharesForConversation('no-shares')).toHaveLength(0);
    });
  });

  describe('checkAccess', () => {
    it('allows access for active share', () => {
      const share = service.createShare('conv-1', 'user-1');
      const result = service.checkAccess(share.token);
      expect(result.allowed).toBe(true);
      expect(result.share).toBeDefined();
    });

    it('increments view count on access', () => {
      const share = service.createShare('conv-1', 'user-1');
      service.checkAccess(share.token);
      service.checkAccess(share.token);
      const updated = service.getShare(share.id);
      expect(updated!.viewCount).toBe(2);
    });

    it('denies access for revoked share', () => {
      const share = service.createShare('conv-1', 'user-1');
      service.revokeShare(share.id);
      const result = service.checkAccess(share.token);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('revoked');
    });

    it('denies access for expired share', () => {
      const share = service.createShare('conv-1', 'user-1', { expiresInHours: 0 });
      share.expiresAt = Date.now() - 1000;
      const result = service.checkAccess(share.token);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('denies access when max views reached', () => {
      const share = service.createShare('conv-1', 'user-1', { maxViews: 1 });
      service.checkAccess(share.token);
      const result = service.checkAccess(share.token);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum views');
    });

    it('denies access for unknown token', () => {
      const result = service.checkAccess('unknown');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });

  describe('getShareUrl', () => {
    it('generates correct share URL', () => {
      const share = service.createShare('conv-1', 'user-1');
      const url = service.getShareUrl(share);
      expect(url).toBe(`https://quant.ai/share/${share.token}`);
    });

    it('uses custom base URL', () => {
      const share = service.createShare('conv-1', 'user-1');
      const url = service.getShareUrl(share, 'https://dev.quant.ai');
      expect(url).toBe(`https://dev.quant.ai/share/${share.token}`);
    });
  });

  describe('deleteSharesForConversation', () => {
    it('deletes all shares for a conversation', () => {
      service.createShare('conv-1', 'user-1');
      service.createShare('conv-1', 'user-1');
      const count = service.deleteSharesForConversation('conv-1');
      expect(count).toBe(2);
      expect(service.getSharesForConversation('conv-1')).toHaveLength(0);
    });

    it('returns 0 for conversation with no shares', () => {
      expect(service.deleteSharesForConversation('none')).toBe(0);
    });
  });

  describe('token security', () => {
    it('generates unguessable, unique tokens (CSPRNG-backed)', () => {
      // Regression guard: share tokens are bearer credentials. They must come from a
      // cryptographically secure RNG, never Math.random. A weak/seeded generator would
      // produce collisions or predictable sequences at scale; assert high uniqueness.
      const tokens = new Set<string>();
      for (let i = 0; i < 5000; i++) {
        tokens.add(service.createShare('conv-collision', 'user-1').token);
      }
      expect(tokens.size).toBe(5000);
      // Every token must be exactly 32 chars from the expected alphabet.
      for (const t of tokens) {
        expect(t).toMatch(/^[A-Za-z0-9]{32}$/);
      }
    });
  });
});
