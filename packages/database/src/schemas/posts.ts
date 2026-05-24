// ============================================================================
// Database Schema - Posts (QuantSync - Social)
// ============================================================================

/** Post schema for QuantSync social feed */
export interface PostSchema {
  id: string;
  userId: string;
  type: PostType;
  content: string | null;
  mediaUrls: string[];
  mediaThumbnails: string[];
  hashtags: string[];
  mentions: string[];
  linkPreview: LinkPreview | null;
  pollId: string | null;
  repostOfId: string | null;
  replyToId: string | null;
  threadRootId: string | null;
  communityId: string | null;
  visibility: 'public' | 'followers' | 'mentioned' | 'private';
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  viewCount: number;
  bookmarkCount: number;
  isEdited: boolean;
  isPinned: boolean;
  isNsfw: boolean;
  aiModerated: boolean;
  moderationStatus: 'pending' | 'approved' | 'flagged' | 'removed';
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Post types */
export type PostType = 'text' | 'image' | 'video' | 'poll' | 'link' | 'repost' | 'thread' | 'article';

/** Link preview data */
export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string | null;
  favicon: string | null;
}

/** Comment schema */
export interface CommentSchema {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  content: string;
  mediaUrl: string | null;
  likeCount: number;
  replyCount: number;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Like schema (polymorphic for posts and comments) */
export interface LikeSchema {
  id: string;
  userId: string;
  targetId: string;
  targetType: 'post' | 'comment' | 'story' | 'media';
  reactionType: string;
  createdAt: string;
}

/** Bookmark/save schema */
export interface BookmarkSchema {
  id: string;
  userId: string;
  postId: string;
  collectionId: string | null;
  note: string | null;
  createdAt: string;
}

/** Poll schema */
export interface PollSchema {
  id: string;
  postId: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  allowMultiple: boolean;
  expiresAt: string | null;
  createdAt: string;
}

/** Poll option */
export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
}

/** Community/Group schema */
export interface CommunitySchema {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  category: string;
  rules: CommunityRule[];
  memberCount: number;
  postCount: number;
  isPrivate: boolean;
  requiresApproval: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Community rule */
export interface CommunityRule {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}

/** Community membership */
export interface CommunityMemberSchema {
  id: string;
  communityId: string;
  userId: string;
  role: 'owner' | 'moderator' | 'member';
  joinedAt: string;
  leftAt: string | null;
}

/** Hashtag tracking */
export interface HashtagSchema {
  id: string;
  tag: string;
  postCount: number;
  trendingScore: number;
  lastUsedAt: string;
  createdAt: string;
}

export const POSTS_TABLE = {
  tableName: 'posts',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'user_id', type: 'UUID', nullable: false, references: 'users(id)' },
    { name: 'type', type: 'VARCHAR(20)', nullable: false },
    { name: 'content', type: 'TEXT', nullable: true },
    { name: 'media_urls', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'hashtags', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'mentions', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'link_preview', type: 'JSONB', nullable: true },
    { name: 'community_id', type: 'UUID', nullable: true, references: 'communities(id)' },
    { name: 'visibility', type: "VARCHAR(20) DEFAULT 'public'", nullable: false },
    { name: 'like_count', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'comment_count', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'repost_count', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'view_count', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'is_pinned', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'moderation_status', type: "VARCHAR(20) DEFAULT 'approved'", nullable: false },
    { name: 'published_at', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: true },
  ],
  indexes: [
    { name: 'idx_posts_user', columns: ['user_id', 'created_at'] },
    { name: 'idx_posts_community', columns: ['community_id'] },
    { name: 'idx_posts_visibility', columns: ['visibility', 'created_at'] },
    { name: 'idx_posts_trending', columns: ['like_count', 'comment_count', 'created_at'] },
  ],
} as const;
