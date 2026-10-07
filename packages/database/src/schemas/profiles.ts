// ============================================================================
// Database Schema - Profiles (QuantMax - Dating/TikTok/Omegle)
// ============================================================================

/** Dating profile schema */
export interface DatingProfileSchema {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  age: number;
  gender: string;
  genderPreference: string[];
  location: DatingLocation;
  photos: DatingPhoto[];
  prompts: DatingPrompt[];
  interests: string[];
  lifestyle: LifestyleInfo;
  preferences: DatingPreferences;
  verificationStatus: 'unverified' | 'photo_verified' | 'id_verified';
  isActive: boolean;
  isPremium: boolean;
  profileScore: number;
  lastActive: string;
  swipeCount: number;
  matchCount: number;
  likeCount: number;
  superLikeCount: number;
  boostExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Dating location */
export interface DatingLocation {
  latitude: number;
  longitude: number;
  city: string;
  state: string | null;
  country: string;
  showDistance: boolean;
}

/** Dating photo */
export interface DatingPhoto {
  id: string;
  url: string;
  sortOrder: number;
  isVerification: boolean;
  caption: string | null;
}

/** Dating prompt/question */
export interface DatingPrompt {
  question: string;
  answer: string;
}

/** Lifestyle information */
export interface LifestyleInfo {
  height: number | null;
  education: string | null;
  occupation: string | null;
  company: string | null;
  drinking: 'never' | 'rarely' | 'socially' | 'regularly' | null;
  smoking: 'never' | 'occasionally' | 'regularly' | null;
  exercise: 'never' | 'sometimes' | 'active' | 'daily' | null;
  pets: string[] | null;
  zodiac: string | null;
  religion: string | null;
  politicalViews: string | null;
}

/** Dating preferences */
export interface DatingPreferences {
  ageRange: { min: number; max: number };
  maxDistance: number;
  distanceUnit: 'km' | 'mi';
  showMe: 'men' | 'women' | 'everyone';
  dealbreakers: string[];
}

/** Match schema */
export interface MatchSchema {
  id: string;
  user1Id: string;
  user2Id: string;
  type: 'like' | 'super_like' | 'mutual';
  status: 'pending' | 'matched' | 'unmatched' | 'blocked';
  matchedAt: string | null;
  lastInteractionAt: string | null;
  conversationId: string | null;
  icebreaker: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Swipe action schema */
export interface SwipeSchema {
  id: string;
  userId: string;
  targetUserId: string;
  action: 'like' | 'dislike' | 'super_like' | 'rewind';
  createdAt: string;
}

/** Short-form video schema (TikTok-style) */
export interface ShortVideoSchema {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string | null;
  audioId: string | null;
  audioName: string | null;
  duration: number;
  width: number;
  height: number;
  hashtags: string[];
  mentions: string[];
  effects: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  isPrivate: boolean;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  aiLabels: string[];
  moderationStatus: 'pending' | 'approved' | 'flagged' | 'removed';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Random video chat session (Omegle-style) */
export interface RandomChatSessionSchema {
  id: string;
  user1Id: string;
  user2Id: string | null;
  type: 'video' | 'text';
  status: 'waiting' | 'active' | 'ended' | 'reported';
  interests: string[];
  matchedOnInterests: string[];
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  user1Rating: number | null;
  user2Rating: number | null;
  reportedBy: string | null;
  reportReason: string | null;
  createdAt: string;
}

/** User report schema */
export interface UserReportSchema {
  id: string;
  reporterId: string;
  reportedUserId: string;
  type: 'harassment' | 'spam' | 'inappropriate' | 'fake_profile' | 'underage' | 'other';
  description: string;
  evidence: string[];
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DATING_PROFILES_TABLE = {
  tableName: 'dating_profiles',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'user_id', type: 'UUID', unique: true, nullable: false, references: 'users(id)' },
    { name: 'display_name', type: 'VARCHAR(50)', nullable: false },
    { name: 'bio', type: 'TEXT', nullable: false },
    { name: 'age', type: 'INTEGER', nullable: false },
    { name: 'gender', type: 'VARCHAR(30)', nullable: false },
    { name: 'gender_preference', type: 'JSONB', nullable: false },
    { name: 'location', type: 'JSONB', nullable: false },
    { name: 'photos', type: 'JSONB', nullable: false },
    { name: 'prompts', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'interests', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'lifestyle', type: "JSONB DEFAULT '{}'", nullable: false },
    { name: 'preferences', type: 'JSONB', nullable: false },
    { name: 'verification_status', type: "VARCHAR(20) DEFAULT 'unverified'", nullable: false },
    { name: 'is_active', type: 'BOOLEAN DEFAULT TRUE', nullable: false },
    { name: 'is_premium', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'profile_score', type: 'FLOAT DEFAULT 0', nullable: false },
    { name: 'last_active', type: 'TIMESTAMPTZ', nullable: false },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
  ],
  indexes: [
    { name: 'idx_dating_profiles_user', columns: ['user_id'] },
    { name: 'idx_dating_profiles_active', columns: ['is_active', 'last_active'] },
    { name: 'idx_dating_profiles_location', columns: ['location'] },
  ],
} as const;
