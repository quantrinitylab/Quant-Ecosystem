import { describe, it, expect } from 'vitest';
import { FollowManager } from '../activitypub/follow-manager.js';

describe('FollowManager', () => {
  it('sends a follow request with pending status', () => {
    const manager = new FollowManager();
    const record = manager.sendFollow('actor1', 'https://remote.example/users/actor2');

    expect(record.actorId).toBe('actor1');
    expect(record.targetActorUrl).toBe('https://remote.example/users/actor2');
    expect(record.status).toBe('pending');
    expect(record.id).toBeDefined();
  });

  it('accepts a follow request', () => {
    const manager = new FollowManager();
    const record = manager.sendFollow('actor1', 'https://remote.example/users/actor2');

    const accepted = manager.acceptFollow(record.id);
    expect(accepted).not.toBeNull();
    expect(accepted!.status).toBe('accepted');
  });

  it('returns null when accepting non-pending follow', () => {
    const manager = new FollowManager();
    const record = manager.sendFollow('actor1', 'https://remote.example/users/actor2');
    manager.acceptFollow(record.id);

    // Try accepting again
    expect(manager.acceptFollow(record.id)).toBeNull();
  });

  it('returns null when accepting non-existent follow', () => {
    const manager = new FollowManager();
    expect(manager.acceptFollow('non-existent-id')).toBeNull();
  });

  it('rejects a follow request', () => {
    const manager = new FollowManager();
    const record = manager.sendFollow('actor1', 'https://remote.example/users/actor2');

    const rejected = manager.rejectFollow(record.id);
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe('rejected');
  });

  it('returns null when rejecting non-pending follow', () => {
    const manager = new FollowManager();
    const record = manager.sendFollow('actor1', 'https://remote.example/users/actor2');
    manager.rejectFollow(record.id);

    expect(manager.rejectFollow(record.id)).toBeNull();
  });

  it('unfollows an accepted follow', () => {
    const manager = new FollowManager();
    const record = manager.sendFollow('actor1', 'https://remote.example/users/actor2');
    manager.acceptFollow(record.id);

    expect(manager.unfollow('actor1', 'https://remote.example/users/actor2')).toBe(true);
    expect(manager.unfollow('actor1', 'https://remote.example/users/actor2')).toBe(false);
  });

  it('gets followers for an actor', () => {
    const manager = new FollowManager();
    const target = 'https://remote.example/users/target';

    const f1 = manager.sendFollow('actor1', target);
    const f2 = manager.sendFollow('actor2', target);
    manager.acceptFollow(f1.id);
    manager.acceptFollow(f2.id);

    const followers = manager.getFollowers(target);
    expect(followers).toContain('actor1');
    expect(followers).toContain('actor2');
    expect(followers.length).toBe(2);
  });

  it('gets following for an actor', () => {
    const manager = new FollowManager();

    const f1 = manager.sendFollow('actor1', 'https://example.com/user/a');
    const f2 = manager.sendFollow('actor1', 'https://example.com/user/b');
    manager.acceptFollow(f1.id);
    manager.acceptFollow(f2.id);

    const following = manager.getFollowing('actor1');
    expect(following).toContain('https://example.com/user/a');
    expect(following).toContain('https://example.com/user/b');
    expect(following.length).toBe(2);
  });

  it('checks if actor is following another', () => {
    const manager = new FollowManager();
    const f = manager.sendFollow('actor1', 'https://example.com/user/target');
    manager.acceptFollow(f.id);

    expect(manager.isFollowing('actor1', 'https://example.com/user/target')).toBe(true);
    expect(manager.isFollowing('actor1', 'https://example.com/user/other')).toBe(false);
    expect(manager.isFollowing('actor2', 'https://example.com/user/target')).toBe(false);
  });

  it('returns empty arrays for unknown actors', () => {
    const manager = new FollowManager();
    expect(manager.getFollowers('unknown')).toEqual([]);
    expect(manager.getFollowing('unknown')).toEqual([]);
  });
});
