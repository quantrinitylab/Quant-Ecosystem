// ============================================================================
// QC-F-062 — POST /auth/otp/request must never leak the OTP in its response
// ============================================================================
//
// The endpoint is PUBLIC (app.ts publicPaths — it is the first step of phone
// login). Before the fix, OtpService.requestCode attached the real code as
// `demoCode` under common env/sender conditions and this route forwarded it,
// so an unauthenticated caller could read a victim's code from the response
// and redeem it at /auth/otp/verify for a full token pair.
//
// This suite mounts the REAL auth routes plugin on a bare Fastify instance
// with the REAL OtpService (backed by a capturing sender, the established
// otp-service.test.ts harness pattern) and the REAL SessionTokenIssuer:
//   - request → 200, but the raw body contains neither `demoCode` nor the
//     actual code anywhere, under plain and env-trigger conditions alike;
//   - verify with the code taken from the captured "SMS" → real token pair.
// On the pre-fix code the request assertions FAIL (the body carried
// demoCode) — see the build report's negative control.
//
// Two module-level stubs, neither exercised by the OTP paths:
//   - '@quant/auth' — only passwordService is imported by routes/auth.ts and
//     it serves /auth/login, not OTP. The real package index pulls
//     @quant/database, which is unresolvable in the symlink-worktree test env
//     (documented pre-existing artifact; the same reason buildApp-importing
//     suites load-fail locally and are verified in CI instead).
//   - '@quant/server-core' — only fetchWithTimeout/getTimeoutMs are imported,
//     used by the SSO-exchange handler, not OTP.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'unused-in-otp-tests',
  },
}));

vi.mock('@quant/server-core', () => ({
  fetchWithTimeout: async () => {
    throw new Error('fetchWithTimeout is not exercised by the OTP route tests');
  },
  getTimeoutMs: () => 1000,
}));

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import authRoutes from '../routes/auth';
import { OtpService, type SmsSender } from '../lib/otp-service';
import { SessionTokenIssuer } from '../lib/session-tokens';

// --- Capturing SMS sender: the only legitimate place the code exists. ------
const sentMessages: { phone: string; body: string }[] = [];
const capturingSender: SmsSender = {
  async send(phone, body) {
    sentMessages.push({ phone, body });
    return { success: true };
  },
};

function codeSentTo(phone: string): string {
  const msg = [...sentMessages].reverse().find((m) => m.phone === phone);
  if (!msg) throw new Error(`no SMS captured for ${phone}`);
  return /(\d{6})/.exec(msg.body)![1];
}

// --- Minimal in-memory user store behind the real upsertPhoneUser path. -----
interface StoredUser {
  id: string;
  username: string;
  phoneNumber: string;
  phoneVerified: boolean;
}
const usersByPhone = new Map<string, StoredUser>();
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { phoneNumber: string } }) =>
      usersByPhone.get(where.phoneNumber) ?? null,
    create: async ({ data }: { data: { username: string; phoneNumber: string } }) => {
      const user: StoredUser = {
        id: `user-${usersByPhone.size + 1}`,
        username: data.username,
        phoneNumber: data.phoneNumber,
        phoneVerified: true,
      };
      usersByPhone.set(user.phoneNumber, user);
      return user;
    },
    update: async ({ where, data }: { where: { id: string }; data: { phoneVerified?: boolean } }) => {
      for (const user of usersByPhone.values()) {
        if (user.id === where.id) {
          if (data.phoneVerified !== undefined) user.phoneVerified = data.phoneVerified;
          return user;
        }
      }
      throw new Error('user not found');
    },
  },
};

let app: FastifyInstance;
const originalEnv = { ...process.env };

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.decorate('prisma', fakePrisma as unknown as PrismaClient);
  app.decorate('otpService', new OtpService(capturingSender));
  app.decorate(
    'sessionTokens',
    new SessionTokenIssuer({
      jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
      jwtIssuer: 'quant-test',
      jwtAudience: 'quant-test-audience',
    }),
  );
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
});

afterAll(async () => {
  process.env = { ...originalEnv };
  await app.close();
});

describe('QC-F-062 POST /auth/otp/request — response never carries the code', () => {
  it('returns 200 without demoCode and without the actual code anywhere in the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phoneNumber: '+14155550123' },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Verification code sent');
    expect(json.data.expiresIn).toBe(300);
    expect(json.data).not.toHaveProperty('demoCode');
    expect(res.body).not.toContain('demoCode');
    // Full-body scan: the genuine code must appear ONLY in the captured SMS.
    expect(res.body).not.toContain(codeSentTo('+14155550123'));
  });

  it("stays leak-free under the old env triggers (STAGING='false' string + production)", async () => {
    process.env.NODE_ENV = 'production';
    process.env.STAGING = 'false';
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: { phoneNumber: '+14155550124' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).not.toHaveProperty('demoCode');
      expect(res.body).not.toContain(codeSentTo('+14155550124'));
    } finally {
      process.env = { ...originalEnv };
    }
  });

  it('the captured code redeems at /auth/otp/verify for a real token pair (code is genuine, channel is the only leak risk)', async () => {
    const code = codeSentTo('+14155550123');
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phoneNumber: '+14155550123', otp: code },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.accessToken).toBe('string');
    expect(json.data.accessToken.length).toBeGreaterThan(20);
    expect(typeof json.data.refreshToken).toBe('string');
    expect(json.data.user.phoneNumber).toBe('+14155550123');
  });

  it('rejects a wrong code at /auth/otp/verify with 401 (control)', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phoneNumber: '+14155550125' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phoneNumber: '+14155550125', otp: '000000' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'OTP_INVALID' } });
  });
});
