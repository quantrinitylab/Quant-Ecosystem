import { describe, it, expect } from 'vitest';
import {
  FeedSpaceService,
  FeedSpaceError,
  type ContentModerator,
  type SpaceAuthor,
} from '../services/feed-space.service';

const verified: SpaceAuthor = { id: 'u-verified', isVerified: true };
const normal: SpaceAuthor = { id: 'u-normal', isVerified: false };
const banned: SpaceAuthor = { id: 'u-banned', isVerified: true, isBanned: true };

const allowAll: ContentModerator = { check: async () => ({ allowed: true }) };
const blockAll: ContentModerator = {
  check: async () => ({ allowed: false, reason: 'Policy violation' }),
};

describe('FeedSpaceService', () => {
  const svc = new FeedSpaceService('test-secret');

  it('requires a non-empty alias secret', () => {
    expect(() => new FeedSpaceService('')).toThrow();
  });

  describe('canView', () => {
    it('everyone can view every space (Verified is read-public)', () => {
      for (const space of ['main', 'verified', 'anonymous'] as const) {
        expect(svc.canView(space).allowed).toBe(true);
      }
    });
  });

  describe('verified space posting/replying', () => {
    it('allows verified accounts to post and reply', () => {
      expect(svc.canPost('verified', verified).allowed).toBe(true);
      expect(svc.canReply('verified', verified).allowed).toBe(true);
    });

    it('blocks non-verified accounts from posting', () => {
      const res = svc.canPost('verified', normal);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('verified');
    });

    it('blocks non-verified accounts from replying', () => {
      const res = svc.canReply('verified', normal);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('verified');
    });
  });

  describe('main space', () => {
    it('allows any non-banned account to post and reply', () => {
      expect(svc.canPost('main', normal).allowed).toBe(true);
      expect(svc.canReply('main', normal).allowed).toBe(true);
      expect(svc.canPost('main', verified).allowed).toBe(true);
    });
  });

  describe('banned accounts', () => {
    it('cannot post or reply in any space', () => {
      for (const space of ['main', 'verified', 'anonymous'] as const) {
        expect(svc.canPost(space, banned).allowed).toBe(false);
        expect(svc.canReply(space, banned).allowed).toBe(false);
      }
    });
  });

  describe('assert variants', () => {
    it('throws NOT_VERIFIED for non-verified posting in verified space', () => {
      try {
        svc.assertCanPost('verified', normal);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(FeedSpaceError);
        expect((e as FeedSpaceError).code).toBe('NOT_VERIFIED');
      }
    });

    it('throws BANNED for banned accounts', () => {
      try {
        svc.assertCanReply('main', banned);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect((e as FeedSpaceError).code).toBe('BANNED');
      }
    });

    it('does not throw for an allowed action', () => {
      expect(() => svc.assertCanPost('verified', verified)).not.toThrow();
    });
  });

  describe('anonymous aliasing', () => {
    it('is stable for the same (author, thread)', () => {
      const a1 = svc.anonymousAlias('user-1', 'thread-1');
      const a2 = svc.anonymousAlias('user-1', 'thread-1');
      expect(a1).toBe(a2);
      expect(a1).toMatch(/^Anon-[0-9a-f]{6}$/);
    });

    it('differs across threads (no cross-thread tracking)', () => {
      const a1 = svc.anonymousAlias('user-1', 'thread-1');
      const a2 = svc.anonymousAlias('user-1', 'thread-2');
      expect(a1).not.toBe(a2);
    });

    it('differs across authors in the same thread', () => {
      const a1 = svc.anonymousAlias('user-1', 'thread-1');
      const a2 = svc.anonymousAlias('user-2', 'thread-1');
      expect(a1).not.toBe(a2);
    });

    it('does not embed the author id (non-reversible)', () => {
      const alias = svc.anonymousAlias('secret-user-id', 'thread-1');
      expect(alias).not.toContain('secret-user-id');
    });
  });

  describe('submitPost', () => {
    it('publishes a normal post with the real author id', async () => {
      const res = await svc.submitPost({
        space: 'main',
        author: normal,
        content: 'hello world',
        postId: 'p1',
      });
      expect(res.ok).toBe(true);
      expect(res.post?.authorId).toBe('u-normal');
      expect(res.post?.isAnonymous).toBe(false);
      expect(res.post?.anonymousAlias).toBeUndefined();
    });

    it('rejects non-verified posting to the verified space', async () => {
      const res = await svc.submitPost({
        space: 'verified',
        author: normal,
        content: 'hi',
        postId: 'p2',
      });
      expect(res.ok).toBe(false);
      expect(res.post).toBeUndefined();
    });

    it('anonymous post hides the author and uses an alias', async () => {
      const res = await svc.submitPost({
        space: 'anonymous',
        author: normal,
        content: 'whistleblower note',
        postId: 'p3',
        threadId: 't3',
        moderator: allowAll,
      });
      expect(res.ok).toBe(true);
      expect(res.post?.isAnonymous).toBe(true);
      expect(res.post?.authorId).toBeUndefined();
      expect(res.post?.anonymousAlias).toMatch(/^Anon-[0-9a-f]{6}$/);
    });

    it('anonymous post is blocked when moderation rejects it', async () => {
      const res = await svc.submitPost({
        space: 'anonymous',
        author: normal,
        content: 'something against policy',
        postId: 'p4',
        moderator: blockAll,
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('Policy violation');
      expect(res.post).toBeUndefined();
    });

    it('anonymous post requires a moderator (fail-closed)', async () => {
      const res = await svc.submitPost({
        space: 'anonymous',
        author: normal,
        content: 'x',
        postId: 'p5',
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('moderator');
    });

    it('banned author cannot submit even to the main space', async () => {
      const res = await svc.submitPost({
        space: 'main',
        author: banned,
        content: 'x',
        postId: 'p6',
      });
      expect(res.ok).toBe(false);
    });
  });
});
