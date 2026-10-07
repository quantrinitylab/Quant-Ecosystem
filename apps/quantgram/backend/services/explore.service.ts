import type { PrismaClient } from '../types';
import type { ShapedPost } from './post.service';

export interface ExploreUserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SearchResult {
  users: ExploreUserResult[];
  posts: ShapedPost[];
}

function toArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export class ExploreService {
  constructor(private readonly prisma: PrismaClient) {}

  private shapePost(row: any, isLiked: boolean, isSaved: boolean): ShapedPost {
    return {
      id: row.id,
      userId: row.userId,
      authorUsername: row.user?.username ?? 'unknown',
      authorAvatar: row.user?.avatarUrl ?? null,
      caption: row.content ?? '',
      mediaUrls: toArray(row.mediaUrls),
      hashtags: toArray(row.hashtags),
      type: row.type,
      visibility: row.visibility,
      likeCount: row.likeCount ?? 0,
      commentCount: row.commentCount ?? 0,
      isLiked,
      isSaved,
      createdAt: row.createdAt,
    };
  }

  private async likedSavedSets(
    viewerId: string,
    postIds: string[],
  ): Promise<{ liked: Set<string>; saved: Set<string> }> {
    if (!viewerId || postIds.length === 0) {
      return { liked: new Set(), saved: new Set() };
    }
    const [likes, saves] = await Promise.all([
      this.prisma.like.findMany({ where: { userId: viewerId, postId: { in: postIds } } }),
      this.prisma.savedPost.findMany({ where: { userId: viewerId, postId: { in: postIds } } }),
    ]);
    return {
      liked: new Set(likes.map((l: any) => l.postId)),
      saved: new Set(saves.map((s: any) => s.postId)),
    };
  }

  /** Discovery feed: the most-liked PUBLIC posts. */
  async getDiscovery(viewerId: string, limit = 30): Promise<ShapedPost[]> {
    const rows = await this.prisma.post.findMany({
      where: { visibility: 'PUBLIC', deletedAt: null },
      include: { user: true },
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    const postIds = rows.map((r: any) => r.id);
    const { liked, saved } = await this.likedSavedSets(viewerId, postIds);
    return rows.map((r: any) => this.shapePost(r, liked.has(r.id), saved.has(r.id)));
  }

  async search(query: string, viewerId: string): Promise<SearchResult> {
    const q = query.trim();
    if (!q) return { users: [], posts: [] };

    const [users, postRows] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 20,
      }),
      this.prisma.post.findMany({
        where: {
          visibility: 'PUBLIC',
          deletedAt: null,
          content: { contains: q, mode: 'insensitive' },
        },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const postIds = postRows.map((r: any) => r.id);
    const { liked, saved } = await this.likedSavedSets(viewerId, postIds);

    return {
      users: users.map((u: any) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName ?? u.username,
        avatarUrl: u.avatarUrl ?? null,
      })),
      posts: postRows.map((r: any) => this.shapePost(r, liked.has(r.id), saved.has(r.id))),
    };
  }
}
