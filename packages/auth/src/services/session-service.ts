// ============================================================================
// Auth - Session Service
// ============================================================================

import type { AuthSession, DeviceLoginInfo, AuthConfig } from '../types';
import type { QuantApp } from '@quant/common';

/** Session creation options */
export interface CreateSessionOptions {
  userId: string;
  tokenId: string;
  refreshTokenFamily: string;
  deviceInfo: DeviceLoginInfo;
  app: QuantApp;
}

/**
 * Session Service
 *
 * Manages user sessions across all Quant Ecosystem apps.
 * Provides:
 * - Multi-device session tracking
 * - Cross-app session awareness (SSO)
 * - Session activity tracking
 * - Device management (view and revoke sessions)
 * - Concurrent session limits
 */
export class SessionService {
  private sessions: Map<string, AuthSession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private maxSessionsPerUser: number;
  private sessionTimeout: number;

  constructor(config: AuthConfig) {
    this.maxSessionsPerUser = 10; // Max 10 active sessions per user
    this.sessionTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  /**
   * Create a new session
   */
  async createSession(options: CreateSessionOptions): Promise<AuthSession> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: AuthSession = {
      id: sessionId,
      userId: options.userId,
      tokenId: options.tokenId,
      refreshTokenFamily: options.refreshTokenFamily,
      deviceInfo: options.deviceInfo,
      app: options.app,
      isActive: true,
      lastActivityAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionTimeout),
    };

    // Enforce session limit
    await this.enforceSessionLimit(options.userId);

    // Store session
    this.sessions.set(sessionId, session);

    // Track user sessions
    if (!this.userSessions.has(options.userId)) {
      this.userSessions.set(options.userId, new Set());
    }
    this.userSessions.get(options.userId)!.add(sessionId);

    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<AuthSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (session.expiresAt < new Date()) {
      await this.revokeSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<AuthSession[]> {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];

    const sessions: AuthSession[] = [];
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && session.isActive && session.expiresAt > new Date()) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  /**
   * Update session activity (heartbeat)
   */
  async touchSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.isActive) {
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;
    this.sessions.delete(sessionId);

    const userSessionSet = this.userSessions.get(session.userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);
    }

    return true;
  }

  /**
   * Revoke all sessions for a user (logout everywhere)
   */
  async revokeAllSessions(userId: string): Promise<number> {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return 0;

    let revoked = 0;
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.sessions.delete(sessionId);
        revoked++;
      }
    }

    this.userSessions.delete(userId);
    return revoked;
  }

  /**
   * Revoke all sessions except the current one
   */
  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return 0;

    let revoked = 0;
    for (const sessionId of sessionIds) {
      if (sessionId === currentSessionId) continue;
      const session = this.sessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.sessions.delete(sessionId);
        revoked++;
      }
    }

    // Keep only current session
    this.userSessions.set(userId, new Set([currentSessionId]));
    return revoked;
  }

  /**
   * Get active session count for a user
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    return sessions.length;
  }

  /**
   * Check if a user has an active session on a specific app
   */
  async hasActiveSessionForApp(userId: string, app: QuantApp): Promise<boolean> {
    const sessions = await this.getUserSessions(userId);
    return sessions.some((s) => s.app === app && s.isActive);
  }

  /**
   * Get sessions grouped by app (for cross-app SSO display)
   */
  async getSessionsByApp(userId: string): Promise<Map<QuantApp, AuthSession[]>> {
    const sessions = await this.getUserSessions(userId);
    const grouped = new Map<QuantApp, AuthSession[]>();

    for (const session of sessions) {
      const appSessions = grouped.get(session.app) || [];
      appSessions.push(session);
      grouped.set(session.app, appSessions);
    }

    return grouped;
  }

  /**
   * Enforce maximum session limit per user
   * Removes oldest sessions when limit is exceeded
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    if (sessions.length >= this.maxSessionsPerUser) {
      // Sort by last activity (oldest first) and remove excess
      const sorted = sessions.sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
      const toRemove = sorted.slice(0, sessions.length - this.maxSessionsPerUser + 1);
      for (const session of toRemove) {
        await this.revokeSession(session.id);
      }
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = new Date();

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now || !session.isActive) {
        this.sessions.delete(sessionId);
        const userSessionSet = this.userSessions.get(session.userId);
        if (userSessionSet) {
          userSessionSet.delete(sessionId);
        }
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 12);
    return `sess_${timestamp}${random}`;
  }
}
