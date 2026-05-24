// ============================================================================
// QuantMax - Type Definitions
// Short video social, random video chat, and dating platform types
// ============================================================================

export type FeedType = 'for-you' | 'following' | 'trending' | 'nearby';
export type MatchAction = 'like' | 'pass' | 'superlike' | 'boost';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type ChatType = 'text' | 'video' | 'voice' | 'icebreaker';
export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'catfish' | 'underage' | 'violence' | 'other';
export type VideoChatStatus = 'searching' | 'connecting' | 'connected' | 'ended' | 'skipped';
export type Gender = 'male' | 'female' | 'non-binary' | 'other' | 'prefer-not-to-say';
export type RelationshipGoal = 'casual' | 'serious' | 'friendship' | 'networking' | 'open';

export interface ShortVideo {
  id: string;
  creatorId: string;
  creator: UserProfile;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  sound: Sound;
  hashtags: string[];
  effects: VideoEffect[];
  duration: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  isLiked: boolean;
  isBookmarked: boolean;
  isDuet: boolean;
  isStitch: boolean;
  parentVideoId?: string;
  createdAt: string;
  visibility: 'public' | 'friends' | 'private';
}

export interface Sound {
  id: string;
  name: string;
  artistName: string;
  audioUrl: string;
  duration: number;
  usageCount: number;
  isOriginal: boolean;
  albumArt?: string;
}

export interface VideoEffect {
  id: string;
  name: string;
  type: 'filter' | 'ar' | 'beauty' | 'time' | 'transition' | 'green-screen';
  thumbnailUrl: string;
  params: Record<string, unknown>;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  age: number;
  gender: Gender;
  location: { city: string; country: string; lat: number; lng: number };
  photos: ProfilePhoto[];
  videos: string[];
  prompts: ProfilePrompt[];
  interests: string[];
  verified: VerificationStatus;
  relationshipGoal: RelationshipGoal;
  height?: number;
  education?: string;
  job?: string;
  company?: string;
  followers: number;
  following: number;
  likes: number;
  eloScore: number;
  lastActive: string;
  createdAt: string;
  preferences: MatchPreferences;
  badges: Badge[];
}

export interface ProfilePhoto {
  id: string;
  url: string;
  isMain: boolean;
  isVerified: boolean;
  order: number;
}

export interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}

export interface MatchPreferences {
  ageRange: { min: number; max: number };
  distance: number;
  genders: Gender[];
  relationshipGoals: RelationshipGoal[];
  showMe: boolean;
  dealbreakers: string[];
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  earnedAt: string;
}

export interface Match {
  id: string;
  users: [string, string];
  matchedAt: string;
  type: 'like' | 'superlike';
  compatibility: number;
  icebreaker?: string;
  lastMessage?: Message;
  unreadCount: number;
  isActive: boolean;
  expiresAt?: string;
}

export interface Message {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  type: ChatType;
  mediaUrl?: string;
  reactions: string[];
  readAt?: string;
  createdAt: string;
}

export interface VideoChat {
  id: string;
  participants: [string, string];
  status: VideoChatStatus;
  matchedInterests: string[];
  startedAt: string;
  endedAt?: string;
  duration: number;
  hasTextFallback: boolean;
  reportedBy?: string;
}

export interface VideoChatPreferences {
  interests: string[];
  ageRange: { min: number; max: number };
  genders: Gender[];
  language: string;
  enableTextFallback: boolean;
  enableGames: boolean;
}

export interface LiveEvent {
  id: string;
  hostId: string;
  host: UserProfile;
  title: string;
  type: 'solo' | 'dating-event' | 'speed-dating' | 'group-video' | 'party';
  thumbnailUrl: string;
  viewerCount: number;
  maxParticipants: number;
  isLive: boolean;
  startedAt: string;
  scheduledAt?: string;
  tags: string[];
}

export interface SwipeAction {
  userId: string;
  targetUserId: string;
  action: MatchAction;
  timestamp: string;
}

export interface SafetyReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  description: string;
  evidence?: string[];
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface Discover {
  type: 'people' | 'events' | 'groups' | 'nearby';
  items: (UserProfile | LiveEvent | InterestGroup)[];
}

export interface InterestGroup {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  imageUrl: string;
  interests: string[];
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  hashtag: string;
  sound?: Sound;
  participantCount: number;
  videoCount: number;
  expiresAt: string;
}

export interface RouteDefinition {
  method: string;
  path: string;
  handler: (req: any, res: any) => Promise<void>;
  middleware?: any[];
  requiresAuth?: boolean;
}
