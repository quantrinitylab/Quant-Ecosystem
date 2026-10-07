// ============================================================================
// Security Package - Session Security
// ============================================================================

import crypto from 'crypto';
import type { SessionConfig, SecureSession } from '../types';

/** Default session configuration */
const DEFAULT_CONFIG: SessionConfig = {
  maxConcurrent: 5,
  idleTimeout: 1800000,
  absoluteTimeout: 86400000,
  rotateOnAuth: true,
  secureCookie: true,
  sameSite: 'strict',
  fingerprintBinding: true,
  fingerprintSecret: 'default-fingerprint-secret-change-in-production',
};

/**
 * SessionSecurity - Comprehensive session security with fixation prevention,
 * rotation on privilege escalation, secure cookies, concurrent limits, and idle timeout.
 */
export class SessionSecurity {
  private config: SessionConfig;
  private sessions: Map<string, SecureSession>;
  private userSessions: Map<string, string[]>;
  private rotationHistory: Map<string, string>;
  private fingerprints: Map<string, string>;
  private sessionCount: number;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (
      process.env.NODE_ENV === 'production' &&
      this.config.fingerprintSecret === DEFAULT_CONFIG.fingerprintSecret
    ) {
      throw new Error('SessionSecurity requires an explicit fingerprintSecret in production');
    }
    this.sessions = new Map();
    this.userSessions = new Map();
    this.rotationHistory = new Map();
    this.fingerprints = new Map();
    this.sessionCount = 0;
  }

  /** Create a new secure session */
  async createSession(
    userId: string,
    params: {
      ip: string;
      userAgent: string;
      privilegeLevel?: number;
    },
  ): Promise<SecureSession> {
    const now = Date.now();

    // Enforce concurrent session limits
    await this.enforceConcurrentLimit(userId);

    const sessionId = this.generateSessionId();
    const fingerprint = this.generateFingerprint(params.ip, params.userAgent);

    const session: SecureSession = {
      id: sessionId,
      userId,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + this.config.absoluteTimeout,
      fingerprint,
      ip: params.ip,
      userAgent: params.userAgent,
      privilegeLevel: params.privilegeLevel || 0,
    };

    this.sessions.set(sessionId, session);
    this.fingerprints.set(sessionId, fingerprint);

    // Track user sessions
    const userSessionList = this.userSessions.get(userId) || [];
    userSessionList.push(sessionId);
    this.userSessions.set(userId, userSessionList);

    this.sessionCount++;
    return session;
  }

  /** Validate a session */
  async validateSession(
    sessionId: string,
    params: {
      ip: string;
      userAgent: string;
    },
  ): Promise<{ valid: boolean; reason: string; session?: SecureSession }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, reason: 'session_not_found' };
    }

    const now = Date.now();

    // Check absolute timeout
    if (now > session.expiresAt) {
      await this.destroySession(sessionId);
      return { valid: false, reason: 'session_expired' };
    }

    // Check idle timeout
    if (now - session.lastActivity > this.config.idleTimeout) {
      await this.destroySession(sessionId);
      return { valid: false, reason: 'idle_timeout' };
    }

    // Fingerprint binding validation
    if (this.config.fingerprintBinding) {
      const currentFingerprint = this.generateFingerprint(params.ip, params.userAgent);
      if (session.fingerprint !== currentFingerprint) {
        // Potential session hijacking
        await this.destroySession(sessionId);
        return { valid: false, reason: 'fingerprint_mismatch' };
      }
    }

    // Update last activity
    session.lastActivity = now;

    return { valid: true, reason: 'valid', session };
  }

  /** Rotate session (generate new ID, invalidate old) - prevents fixation */
  async rotateSession(oldSessionId: string): Promise<SecureSession | null> {
    const oldSession = this.sessions.get(oldSessionId);
    if (!oldSession) return null;

    const now = Date.now();
    const newSessionId = this.generateSessionId();

    // Create new session with same data but new ID
    const newSession: SecureSession = {
      ...oldSession,
      id: newSessionId,
      lastActivity: now,
      rotatedFrom: oldSessionId,
    };

    // Store new session
    this.sessions.set(newSessionId, newSession);
    this.fingerprints.set(newSessionId, oldSession.fingerprint);

    // Update user session tracking
    const userSessionList = this.userSessions.get(oldSession.userId) || [];
    const idx = userSessionList.indexOf(oldSessionId);
    if (idx >= 0) {
      userSessionList[idx] = newSessionId;
    }

    // Record rotation history (for detecting rotation attacks)
    this.rotationHistory.set(oldSessionId, newSessionId);

    // Destroy old session
    this.sessions.delete(oldSessionId);
    this.fingerprints.delete(oldSessionId);

    return newSession;
  }

  /** Rotate session on privilege escalation (e.g., login, sudo) */
  async onPrivilegeEscalation(
    sessionId: string,
    newPrivilegeLevel: number,
  ): Promise<SecureSession | null> {
    if (!this.config.rotateOnAuth) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.privilegeLevel = newPrivilegeLevel;
        return session;
      }
      return null;
    }

    // Rotate session to prevent fixation
    const newSession = await this.rotateSession(sessionId);
    if (newSession) {
      newSession.privilegeLevel = newPrivilegeLevel;
    }
    return newSession;
  }

  /** Destroy a session */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove from user sessions
    const userSessionList = this.userSessions.get(session.userId) || [];
    const idx = userSessionList.indexOf(sessionId);
    if (idx >= 0) {
      userSessionList.splice(idx, 1);
    }

    // Remove session data
    this.sessions.delete(sessionId);
    this.fingerprints.delete(sessionId);

    return true;
  }

  /** Destroy all sessions for a user */
  async destroyAllUserSessions(userId: string): Promise<number> {
    const userSessionList = this.userSessions.get(userId) || [];
    let destroyed = 0;

    for (const sessionId of [...userSessionList]) {
      this.sessions.delete(sessionId);
      this.fingerprints.delete(sessionId);
      destroyed++;
    }

    this.userSessions.delete(userId);
    return destroyed;
  }

  /** Get all active sessions for a user */
  getUserSessions(userId: string): SecureSession[] {
    const sessionIds = this.userSessions.get(userId) || [];
    return sessionIds
      .map((id) => this.sessions.get(id))
      .filter((s): s is SecureSession => s !== undefined);
  }

  /** Generate secure cookie attributes */
  getCookieAttributes(sessionId: string): string {
    const parts = [`sid=${sessionId}`, 'Path=/', 'HttpOnly', `SameSite=${this.config.sameSite}`];

    if (this.config.secureCookie) {
      parts.push('Secure');
    }

    // Set expiry to absolute timeout
    const maxAge = Math.floor(this.config.absoluteTimeout / 1000);
    parts.push(`Max-Age=${maxAge}`);

    return parts.join('; ');
  }

  /** Enforce concurrent session limit */
  private async enforceConcurrentLimit(userId: string): Promise<void> {
    const userSessionList = this.userSessions.get(userId) || [];

    if (userSessionList.length >= this.config.maxConcurrent) {
      // Remove oldest sessions until under limit
      const sessionsToRemove = userSessionList.length - this.config.maxConcurrent + 1;
      const sortedSessions = userSessionList
        .map((id) => this.sessions.get(id))
        .filter((s): s is SecureSession => s !== undefined)
        .sort((a, b) => a.lastActivity - b.lastActivity);

      for (let i = 0; i < sessionsToRemove && i < sortedSessions.length; i++) {
        await this.destroySession(sortedSessions[i]!.id);
      }
    }
  }

  /** Generate a cryptographically secure session ID */
  private generateSessionId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 48; i++) {
      id += chars[crypto.randomInt(chars.length)];
    }
    return id;
  }

  /** Generate fingerprint from client attributes (keyed HMAC-SHA256) */
  private generateFingerprint(ip: string, userAgent: string): string {
    return crypto
      .createHmac('sha256', this.config.fingerprintSecret)
      .update(`${ip}:${userAgent}`)
      .digest('hex');
  }

  /** Cleanup expired sessions */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      const expired = now > session.expiresAt;
      const idle = now - session.lastActivity > this.config.idleTimeout;

      if (expired || idle) {
        await this.destroySession(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /** Get session statistics */
  getStats(): { activeSessions: number; totalCreated: number; uniqueUsers: number } {
    return {
      activeSessions: this.sessions.size,
      totalCreated: this.sessionCount,
      uniqueUsers: this.userSessions.size,
    };
  }
}

// Security: CodeQL #65/#66: session IDs use crypto.randomInt (CSPRNG).
