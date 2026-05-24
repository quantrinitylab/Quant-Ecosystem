// ============================================================================
// Database Models - User Model
// ============================================================================

import { BaseModel } from './base-model';
import type { UserSchema, UserPreferences } from '../schemas/users';
import { USERS_TABLE } from '../schemas/users';

/**
 * User model with specialized queries for user management
 */
export class UserModel extends BaseModel<UserSchema> {
  protected tableName = 'users';
  protected primaryKey = 'id';

  constructor() {
    super();
    this.registerHook('beforeCreate', (record) => {
      if (!record.preferences) {
        record.preferences = this.getDefaultPreferences();
      }
      if (!record.metadata) {
        record.metadata = {};
      }
      return record;
    });
  }

  /**
   * Find a user by email address
   */
  async findByEmail(email: string): Promise<UserSchema | null> {
    return this.findOne({
      filters: [{ field: 'email', operator: 'eq', value: email.toLowerCase() }],
    });
  }

  /**
   * Find a user by username
   */
  async findByUsername(username: string): Promise<UserSchema | null> {
    return this.findOne({
      filters: [{ field: 'username', operator: 'eq', value: username }],
    });
  }

  /**
   * Find a user by phone number
   */
  async findByPhone(phone: string): Promise<UserSchema | null> {
    return this.findOne({
      filters: [{ field: 'phoneNumber', operator: 'eq', value: phone }],
    });
  }

  /**
   * Search users by display name or username
   */
  async search(query: string, limit: number = 20): Promise<UserSchema[]> {
    return this.findMany({
      filters: [
        { field: 'displayName', operator: 'ilike', value: query },
      ],
      limit,
      orderBy: [{ field: 'displayName', direction: 'asc' }],
    });
  }

  /**
   * Update last login information
   */
  async recordLogin(userId: string, ipAddress: string): Promise<UserSchema | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    return this.update(userId, {
      lastLoginAt: new Date().toISOString(),
      lastLoginIp: ipAddress,
      loginCount: user.loginCount + 1,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    });
  }

  /**
   * Record a failed login attempt
   */
  async recordFailedLogin(userId: string): Promise<UserSchema | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const attempts = user.failedLoginAttempts + 1;
    const lockoutUntil = attempts >= 5
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;
    return this.update(userId, {
      failedLoginAttempts: attempts,
      lockoutUntil,
    });
  }

  /**
   * Check if user account is locked
   */
  async isLocked(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || !user.lockoutUntil) return false;
    return new Date(user.lockoutUntil) > new Date();
  }

  /**
   * Verify email for a user
   */
  async verifyEmail(userId: string): Promise<UserSchema | null> {
    return this.update(userId, {
      emailVerified: true,
      status: 'active',
    });
  }

  /**
   * Verify phone for a user
   */
  async verifyPhone(userId: string): Promise<UserSchema | null> {
    return this.update(userId, {
      phoneVerified: true,
    });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserSchema | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    return this.update(userId, {
      preferences: { ...user.preferences, ...preferences },
    });
  }

  /**
   * Suspend a user account
   */
  async suspend(userId: string): Promise<UserSchema | null> {
    return this.update(userId, { status: 'suspended' });
  }

  /**
   * Deactivate a user account
   */
  async deactivate(userId: string): Promise<UserSchema | null> {
    return this.update(userId, { status: 'deactivated' });
  }

  /**
   * Reactivate a user account
   */
  async reactivate(userId: string): Promise<UserSchema | null> {
    return this.update(userId, { status: 'active' });
  }

  /**
   * Get default user preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      theme: 'system',
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        push: true,
        sms: false,
        inApp: true,
        marketing: false,
        digest: 'daily',
      },
      privacy: {
        profileVisibility: 'public',
        showOnlineStatus: true,
        showLastSeen: true,
        allowDirectMessages: 'everyone',
        showActivityStatus: true,
      },
    };
  }

  getTableDefinition() {
    return USERS_TABLE;
  }
}
