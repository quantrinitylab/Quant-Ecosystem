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
 * Extracts tokens from query parameters or Authorization header.
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
   * Checks query parameter ?token= first, then Authorization header.
   */
  extractToken(request: IncomingMessage): string | null {
    // Try query parameter
    const url = request.url || '';
    const queryStart = url.indexOf('?');
    if (queryStart !== -1) {
      const params = new URLSearchParams(url.slice(queryStart));
      const token = params.get('token');
      if (token) return token;
    }

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
