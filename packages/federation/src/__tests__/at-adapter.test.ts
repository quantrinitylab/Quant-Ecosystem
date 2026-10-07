import { describe, it, expect } from 'vitest';
import { ATProtocolAdapter } from '../at-protocol/at-adapter.js';

describe('ATProtocolAdapter', () => {
  it('creates a post', () => {
    const adapter = new ATProtocolAdapter();
    const post = adapter.createPost('did:plc:abc123', 'Hello AT Protocol!');

    expect(post.did).toBe('did:plc:abc123');
    expect(post.content).toBe('Hello AT Protocol!');
    expect(post.uri).toContain('did:plc:abc123');
    expect(post.cid).toBeDefined();
    expect(post.createdAt).toBeDefined();
  });

  it('deletes a post', () => {
    const adapter = new ATProtocolAdapter();
    const post = adapter.createPost('did:plc:abc123', 'To be deleted');

    expect(adapter.deletePost('did:plc:abc123', post.uri)).toBe(true);
    expect(adapter.deletePost('did:plc:abc123', post.uri)).toBe(false);
  });

  it('deletes returns false for unknown did', () => {
    const adapter = new ATProtocolAdapter();
    expect(adapter.deletePost('did:plc:unknown', 'at://fake')).toBe(false);
  });

  it('follows and unfollows a user', () => {
    const adapter = new ATProtocolAdapter();

    expect(adapter.follow('did:plc:user1', 'did:plc:user2')).toBe(true);
    // Duplicate follow returns false
    expect(adapter.follow('did:plc:user1', 'did:plc:user2')).toBe(false);

    expect(adapter.unfollow('did:plc:user1', 'did:plc:user2')).toBe(true);
    expect(adapter.unfollow('did:plc:user1', 'did:plc:user2')).toBe(false);
  });

  it('unfollow returns false when no follows exist', () => {
    const adapter = new ATProtocolAdapter();
    expect(adapter.unfollow('did:plc:noone', 'did:plc:target')).toBe(false);
  });

  it('gets timeline with followed users posts', () => {
    const adapter = new ATProtocolAdapter();

    adapter.createPost('did:plc:user2', 'Post from user2');
    adapter.createPost('did:plc:user3', 'Post from user3');

    adapter.follow('did:plc:user1', 'did:plc:user2');

    const timeline = adapter.getTimeline('did:plc:user1');
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline.some((item) => item.post.content === 'Post from user2')).toBe(true);
    // user3 not followed, should not appear
    expect(timeline.some((item) => item.post.content === 'Post from user3')).toBe(false);
  });

  it('timeline includes own posts', () => {
    const adapter = new ATProtocolAdapter();
    adapter.createPost('did:plc:user1', 'My own post');

    const timeline = adapter.getTimeline('did:plc:user1');
    expect(timeline.some((item) => item.post.content === 'My own post')).toBe(true);
  });

  it('respects timeline limit', () => {
    const adapter = new ATProtocolAdapter();
    for (let i = 0; i < 10; i++) {
      adapter.createPost('did:plc:user1', `Post ${i}`);
    }

    const timeline = adapter.getTimeline('did:plc:user1', 5);
    expect(timeline.length).toBe(5);
  });

  it('resolves a handle', () => {
    const adapter = new ATProtocolAdapter();
    adapter.registerHandle('alice.bsky.social', 'did:plc:alice');

    expect(adapter.resolveHandle('alice.bsky.social')).toBe('did:plc:alice');
    expect(adapter.resolveHandle('unknown.bsky.social')).toBeNull();
  });

  it('gets feed with cursor pagination', () => {
    const adapter = new ATProtocolAdapter();
    for (let i = 0; i < 25; i++) {
      adapter.createPost('did:plc:poster', `Feed post ${i}`);
    }

    const firstPage = adapter.getFeed('at://did:plc:poster/app.bsky.feed.generator/my-feed');
    expect(firstPage.feed.length).toBe(20);
    expect(firstPage.cursor).toBeDefined();

    const secondPage = adapter.getFeed(
      'at://did:plc:poster/app.bsky.feed.generator/my-feed',
      firstPage.cursor,
    );
    expect(secondPage.feed.length).toBe(5);
    expect(secondPage.cursor).toBeUndefined();
  });
});
