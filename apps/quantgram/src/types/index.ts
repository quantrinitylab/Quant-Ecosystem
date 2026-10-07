// ============================================================================
// QuantNeon - Type Definitions
// All types for posts, reels, stories, games, products, AR filters
// ============================================================================

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userAvatar: string | null;
  text: string;
  likes: number;
  createdAt: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  type: 'photo' | 'video' | 'carousel';
  media: MediaItem[];
  caption: string;
  hashtags: string[];
  mentions: string[];
  location?: Location;
  likes: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isPinned: boolean;
  collaborators: string[];
  createdAt: string;
  authorAvatar?: string;
  authorUsername?: string;
  mediaUrls?: string[];
  likeCount: number;
  comments?: PostComment[];
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  width: number;
  height: number;
  altText?: string;
  filter?: string;
}

export interface Location {
  name: string;
  lat: number;
  lng: number;
}

export interface Reel {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  audioId: string;
  audioName: string;
  effects: string[];
  duration: number;
  likes: number;
  comments: number;
  shares: number;
  plays: number;
  isLiked: boolean;
  isDuet: boolean;
  isStitch: boolean;
  originalReelId?: string;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  duration: number;
  stickers: Sticker[];
  isViewed: boolean;
  expiresAt: string;
  isCloseFriends: boolean;
}

export interface Sticker {
  id: string;
  type:
    | 'poll'
    | 'question'
    | 'slider'
    | 'countdown'
    | 'quiz'
    | 'music'
    | 'mention'
    | 'location'
    | 'link';
  position: { x: number; y: number };
  data: any;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  website: string;
  isVerified: boolean;
  isPrivate: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface Game {
  id: string;
  title: string;
  description: string;
  type: 'casual' | 'puzzle' | 'ar' | 'multiplayer' | 'trivia';
  thumbnailUrl: string;
  maxPlayers: number;
  isMultiplayer: boolean;
  playCount: number;
  rating: number;
}

export interface GameSession {
  id: string;
  gameId: string;
  state: Record<string, any>;
  score: number;
  level: number;
  lives: number;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  category: string;
  inStock: boolean;
  rating: number;
  reviewCount: number;
}

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  price: number;
  name: string;
  imageUrl: string;
}

export interface ARFilter {
  id: string;
  name: string;
  category: string;
  thumbnailUrl: string;
  creatorName: string;
  usageCount: number;
  isOfficial: boolean;
}

export interface VRExperience {
  id: string;
  title: string;
  description: string;
  type: string;
  maxUsers: number;
  activeUsers: number;
  thumbnailUrl: string;
}

export interface Highlight {
  id: string;
  title: string;
  coverUrl: string;
  storyCount: number;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  text: string;
  likes: number;
  isLiked: boolean;
  replies: Comment[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'tag' | 'game_invite';
  fromUser: string;
  fromAvatar: string;
  content: string;
  read: boolean;
  createdAt: string;
}

export interface ExploreCategory {
  id: string;
  name: string;
  icon: string;
  postCount: number;
}
