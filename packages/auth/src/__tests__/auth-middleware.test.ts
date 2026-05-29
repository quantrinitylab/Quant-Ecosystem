import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthMiddleware, createAuthMiddleware } from '../middleware/auth-middleware';
import type { AuthRequest, AuthResponse, NextFunction } from '../middleware/auth-middleware';
import { TokenService } from '../services/token-service';
import { SessionService } from '../services/session-service';
import type { AuthConfig, AuthContext } from '../types';

const TEST_CONFIG: AuthConfig = {
  jwtSecret: 'test-secret-key-for-unit-tests-minimum-length',
  jwtRefreshSecret: 'test-refresh-secret-key-for-unit-tests',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 604800,
  issuer: 'quant-test',
  audience: 'quant-test-audience',
  bcryptRounds: 10,
  maxLoginAttempts: 5,
  lockoutDuration: 900,
};

/** Build a mock framework-agnostic response that records status + body. */
function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this as unknown as AuthResponse;
    },
    json(data: unknown) {
      this.body = data;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res;
}

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware;
  let next: ReturnType<typeof vi.fn>;
  let validToken: string;

  beforeEach(async () => {
    // Keep session touch a no-op so the success path doesn't need a session store.
    vi.spyOn(SessionService.prototype, 'touchSession').mockResolvedValue(undefined as never);
    middleware = new AuthMiddleware(TEST_CONFIG);

    const tokenService = new TokenService(TEST_CONFIG);
    const pair = await tokenService.generateTokenPair(
      'user-123',
      { email: 'test@quant.app', username: 'testuser', role: 'user' },
      ['profile:read', 'email:read'],
      'quantmail',
    );
    validToken = pair.accessToken;

    next = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  const req = (overrides: Partial<AuthRequest> = {}): AuthRequest & { auth?: AuthContext } => ({
    headers: {},
    ...overrides,
  });

  describe('authenticate', () => {
    it('rejects requests with no token (401 AUTH_TOKEN_MISSING)', async () => {
      const res = mockRes();
      await middleware.authenticate()(req(), res as unknown as AuthResponse, next as unknown as NextFunction);
      expect(res.statusCode).toBe(401);
      expect((res.body as any).error.code).toBe('AUTH_TOKEN_MISSING');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects an invalid token (401 AUTH_TOKEN_INVALID)', async () => {
      const res = mockRes();
      const r = req({ headers: { authorization: 'Bearer not-a-real-token' } });
      await middleware.authenticate()(r, res as unknown as AuthResponse, next as unknown as NextFunction);
      expect(res.statusCode).toBe(401);
      expect((res.body as any).error.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('accepts a valid token, attaches auth context, and calls next', async () => {
      const res = mockRes();
      const r = req({ headers: { authorization: `Bearer ${validToken}` } });
      await middleware.authenticate()(r, res as unknown as AuthResponse, next as unknown as NextFunction);
      expect(next).toHaveBeenCalled();
      expect(r.auth?.userId).toBe('user-123');
      expect(r.auth?.email).toBe('test@quant.app');
      expect(r.auth?.scopes).toContain('profile:read');
    });

    it('enforces required scopes (403 when missing)', async () => {
      const res = mockRes();
      const r = req({ headers: { authorization: `Bearer ${validToken}` } });
      await middleware.authenticate({ requiredScopes: ['admin:write'] as never })(
        r,
        res as unknown as AuthResponse,
        next,
      );
      expect(res.statusCode).toBe(403);
      expect((res.body as any).error.code).toBe('AUTH_INSUFFICIENT_SCOPE');
      expect(next).not.toHaveBeenCalled();
    });

    it('passes when all required scopes are present', async () => {
      const res = mockRes();
      const r = req({ headers: { authorization: `Bearer ${validToken}` } });
      await middleware.authenticate({ requiredScopes: ['profile:read'] as never })(
        r,
        res as unknown as AuthResponse,
        next,
      );
      expect(next).toHaveBeenCalled();
    });

    it('extracts the token from a cookie and from a query param', async () => {
      const res1 = mockRes();
      const r1 = req({ cookies: { access_token: validToken } });
      await middleware.authenticate()(r1, res1 as unknown as AuthResponse, next as unknown as NextFunction);
      expect(r1.auth?.userId).toBe('user-123');

      let flag2 = false;
      const next2 = Object.assign(async () => {
        flag2 = true;
      }, {}) as NextFunction;
      const r2 = req({ query: { token: validToken } });
      await middleware.authenticate()(r2, mockRes() as unknown as AuthResponse, next2);
      expect(flag2).toBe(true);
      expect(r2.auth?.userId).toBe('user-123');
    });
  });

  describe('requireRole', () => {
    it('401 when not authenticated', async () => {
      const res = mockRes();
      await middleware.requireRole('admin')(req(), res as unknown as AuthResponse, next as unknown as NextFunction);
      expect(res.statusCode).toBe(401);
      expect((res.body as any).error.code).toBe('AUTH_NOT_AUTHENTICATED');
    });

    it('403 when role not allowed', async () => {
      const res = mockRes();
      const r = req();
      r.auth = { role: 'user', scopes: [] } as unknown as AuthContext;
      await middleware.requireRole('admin')(r, res as unknown as AuthResponse, next as unknown as NextFunction);
      expect(res.statusCode).toBe(403);
      expect((res.body as any).error.code).toBe('AUTH_FORBIDDEN');
    });

    it('passes when role allowed', async () => {
      const r = req();
      r.auth = { role: 'admin', scopes: [] } as unknown as AuthContext;
      await middleware.requireRole('admin', 'superadmin')(
        r,
        mockRes() as unknown as AuthResponse,
        next,
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireScopes', () => {
    it('401 when not authenticated', async () => {
      const res = mockRes();
      await middleware.requireScopes('profile:read' as never)(
        req(),
        res as unknown as AuthResponse,
        next,
      );
      expect(res.statusCode).toBe(401);
    });

    it('403 listing missing scopes', async () => {
      const res = mockRes();
      const r = req();
      r.auth = { role: 'user', scopes: ['profile:read'] } as unknown as AuthContext;
      await middleware.requireScopes('email:write' as never)(
        r,
        res as unknown as AuthResponse,
        next,
      );
      expect(res.statusCode).toBe(403);
      expect((res.body as any).error.message).toContain('email:write');
    });

    it('passes when all scopes present', async () => {
      const r = req();
      r.auth = { role: 'user', scopes: ['profile:read', 'email:write'] } as unknown as AuthContext;
      await middleware.requireScopes('profile:read' as never)(
        r,
        mockRes() as unknown as AuthResponse,
        next,
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('continues without auth when no token', async () => {
      const r = req();
      await middleware.optionalAuth()(r, mockRes() as unknown as AuthResponse, next as unknown as NextFunction);
      expect(next).toHaveBeenCalled();
      expect(r.auth).toBeUndefined();
    });

    it('attaches auth when a valid token is present', async () => {
      const r = req({ headers: { authorization: `Bearer ${validToken}` } });
      await middleware.optionalAuth()(r, mockRes() as unknown as AuthResponse, next as unknown as NextFunction);
      expect(next).toHaveBeenCalled();
      expect(r.auth?.userId).toBe('user-123');
    });

    it('continues (no auth) when token is invalid', async () => {
      const r = req({ headers: { authorization: 'Bearer garbage' } });
      await middleware.optionalAuth()(r, mockRes() as unknown as AuthResponse, next as unknown as NextFunction);
      expect(next).toHaveBeenCalled();
      expect(r.auth).toBeUndefined();
    });
  });

  it('createAuthMiddleware returns a configured instance', () => {
    expect(createAuthMiddleware(TEST_CONFIG)).toBeInstanceOf(AuthMiddleware);
  });
});
