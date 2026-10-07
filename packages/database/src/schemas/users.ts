// ============================================================================
// Database Schema - Users (Shared across all apps)
// ============================================================================

/** User account schema - central identity across ecosystem */
export interface UserSchema {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  phoneNumber: string | null;
  role: 'user' | 'admin' | 'moderator' | 'creator' | 'advertiser';
  status: 'active' | 'suspended' | 'deactivated' | 'pending_verification';
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  dateOfBirth: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  loginCount: number;
  failedLoginAttempts: number;
  lockoutUntil: string | null;
  preferences: UserPreferences;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** User preferences stored in JSON */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications: NotificationPreferences;
  privacy: PrivacySettings;
}

/** Notification preferences */
export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  inApp: boolean;
  marketing: boolean;
  digest: 'none' | 'daily' | 'weekly';
}

/** Privacy settings */
export interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  allowDirectMessages: 'everyone' | 'friends' | 'nobody';
  showActivityStatus: boolean;
}

/** OAuth connected accounts */
export interface OAuthAccountSchema {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

/** User relationships (follows, blocks) */
export interface UserRelationshipSchema {
  id: string;
  followerId: string;
  followingId: string;
  type: 'follow' | 'block' | 'mute';
  createdAt: string;
}

/** User verification/badge system */
export interface UserVerificationSchema {
  id: string;
  userId: string;
  type: 'identity' | 'creator' | 'business' | 'government';
  status: 'pending' | 'approved' | 'rejected';
  documentUrl: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** SQL-like table definition for reference */
export const USERS_TABLE = {
  tableName: 'users',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
    { name: 'email', type: 'VARCHAR(254)', unique: true, nullable: false },
    { name: 'username', type: 'VARCHAR(30)', unique: true, nullable: false },
    { name: 'display_name', type: 'VARCHAR(50)', nullable: false },
    { name: 'password_hash', type: 'VARCHAR(255)', nullable: false },
    { name: 'avatar_url', type: 'TEXT', nullable: true },
    { name: 'banner_url', type: 'TEXT', nullable: true },
    { name: 'phone_number', type: 'VARCHAR(20)', unique: true, nullable: true },
    { name: 'role', type: "VARCHAR(20) DEFAULT 'user'", nullable: false },
    { name: 'status', type: "VARCHAR(30) DEFAULT 'pending_verification'", nullable: false },
    { name: 'email_verified', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'phone_verified', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'two_factor_enabled', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'two_factor_secret', type: 'VARCHAR(255)', nullable: true },
    { name: 'bio', type: 'TEXT', nullable: true },
    { name: 'website', type: 'VARCHAR(500)', nullable: true },
    { name: 'location', type: 'VARCHAR(100)', nullable: true },
    { name: 'date_of_birth', type: 'DATE', nullable: true },
    { name: 'last_login_at', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'last_login_ip', type: 'INET', nullable: true },
    { name: 'login_count', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'failed_login_attempts', type: 'INTEGER DEFAULT 0', nullable: false },
    { name: 'lockout_until', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'preferences', type: "JSONB DEFAULT '{}'", nullable: false },
    { name: 'metadata', type: "JSONB DEFAULT '{}'", nullable: false },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: true },
  ],
  indexes: [
    { name: 'idx_users_email', columns: ['email'] },
    { name: 'idx_users_username', columns: ['username'] },
    { name: 'idx_users_phone', columns: ['phone_number'] },
    { name: 'idx_users_status', columns: ['status'] },
    { name: 'idx_users_created_at', columns: ['created_at'] },
  ],
} as const;
