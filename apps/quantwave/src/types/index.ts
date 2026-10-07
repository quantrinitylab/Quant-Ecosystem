// ============================================================================
// QuantSync Types
// Twitter/X + Threads + Reddit hybrid with anonymous feeds
// ============================================================================

// --- Core Entities ---

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar: string;
  banner: string;
  bio: string;
  verified: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  karma: number;
  joinedAt: string;
  isAnonymous?: boolean;
  anonymousAlias?: string;
  badges: Badge[];
  preferences: UserPreferences;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  awardedAt: string;
}

export interface UserPreferences {
  feedMode: FeedMode;
  theme: 'light' | 'dark' | 'auto';
  notifications: NotificationPreferences;
  privacy: PrivacySettings;
  contentFilters: string[];
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'followers' | 'private';
  allowDMs: 'everyone' | 'followers' | 'nobody';
  showOnlineStatus: boolean;
  allowMentions: 'everyone' | 'followers' | 'nobody';
}

export interface NotificationPreferences {
  likes: boolean;
  comments: boolean;
  reposts: boolean;
  mentions: boolean;
  follows: boolean;
  communityUpdates: boolean;
  trendingTopics: boolean;
  spaces: boolean;
  pushEnabled: boolean;
  emailDigest: 'daily' | 'weekly' | 'never';
}

// --- Posts ---

export type PostType = 'text' | 'media' | 'poll' | 'thread' | 'repost' | 'quote' | 'anonymous';

export interface Post {
  id: string;
  authorId: string;
  author?: User;
  type: PostType;
  content: string;
  mediaAttachments: MediaAttachment[];
  poll?: Poll;
  threadPosts?: Post[];
  repostOf?: Post;
  quotedPost?: Post;
  communityId?: string;
  community?: Community;
  hashtags: string[];
  mentions: string[];
  flair?: Flair;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  bookmarkCount: number;
  viewCount: number;
  isEdited: boolean;
  isPinned: boolean;
  isLocked: boolean;
  isNSFW: boolean;
  isSpoiler: boolean;
  isAnonymous: boolean;
  anonymousAlias?: string;
  createdAt: string;
  updatedAt: string;
  userVote?: 'up' | 'down' | null;
  userBookmarked?: boolean;
  userReposted?: boolean;
}

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video' | 'gif' | 'audio';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  altText?: string;
  blurhash?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  endsAt: string;
  isMultipleChoice: boolean;
  userVotedOptions?: string[];
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

// --- Comments ---

export interface Comment {
  id: string;
  postId: string;
  parentId?: string;
  authorId: string;
  author?: User;
  content: string;
  mediaAttachments: MediaAttachment[];
  upvotes: number;
  downvotes: number;
  score: number;
  replyCount: number;
  depth: number;
  isEdited: boolean;
  isAnonymous: boolean;
  anonymousAlias?: string;
  isOP: boolean;
  isModerator: boolean;
  createdAt: string;
  updatedAt: string;
  userVote?: 'up' | 'down' | null;
  replies?: Comment[];
  collapsed?: boolean;
}

// --- Communities ---

export interface Community {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  banner: string;
  category: CommunityCategory;
  memberCount: number;
  onlineCount: number;
  postCount: number;
  createdAt: string;
  rules: CommunityRule[];
  flairs: Flair[];
  moderators: User[];
  settings: CommunitySettings;
  userRole?: 'member' | 'moderator' | 'admin' | 'owner';
  isJoined?: boolean;
}

export type CommunityCategory =
  | 'technology' | 'gaming' | 'science' | 'art' | 'music'
  | 'sports' | 'entertainment' | 'news' | 'politics' | 'education'
  | 'health' | 'finance' | 'food' | 'travel' | 'fashion'
  | 'memes' | 'other';

export interface CommunityRule {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface CommunitySettings {
  postApproval: boolean;
  allowAnonymous: boolean;
  allowPolls: boolean;
  allowMedia: boolean;
  restrictPostTypes: PostType[];
  minKarmaToPost: number;
  minAccountAge: number; // days
  autoModEnabled: boolean;
  spamFilterLevel: 'low' | 'medium' | 'high';
}

export interface Flair {
  id: string;
  text: string;
  color: string;
  backgroundColor: string;
  emoji?: string;
}

// --- Feed ---

export type FeedMode = 'for-you' | 'following' | 'chronological' | 'anonymous' | 'trending';

export interface FeedRequest {
  mode: FeedMode;
  cursor?: string;
  limit?: number;
  communityId?: string;
  hashtag?: string;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor?: string;
  hasMore: boolean;
  metadata: {
    mode: FeedMode;
    totalEstimate: number;
    refreshedAt: string;
  };
}

// --- Trending ---

export interface TrendingTopic {
  id: string;
  name: string;
  hashtag: string;
  category: string;
  postCount: number;
  trendingScore: number;
  velocity: number; // rate of increase
  peakTime: string;
  relatedTopics: string[];
}

export interface SearchResult {
  type: 'post' | 'user' | 'community' | 'hashtag';
  score: number;
  item: Post | User | Community | TrendingTopic;
}

// --- Spaces (Live Audio) ---

export interface Space {
  id: string;
  title: string;
  description: string;
  hostId: string;
  host?: User;
  coHosts: User[];
  speakers: SpaceParticipant[];
  listeners: SpaceParticipant[];
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  listenerCount: number;
  maxListeners: number;
  topics: string[];
  isRecording: boolean;
  communityId?: string;
}

export interface SpaceParticipant {
  userId: string;
  user?: User;
  role: 'host' | 'co-host' | 'speaker' | 'listener';
  isMuted: boolean;
  joinedAt: string;
  raisedHand: boolean;
}

// --- Notifications ---

export type NotificationType =
  | 'like' | 'upvote' | 'downvote' | 'comment' | 'reply'
  | 'repost' | 'quote' | 'mention' | 'follow'
  | 'community_invite' | 'space_invite' | 'space_start'
  | 'trending' | 'moderation' | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  userId: string;
  actorId?: string;
  actor?: User;
  targetId?: string;
  targetType?: 'post' | 'comment' | 'community' | 'space';
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// --- Moderation ---

export type ReportReason =
  | 'spam' | 'harassment' | 'hate_speech' | 'violence'
  | 'nsfw' | 'misinformation' | 'copyright' | 'impersonation' | 'other';

export interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: 'post' | 'comment' | 'user' | 'community';
  reason: ReportReason;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  moderatorId?: string;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ModerationAction {
  id: string;
  moderatorId: string;
  targetId: string;
  targetType: 'post' | 'comment' | 'user';
  action: 'remove' | 'warn' | 'mute' | 'ban' | 'approve';
  reason: string;
  duration?: number; // hours
  createdAt: string;
}

// --- AI Features ---

export interface AIContentSuggestion {
  id: string;
  type: 'caption' | 'hashtag' | 'reply' | 'post_idea' | 'title';
  content: string;
  confidence: number;
  context?: string;
}

export interface FactCheck {
  id: string;
  postId: string;
  claim: string;
  verdict: 'true' | 'mostly_true' | 'mixed' | 'mostly_false' | 'false' | 'unverifiable';
  explanation: string;
  sources: string[];
  confidence: number;
  checkedAt: string;
}

// --- API Response Types ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    cursor?: string;
  };
}
