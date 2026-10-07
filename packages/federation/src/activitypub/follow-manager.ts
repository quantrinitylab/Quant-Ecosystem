import { z } from 'zod';

export const FollowRecordSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  targetActorUrl: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  createdAt: z.string(),
});

export type FollowRecord = z.infer<typeof FollowRecordSchema>;

export class FollowManager {
  private follows: Map<string, FollowRecord> = new Map();
  private followerIndex: Map<string, Set<string>> = new Map();
  private followingIndex: Map<string, Set<string>> = new Map();

  sendFollow(actorId: string, targetActorUrl: string): FollowRecord {
    const id = crypto.randomUUID();
    const record: FollowRecord = {
      id,
      actorId,
      targetActorUrl,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.follows.set(id, record);
    return record;
  }

  acceptFollow(followId: string): FollowRecord | null {
    const record = this.follows.get(followId);
    if (!record || record.status !== 'pending') return null;

    record.status = 'accepted';

    // Update indexes
    const followers = this.followerIndex.get(record.targetActorUrl) ?? new Set();
    followers.add(record.actorId);
    this.followerIndex.set(record.targetActorUrl, followers);

    const following = this.followingIndex.get(record.actorId) ?? new Set();
    following.add(record.targetActorUrl);
    this.followingIndex.set(record.actorId, following);

    return record;
  }

  rejectFollow(followId: string): FollowRecord | null {
    const record = this.follows.get(followId);
    if (!record || record.status !== 'pending') return null;

    record.status = 'rejected';
    return record;
  }

  unfollow(actorId: string, targetActorUrl: string): boolean {
    // Find and remove the accepted follow
    for (const [id, record] of this.follows) {
      if (
        record.actorId === actorId &&
        record.targetActorUrl === targetActorUrl &&
        record.status === 'accepted'
      ) {
        this.follows.delete(id);

        // Update indexes
        const followers = this.followerIndex.get(targetActorUrl);
        if (followers) followers.delete(actorId);

        const following = this.followingIndex.get(actorId);
        if (following) following.delete(targetActorUrl);

        return true;
      }
    }
    return false;
  }

  getFollowers(actorId: string): string[] {
    const followers = this.followerIndex.get(actorId);
    return followers ? [...followers] : [];
  }

  getFollowing(actorId: string): string[] {
    const following = this.followingIndex.get(actorId);
    return following ? [...following] : [];
  }

  isFollowing(actorId: string, targetId: string): boolean {
    const following = this.followingIndex.get(actorId);
    return following ? following.has(targetId) : false;
  }
}
