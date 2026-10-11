// ============================================================================
// Realtime - Connection Authentication
// ============================================================================

import { jwtVerify, type JWTPayload } from 'jose';
import type { IncomingMessage } from 'node:http';
import type { AuthPayload } from './types';
import type { QuantApp } from '@quant/common';

/** Auth configuration */
export interface AuthConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

/**
 * ConnectionAuth
 *
 * Handles JWT authentication for WebSocket upgrade requests.
 * Extracts tokens from the Authorization header or the
 * Sec-WebSocket-Protocol header — NEVER from the URL query string.
 * Query-string tokens (?token=) leak into access logs, browser history
 * and Referer headers; the REST side already rejects them for exactly
 * that reason (packages/server-core/src/plugins/auth.ts), and the WS
 * side follows the same policy (QC-F-037).
 */
export class ConnectionAuth {
  private secret: Uint8Array;
  private issuer: string;
  private audience: string;

  constructor(config: AuthConfig) {
    this.secret = new TextEncoder().encode(config.jwtSecret);
    this.issuer = config.jwtIssuer;
    this.audience = config.jwtAudience;
  }

  /**
   * Authenticate a WebSocket upgrade request.
   * Extracts and validates a JWT token from the request.
   */
  async authenticateUpgrade(request: IncomingMessage): Promise<AuthPayload> {
    const token = this.extractToken(request);
    if (!token) {
      throw new AuthError('No token provided', 4001);
    }
    return this.verifyToken(token);
  }

  /**
   * Extract token from the request.
   * Checks the Authorization header first, then Sec-WebSocket-Protocol.
   * The URL query string is deliberately NOT consulted: a ?token= in the
   * URL must neither authenticate a request nor override a header token.
   */
  extractToken(request: IncomingMessage): string | null {
    // Try Authorization header
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try Sec-WebSocket-Protocol header (used as token transport)
    const protocols = request.headers['sec-websocket-protocol'];
    if (protocols) {
      const parts = protocols.split(',').map((s) => s.trim());
      if (parts.length > 0 && parts[0]) {
        return parts[0];
      }
    }

    return null;
  }

  /**
   * Verify a JWT token and extract the auth payload.
   */
  async verifyToken(token: string): Promise<AuthPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
      });
      // QC-F-030 token-kind gate: QuantChat's issuer signs access (1h) and
      // refresh (30d) tokens with the same secret/issuer/audience — `kind`
      // is the only separator — so a refresh token must never open a
      // WebSocket as if it were an access token. Phase-1 policy matches
      // the server-core REST gate: a present kind that is not 'access' is
      // rejected; a missing kind (the ecosystem's live kind-less access
      // tokens) is accepted.
      const kind = payload['kind'];
      if (kind !== undefined && kind !== 'access') {
        throw new AuthError('Invalid token', 4001);
      }
      return this.extractPayload(payload);
    } catch (error) {
      if (error instanceof Error && error.message.includes('expired')) {
        throw new AuthError('Token expired', 4001);
      }
      throw new AuthError('Invalid token', 4001);
    }
  }

  /**
   * Extract AuthPayload from JWT claims.
   */
  private extractPayload(payload: JWTPayload): AuthPayload {
    const userId = (payload.sub || payload.userId) as string | undefined;
    if (!userId) {
      throw new AuthError('Token missing userId', 4001);
    }

    return {
      userId,
      email: payload.email as string | undefined,
      username: payload.username as string | undefined,
      role: payload.role as string | undefined,
      scopes: (payload.scopes as string[]) || [],
      app: (payload.app as QuantApp) || 'quantchat',
    };
  }
}

/**
 * Authentication error with WebSocket close code.
 */
export class AuthError extends Error {
  code: number;
  constructor(message: string, code: number = 4001) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}
