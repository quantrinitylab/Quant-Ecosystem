// @vitest-environment node
// ============================================================================
// Email verification — primitives (lib/email-verification) and the route pair.
// Registration must NOT hardcode emailVerified: true anymore; the real mail
// goes out via SES and the link flips the flag.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@quant/auth/lib/prisma', () => {
  const emailVerificationToken = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const user = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  return { default: { emailVerificationToken, user }, prisma: { emailVerificationToken, user } };
});

vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: vi.fn(() => true),
  sendViaSes: vi.fn(async () => 'ses-message-id'),
}));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

import prisma from '@quant/auth/lib/prisma';
import { isSesConfigured } from '../lib/ses-sender';
import {
  generateVerifyToken,
  hashVerifyToken,
  looksLikeVerifyToken,
  sendVerificationEmail,
  verifyTokenExpiry,
  isVerifyTokenExpired,
  verifyUrl,
} from '../lib/email-verification';
import { issueVerificationEmail } from '../routes/email-verification';

describe('email-verification primitives', () => {
  it('generates well-shaped tokens and digests', () => {
    const t = generateVerifyToken();
    expect(looksLikeVerifyToken(t)).toBe(true);
    expect(hashVerifyToken(t)).toHaveLength(64);
    expect(looksLikeVerifyToken('nope')).toBe(false);
  });

  it('24h TTL', () => {
    const exp = verifyTokenExpiry(1_000_000);
    expect(exp.getTime() - 1_000_000).toBe(86_400_000);
    expect(isVerifyTokenExpired(new Date(1_000_000), 1_000_000 + 86_400_001)).toBe(true);
  });

  it('verify URL points at QuantMail', () => {
    expect(verifyUrl('abc123')).toContain('/verify-email?token=abc123');
  });

  it('honest when SES is down (never claims a mail went out)', async () => {
    vi.mocked(isSesConfigured).mockReturnValueOnce(false);
    const sent = await sendVerificationEmail({ to: 'a@quantmail.in', url: 'https://x' });
    expect(sent).toBe(false);
    vi.mocked(isSesConfigured).mockReturnValue(true);
  });
});

describe('issueVerificationEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dispatches a real mail and stores only the digest', async () => {
    const p = prisma as any;
    p.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@quantmail.in',
      username: 'a',
      displayName: 'A',
      emailVerified: false,
    });
    p.emailVerificationToken.create.mockImplementation(async (args: any) => args.data);

    const result = await issueVerificationEmail('u1');
    expect(result.sent).toBe(true);

    const stored = p.emailVerificationToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored).not.toHaveProperty('token');
  });

  it('does not mail an already-verified address', async () => {
    const p = prisma as any;
    p.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@quantmail.in',
      emailVerified: true,
    });
    const result = await issueVerificationEmail('u1');
    expect(result).toEqual({ sent: false, reason: 'already-verified' });
    expect(p.emailVerificationToken.create).not.toHaveBeenCalled();
  });
});
