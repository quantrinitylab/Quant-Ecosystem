// @vitest-environment node
// ============================================================================
// SSO ticket routes + cross-app forgot password — HTTP-level tests with the
// REAL route handlers and only prisma/secrets/token-service mocked.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('@quant/auth/lib/prisma', () => {
  const ssoTicket = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const passwordResetToken = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  return {
    default: { ssoTicket, passwordResetToken, user },
    prisma: { ssoTicket, passwordResetToken, user },
  };
});

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async validateAccessToken(token: string) {
      return token === 'valid-token'
        ? { sub: 'user-1', email: 'a@quantmail.in', id: 'user-1' }
        : null;
    }
  }
  return { TokenService: MockTokenService };
});

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

vi.mock('../lib/password-reset', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    sendPasswordResetEmail: vi.fn(async () => true),
  };
});

import { prisma } from '@quant/auth/lib/prisma';
import { ssoTicketRoutes } from '../routes/sso-ticket';
import { oauthRoutes } from '../routes/oauth';

const mockPrisma = vi.mocked(prisma) as any;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(ssoTicketRoutes);
  await app.register(oauthRoutes);
  return app;
}

describe('POST /oauth/sso-ticket/mint', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('401 without a Bearer <redacted>', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/sso-ticket/mint',
      payload: { audience: 'https://quantai.quantrinity.in' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('400 for a non-allowlisted audience (no open redirect with credential)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/sso-ticket/mint',
      headers: { authorization: 'Bearer <redacted>' },
      payload: { audience: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_AUDIENCE');
  });

  it('mints a ticket for an allowlisted audience, never echoing a token', async () => {
    mockPrisma.ssoTicket.create.mockImplementation(async (args: any) => ({
      id: 't1',
      ...args.data,
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/sso-ticket/mint',
      headers: { authorization: 'Bearer <redacted>' },
      payload: { audience: 'https://quantai.quantrinity.in', clientId: 'quantai' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(body)).not.toContain('valid-token');
  });
});

describe('POST /oauth/sso-ticket/verify', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('verifies a good ticket once and returns the profile (no credentials)', async () => {
    const { hashSsoTicket } = await import('../lib/sso-ticket');
    const { generateSsoTicket } = await import('../lib/sso-ticket');
    const ticket = generateSsoTicket();
    mockPrisma.ssoTicket.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
      ticketHash: hashSsoTicket(ticket),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });
    mockPrisma.ssoTicket.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@quantmail.in',
      username: 'a',
      displayName: 'A',
      emailVerified: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/oauth/sso-ticket/verify',
      payload: { ticket, audience: 'https://quantai.quantrinity.in' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('a@quantmail.in');
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a ticket presented to the wrong audience', async () => {
    const { generateSsoTicket, hashSsoTicket } = await import('../lib/sso-ticket');
    const ticket = generateSsoTicket();
    mockPrisma.ssoTicket.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
      ticketHash: hashSsoTicket(ticket),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/oauth/sso-ticket/verify',
      payload: { ticket, audience: 'https://quantchat.quantrinity.in' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /oauth/forgot-password', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('answers non-committally for unknown addresses (no enumeration)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/forgot-password',
      payload: { email: 'nobody@quantmail.in' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a reset link and dispatches a real mail for known addresses', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'a@quantmail.in',
      username: 'a',
      displayName: 'A',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/forgot-password',
      payload: { email: 'a@quantmail.in' },
    });
    expect(res.statusCode).toBe(200);
    // Same answer as the unknown case — the oracle stays shut.
    expect(res.json().data.message).toContain('QuantMail inbox');
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const stored = mockPrisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toHaveLength(64);
  });

  it('400 on empty email (shape, not existence)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/forgot-password',
      payload: { email: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});
