// ============================================================================
// Auth - Middleware for Token Validation
// ============================================================================

import type { AuthContext, AuthConfig, TokenPayload } from '../types';
import type { PermissionScope } from '@quant/common';
import { TokenService } from '../services/token-service';
import { SessionService } from '../services/session-service';

/** HTTP Request-like interface (framework agnostic) */
export interface AuthRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  query?: Record<string, string>;
}

/** HTTP Response-like interface (framework agnostic) */
export interface AuthResponse {
  status(code: number): AuthResponse;
  json(data: unknown): void;
  setHeader(name: string, value: string): void;
}

/** Next function type */
export type NextFunction = () => void | Promise<void>;

/** Middleware options */
export interface AuthMiddlewareOptions {
  requiredScopes?: PermissionScope[];
  allowExpiredToken?: boolean;
  requireActiveSession?: boolean;
}

/**
 * Auth Middleware
 *
 * Express-compatible middleware for protecting routes with JWT authentication.
 * Supports:
 * - Bearer token extraction from Authorization header
 * - Token validation and payload extraction
 * - Scope-based authorization
 * - Session validation
 * - Rate limiting integration
 */
export class AuthMiddleware {
  private tokenService: TokenService;
  private sessionService: SessionService;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.tokenService = new TokenService(config);
    this.sessionService = new SessionService(config);
  }

  /**
   * Create authentication middleware
   * Validates the token and attaches user context to the request
   */
  authenticate(options: AuthMiddlewareOptions = {}) {
    return async (req: AuthRequest & { auth?: AuthContext }, res: AuthResponse, next: NextFunction): Promise<void> => {
      // Extract token from Authorization header
      const token = this.extractToken(req);
      if (!token) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_TOKEN_MISSING',
            message: 'Authentication required. Please provide a valid Bearer token.',
            statusCode: 401,
          },
        });
        return;
      }

      // Validate token
      const payload = await this.tokenService.validateAccessToken(token);
      if (!payload) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Invalid or expired authentication token.',
            statusCode: 401,
          },
        });
        return;
      }

      // Check required scopes
      if (options.requiredScopes && options.requiredScopes.length > 0) {
        const hasRequiredScopes = options.requiredScopes.every(
          (scope) => payload.scopes.includes(scope)
        );
        if (!hasRequiredScopes) {
          res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_INSUFFICIENT_SCOPE',
              message: `Required scopes: ${options.requiredScopes.join(', ')}`,
              statusCode: 403,
            },
          });
          return;
        }
      }

      // Attach auth context to request
      req.auth = {
        userId: payload.sub,
        email: payload.email,
        username: payload.username,
        role: payload.role,
        scopes: payload.scopes,
        sessionId: payload.jti,
        app: payload.app,
        tokenId: payload.jti,
      };

      // Touch session for activity tracking
      await this.sessionService.touchSession(payload.jti);

      await next();
    };
  }

  /**
   * Create authorization middleware that checks for specific roles
   */
  requireRole(...roles: string[]) {
    return async (req: AuthRequest & { auth?: AuthContext }, res: AuthResponse, next: NextFunction): Promise<void> => {
      if (!req.auth) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_NOT_AUTHENTICATED',
            message: 'Authentication required',
            statusCode: 401,
          },
        });
        return;
      }

      if (!roles.includes(req.auth.role)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_FORBIDDEN',
            message: `Access restricted to roles: ${roles.join(', ')}`,
            statusCode: 403,
          },
        });
        return;
      }

      await next();
    };
  }

  /**
   * Create authorization middleware that checks for specific scopes
   */
  requireScopes(...scopes: PermissionScope[]) {
    return async (req: AuthRequest & { auth?: AuthContext }, res: AuthResponse, next: NextFunction): Promise<void> => {
      if (!req.auth) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_NOT_AUTHENTICATED',
            message: 'Authentication required',
            statusCode: 401,
          },
        });
        return;
      }

      const missingScopes = scopes.filter((s) => !req.auth!.scopes.includes(s));
      if (missingScopes.length > 0) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_INSUFFICIENT_SCOPE',
            message: `Missing required scopes: ${missingScopes.join(', ')}`,
            statusCode: 403,
          },
        });
        return;
      }

      await next();
    };
  }

  /**
   * Optional authentication - attaches context if token is present, continues otherwise
   */
  optionalAuth() {
    return async (req: AuthRequest & { auth?: AuthContext }, _res: AuthResponse, next: NextFunction): Promise<void> => {
      const token = this.extractToken(req);
      if (token) {
        const payload = await this.tokenService.validateAccessToken(token);
        if (payload) {
          req.auth = {
            userId: payload.sub,
            email: payload.email,
            username: payload.username,
            role: payload.role,
            scopes: payload.scopes,
            sessionId: payload.jti,
            app: payload.app,
            tokenId: payload.jti,
          };
        }
      }
      await next();
    };
  }

  /**
   * Extract bearer token from request
   */
  private extractToken(req: AuthRequest): string | null {
    // Try Authorization header first
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try cookie (for web apps)
    if (req.cookies?.access_token) {
      return req.cookies.access_token;
    }

    // Try query parameter (for WebSocket connections)
    if (req.query?.token) {
      return req.query.token;
    }

    return null;
  }
}

/**
 * Create a pre-configured auth middleware instance
 */
export function createAuthMiddleware(config: AuthConfig): AuthMiddleware {
  return new AuthMiddleware(config);
}
