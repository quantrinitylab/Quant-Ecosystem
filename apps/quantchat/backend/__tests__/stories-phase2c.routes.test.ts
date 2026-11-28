// ============================================================================
// quantchat -- Phase 2C stories routes tests
//
// 1. Registration fail-closed: every new Phase 2C endpoint (upload-url,
//    discover, like, comments, follow/unfollow/follow-status) must reject
//    unauthenticated callers 401 via the global auth hook BEFORE any
//    handler or DB read runs (same convention as stories.route.test.ts).
// 2. Audience gate units: the new 'FRIENDS' audience narrows visibility to
//    v1 friends even when the author's pref is 'everyone' (AND semantics),
//    and a blocked pair never views regardless of audience.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';
import { canViewStory, type FriendContext } from '../routes/stories';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3002,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function ctxWith(overrides: Partial<FriendContext> = {}): FriendContext {
  return {
    closeFriendAuthors: new Set<string>(),
    directChatAuthors: new Set<string>(),
    prefByAuthor: new Map(),
    blockedAuthors: new Set<string>(),
    ...overrides,
  };
}

describe('Phase 2C endpoint registration (fail closed)', () => {
  it('POST /stories/upload-url rejects unauthenticated 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stories/upload-url',
      payload: { filename: 'a.jpg', contentType: 'image/jpeg', contentLength: 10 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /stories/discover rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/discover' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /stories/:storyId/like rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/abc123/like', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('GET /stories/:storyId/comments rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/abc123/comments' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /stories/:storyId/comments rejects unauthenticated 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stories/abc123/comments',
      payload: { body: 'nice' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /stories/authors/:authorId/follow rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/authors/u1/follow', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /stories/authors/:authorId/follow rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/stories/authors/u1/follow' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /stories/authors/:authorId/follow-status rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/authors/u1/follow-status' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /stories still rejects unauthenticated 401 with the new audience value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stories',
      payload: { type: 'text', text: 'hi', audience: 'friendsOnly' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('FRIENDS audience gate', () => {
  const story = { userId: 'author1', audience: 'FRIENDS' };

  it('a v1 friend (direct chat) sees a FRIENDS story', () => {
    const ctx = ctxWith({ directChatAuthors: new Set(['author1']) });
    expect(canViewStory('viewer1', story, ctx)).toBe(true);
  });

  it('a close friend sees a FRIENDS story', () => {
    const ctx = ctxWith({ closeFriendAuthors: new Set(['author1']) });
    expect(canViewStory('viewer1', story, ctx)).toBe(true);
  });

  it('a non-friend does NOT see a FRIENDS story even when the author pref is everyone', () => {
    const ctx = ctxWith({ prefByAuthor: new Map([['author1', 'everyone']]) });
    // AND semantics: Gate 1 (audience) narrows what Gate 2 (pref) allows.
    expect(canViewStory('viewer1', story, ctx)).toBe(false);
  });

  it('a blocked pair never views, even as close friends with everyone pref', () => {
    const ctx = ctxWith({
      closeFriendAuthors: new Set(['author1']),
      prefByAuthor: new Map([['author1', 'everyone']]),
      blockedAuthors: new Set(['author1']),
    });
    expect(canViewStory('viewer1', story, ctx)).toBe(false);
  });

  it('the author always sees their own story', () => {
    expect(canViewStory('author1', story, ctxWith())).toBe(true);
  });

  it('CLOSE_FRIENDS still requires the close-friend edge (unchanged)', () => {
    const closeStory = { userId: 'author1', audience: 'CLOSE_FRIENDS' };
    const directOnly = ctxWith({ directChatAuthors: new Set(['author1']) });
    expect(canViewStory('viewer1', closeStory, directOnly)).toBe(false);
    const closeFriend = ctxWith({ closeFriendAuthors: new Set(['author1']) });
    expect(canViewStory('viewer1', closeStory, closeFriend)).toBe(true);
  });
});
