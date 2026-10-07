// ============================================================================
// Connection Auth Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { ConnectionAuth, AuthError } from '../auth';
import type { IncomingMessage } from 'node:http';

function createMockRequest(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return {
    url,
    headers,
  } as unknown as IncomingMessage;
}

describe('ConnectionAuth', () => {
  let auth: ConnectionAuth;
  const secret = 'test-secret-key-for-jwt-verification';

  beforeEach(() => {
    auth = new ConnectionAuth({
      jwtSecret: secret,
      jwtIssuer: 'quant-ecosystem',
      jwtAudience: 'quant-realtime',
    });
  });

  describe('extractToken', () => {
    it('should extract token from query parameter', () => {
      const req = createMockRequest('/ws?token=my-jwt-token');
      const token = auth.extractToken(req);
      expect(token).toBe('my-jwt-token');
    });

    it('should extract token from Authorization header', () => {
      const req = createMockRequest('/ws', {
        authorization: 'Bearer my-jwt-token',
      });
      const token = auth.extractToken(req);
      expect(token).toBe('my-jwt-token');
    });

    it('should extract token from Sec-WebSocket-Protocol header', () => {
      const req = createMockRequest('/ws', {
        'sec-websocket-protocol': 'my-jwt-token',
      });
      const token = auth.extractToken(req);
      expect(token).toBe('my-jwt-token');
    });

    it('should prefer query parameter over header', () => {
      const req = createMockRequest('/ws?token=query-token', {
        authorization: 'Bearer header-token',
      });
      const token = auth.extractToken(req);
      expect(token).toBe('query-token');
    });

    it('should return null when no token present', () => {
      const req = createMockRequest('/ws');
      const token = auth.extractToken(req);
      expect(token).toBeNull();
    });

    it('should return null for empty URL', () => {
      const req = createMockRequest('');
      const token = auth.extractToken(req);
      expect(token).toBeNull();
    });
  });

  describe('verifyToken', () => {
    async function createToken(
      payload: Record<string, unknown>,
      opts: { issuer?: string; audience?: string; expiresIn?: string } = {},
    ): Promise<string> {
      const encoder = new TextEncoder();
      let builder = new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(opts.issuer || 'quant-ecosystem')
        .setAudience(opts.audience || 'quant-realtime');

      if (opts.expiresIn) {
        builder = builder.setExpirationTime(opts.expiresIn);
      } else {
        builder = builder.setExpirationTime('1h');
      }

      return builder.sign(encoder.encode(secret));
    }

    it('should verify a valid token', async () => {
      const token = await createToken({
        sub: 'user123',
        email: 'user@test.com',
        scopes: ['read', 'write'],
        app: 'quantchat',
      });

      const payload = await auth.verifyToken(token);
      expect(payload.userId).toBe('user123');
      expect(payload.email).toBe('user@test.com');
      expect(payload.scopes).toEqual(['read', 'write']);
      expect(payload.app).toBe('quantchat');
    });

    it('should use sub as userId', async () => {
      const token = await createToken({ sub: 'user456' });
      const payload = await auth.verifyToken(token);
      expect(payload.userId).toBe('user456');
    });

    it('should reject token with wrong issuer', async () => {
      const token = await createToken({ sub: 'user1' }, { issuer: 'wrong-issuer' });
      await expect(auth.verifyToken(token)).rejects.toThrow(AuthError);
    });

    it('should reject token with wrong audience', async () => {
      const token = await createToken({ sub: 'user1' }, { audience: 'wrong-audience' });
      await expect(auth.verifyToken(token)).rejects.toThrow(AuthError);
    });

    it('should reject expired token', async () => {
      const encoder = new TextEncoder();
      const token = await new SignJWT({ sub: 'user1' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setIssuer('quant-ecosystem')
        .setAudience('quant-realtime')
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(encoder.encode(secret));

      await expect(auth.verifyToken(token)).rejects.toThrow(AuthError);
    });

    it('should reject invalid token format', async () => {
      await expect(auth.verifyToken('not-a-jwt')).rejects.toThrow(AuthError);
    });

    it('should reject token without userId', async () => {
      const encoder = new TextEncoder();
      const noSubToken = await new SignJWT({ email: 'test@test.com' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('quant-ecosystem')
        .setAudience('quant-realtime')
        .setExpirationTime('1h')
        .sign(encoder.encode(secret));

      await expect(auth.verifyToken(noSubToken)).rejects.toThrow(AuthError);
    });

    it('should default scopes to empty array', async () => {
      const token = await createToken({ sub: 'user1' });
      const payload = await auth.verifyToken(token);
      expect(payload.scopes).toEqual([]);
    });

    it('should default app to quantchat', async () => {
      const token = await createToken({ sub: 'user1' });
      const payload = await auth.verifyToken(token);
      expect(payload.app).toBe('quantchat');
    });
  });

  describe('authenticateUpgrade', () => {
    it('should authenticate request with valid token in query', async () => {
      const encoder = new TextEncoder();
      const token = await new SignJWT({ sub: 'user1', app: 'quantchat' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('quant-ecosystem')
        .setAudience('quant-realtime')
        .setExpirationTime('1h')
        .sign(encoder.encode(secret));

      const req = createMockRequest(`/ws?token=${token}`);
      const payload = await auth.authenticateUpgrade(req);
      expect(payload.userId).toBe('user1');
    });

    it('should reject request without token', async () => {
      const req = createMockRequest('/ws');
      await expect(auth.authenticateUpgrade(req)).rejects.toThrow('No token provided');
    });

    it('should reject request with invalid token', async () => {
      const req = createMockRequest('/ws?token=invalid-token');
      await expect(auth.authenticateUpgrade(req)).rejects.toThrow(AuthError);
    });
  });

  describe('AuthError', () => {
    it('should have correct properties', () => {
      const error = new AuthError('test error', 4001);
      expect(error.message).toBe('test error');
      expect(error.code).toBe(4001);
      expect(error.name).toBe('AuthError');
      expect(error).toBeInstanceOf(Error);
    });

    it('should default code to 4001', () => {
      const error = new AuthError('test');
      expect(error.code).toBe(4001);
    });
  });
});
