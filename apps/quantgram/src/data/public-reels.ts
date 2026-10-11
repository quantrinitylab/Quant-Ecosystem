// ============================================================================
// QuantGram - Public Featured Reels & Explore Posts
//
// HONESTY POLICY: this module used to ship hardcoded "featured" reels and
// posts with invented creators and fabricated engagement numbers
// (likes / plays / comments) that were presented to guests as real content.
// That was fake data. It has been removed.
//
// When the backend feed is unavailable or the catalog is empty, the app now
// shows an honest empty state ("No reels yet") instead of invented content.
// These getters intentionally return empty arrays.
// ============================================================================

export interface PublicReelItem {
  id: string;
  userId: string;
  creator: string;
  creatorAvatar: string;
  username: string;
  userAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  soundName: string;
  soundId: string;
  duration: number;
  likeCount: number;
  likes: number;
  commentCount: number;
  comments: number;
  shareCount: number;
  shares: number;
  plays: number;
  isLiked: boolean;
  isSaved: boolean;
  isFeatured: boolean;
}

export interface PublicExplorePostItem {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  authorUsername?: string;
  authorAvatar?: string;
  type: 'photo' | 'video' | 'carousel';
  mediaUrls: string[];
  media: Array<{
    id: string;
    type: 'image' | 'video';
    url: string;
    width: number;
    height: number;
  }>;
  caption: string;
  hashtags: string[];
  mentions: string[];
  likes: number;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isPinned: boolean;
  collaborators: string[];
  createdAt: string;
}

// No fabricated reels. Real reels come from the backend feed only.
export const PUBLIC_FEATURED_REELS: PublicReelItem[] = [];

// No fabricated explore posts. Real posts come from the backend feed only.
export const PUBLIC_FEATURED_POSTS: PublicExplorePostItem[] = [];

export function getGuestFeaturedReels(): PublicReelItem[] {
  return [...PUBLIC_FEATURED_REELS];
}

export function getGuestFeaturedPosts(): PublicExplorePostItem[] {
  return [...PUBLIC_FEATURED_POSTS];
}
