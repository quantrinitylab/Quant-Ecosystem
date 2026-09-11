// ============================================================================
// Auth - SSO Middleware for Cross-App Token Validation
// ============================================================================

import type { AuthConfig, TokenPayload } from '../types';
import type { QuantApp, PermissionScope } from '@quant/common';
import { TokenService } from '../services/token-service';
import { SessionService } from '../services/session-service';

/** App scope configuration for cross-app SSO */
const APP_ALLOWED_SCOPES: Record<QuantApp, PermissionScope[]> = {
  quantchat: [
    'profile:read',
    'messages:read',
    'messages:write',
    'contacts:read',
    'realtime:connect',
  ],
  quantmail: [
    'profile:read',
    'profile:write',
    'email:read',
    'email:send',
    'contacts:read',
    'contacts:write',
  ],
  quantwave: ['profile:read', 'realtime:connect', 'contacts:read'],
  quantgram: ['profile:read', 'posts:read', 'posts:write', 'media:read', 'media:upload'],
  quantcooks: ['profile:read', 'media:read', 'media:upload'],
  quantads: ['profile:read', 'ads:manage', 'analytics:read'],
  quantube: ['profile:read', 'media:read', 'media:upload', 'posts:read', 'posts:write'],
  quantmax: ['profile:read', 'ai:use', 'workspace:read', 'workspace:manage'],
  quantai: [
    'profile:read',
    'ai:use',
    'agent:execute',
    'agent:manage',
    'memory:read',
    'memory:write',
  ],
  quanttrinity: [
    'profile:read',
    'workspace:read',
    'workspace:manage',
    'analytics:read',
    'ai:use',
  ],
  quantsync: ['profile:read', 'realtime:connect', 'contacts:read'],
  quantneon: ['profile:read', 'posts:read', 'posts:write', 'media:read', 'media:upload'],
  quantedits: ['profile:read', 'media:read', 'media:upload'],
  quantdocs: ['profile:read', 'workspace:read', 'workspace:manage'],
  quantdrive: ['profile:read', 'media:read', 'media:upload', 'workspace:read'],
  quantcalendar: ['profile:read', 'contacts:read', 'realtime:connect'],
  quantmeet: ['profile:read', 'contacts:read', 'realtime:connect', 'media:read'],
};

/** Result of cross-app token validation */
export interface CrossAppValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  reason?: string;
}

/** Result of cross-app session refresh */
export interface CrossAppSessionResult {
  success: boolean;
  sessionId?: string;
  reason?: string;
}

/** Result of logout propagation */
export interface LogoutPropagationResult {
  success: boolean;
  revokedSessions: number;
  apps: QuantApp[];
}

/**
 * SSO Middleware
 *
 * Provides cross-app Single Sign-On capabilities for the Quant Ecosystem.
 * Ensures that a user authenticated in one app can seamlessly access other
 * apps without re-authentication, subject to scope validation.
 */
export class SSOMiddleware {
  private tokenService: TokenService;
  private sessionService: SessionService;

  constructor(config: AuthConfig) {
    this.tokenService = new TokenService(config);
    this.sessionService = new SessionService(config);
  }

  /**
   * Validate a JWT token for use in a target app.
   * Checks token validity, expiry, and whether the token's scopes
   * are allowed for the target app.
   */
  async validateCrossAppToken(
    token: string,
    targetApp: QuantApp,
  ): Promise<CrossAppValidationResult> {
    // Validate the token itself
    const payload = await this.tokenService.validateAccessToken(token);
    if (!payload) {
      return { valid: false, reason: 'Token is invalid or expired' };
    }

    // Check if token has expired (double-check)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return { valid: false, reason: 'Token has expired' };
    }

    // Verify the token's scopes are compatible with the target app
    const allowedScopes = APP_ALLOWED_SCOPES[targetApp];
    if (!allowedScopes) {
      return { valid: false, reason: `Unknown target app: ${targetApp}` };
    }

    // Check that at least one token scope is allowed in the target app
    const hasValidScope = payload.scopes.some((scope) => allowedScopes.includes(scope));
    if (!hasValidScope) {
      return {
        valid: false,
        reason: `Token scopes are not authorized for ${targetApp}`,
      };
    }

    // Validate that the session is still active
    const session = await this.sessionService.getSession(payload.jti);
    if (session && !session.isActive) {
      return { valid: false, reason: 'Session is no longer active' };
    }

    return { valid: true, payload };
  }

  /**
   * Extend an existing session to cover a new app without re-authentication.
   * Creates a new session entry for the target app linked to the same user.
   */
  async refreshCrossAppSession(
    sessionId: string,
    targetApp: QuantApp,
  ): Promise<CrossAppSessionResult> {
    // Get the existing session
    const existingSession = await this.sessionService.getSession(sessionId);
    if (!existingSession) {
      return { success: false, reason: 'Session not found or expired' };
    }

    if (!existingSession.isActive) {
      return { success: false, reason: 'Session is no longer active' };
    }

    // Check if user already has an active session for target app
    const hasExisting = await this.sessionService.hasActiveSessionForApp(
      existingSession.userId,
      targetApp,
    );
    if (hasExisting) {
      return { success: true, sessionId: existingSession.id };
    }

    // Create a new session for the target app
    const newSession = await this.sessionService.createSession({
      userId: existingSession.userId,
      tokenId: existingSession.tokenId,
      refreshTokenFamily: existingSession.refreshTokenFamily,
      deviceInfo: existingSession.deviceInfo,
      app: targetApp,
    });

    return { success: true, sessionId: newSession.id };
  }

  /**
   * Propagate logout across all apps by revoking all sessions for the user.
   * This ensures that when a user logs out of one app, they are logged out
   * of all apps in the ecosystem.
   */
  async propagateLogout(userId: string): Promise<LogoutPropagationResult> {
    // Get all sessions grouped by app before revoking
    const sessionsByApp = await this.sessionService.getSessionsByApp(userId);
    const apps: QuantApp[] = Array.from(sessionsByApp.keys());

    // Revoke all sessions for the user
    const revokedSessions = await this.sessionService.revokeAllSessions(userId);

    // Revoke all tokens for the user
    await this.tokenService.revokeAllForUser(userId);

    return {
      success: true,
      revokedSessions,
      apps,
    };
  }
}
