/**
 * The password-reset endpoints, end to end through the real handlers.
 *
 * What they replace: `POST /auth/password-reset` was a hard-coded "reset
 * instructions have been sent" with an empty body — no lookup, no token, no
 * mail. `POST /auth/password-reset/confirm` answered 501. The forgot-password
 * screen was fully built against both.
 *
 * The properties worth breaking a build over are the ones a working-looking
 * reset can still get wrong: that the answer and the latency say nothing about
 * who has an account, that only the digest is stored, that a rejected password
 * does not burn the link, that two racing confirms cannot both win, that a reset
 * revokes live sessions, and that it neither removes the second factor nor hands
 * back a session.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
  },
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => true),
  argon2Hash: vi.fn(async (password: string) => `hashed_${password}`),
}));

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: mocks.sendViaSes,
  isSesConfigured: mocks.isSesConfigured,
}));

vi.mock('argon2', () => ({ hash: mocks.argon2Hash, verify: vi.fn(async () => true) }));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
    generateTokenPair = vi.fn();
    refreshToken = vi.fn();
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import { passwordResetRoutes } from '../routes/password-reset';
import { hashResetToken, looksLikeResetToken } from '../lib/password-reset';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: this suite is about the handlers, and a
   real instance would drag in the plugin graph they do not use. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const register = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
  };
  await passwordResetRoutes({ post: register, get: register } as never);
  return handlers;
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    cookie: undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
    setCookie(name: string, value: string, options: unknown) {
      this.cookie = { name, value, options };
      return this;
    },
  };
  return reply;
};

const trustedHeaders = { origin: 'http://localhost:3000' };

const call = async (path: string, request: Record<string, unknown>) => {
  const handlers = await loadHandlers();
  const reply = makeReply();
  await handlers.get(path)!(request, reply);
  return reply;
};

/** The fire-and-forget send is started synchronously, but its catch is not. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  passwordHash: 'hashed_old-password',
};

const SENT_MESSAGE = 'If an account exists with that address, reset instructions have been sent.';

/** The token as it left the building, recovered from the mail we mocked. */
const mailedToken = (): string => {
  const html = mocks.sendViaSes.mock.calls.at(-1)?.[0]?.bodyHtml as string;
  const match = html?.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  return match?.[1] ?? '';
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env['CORS_ORIGINS'] = 'http://localhost:3000';
  process.env['PASSWORD_RESET_APP_URL'] = 'https://quantmail.in';
  mocks.isSesConfigured.mockReturnValue(true);
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.argon2Hash.mockImplementation(async (password: string) => `hashed_${password}`);
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.user.findUnique.mockResolvedValue(USER);
  mocks.prisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });
  mocks.prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
});

describe('POST /auth/password-reset — requesting a link', () => {
  const request = (body: unknown, headers: Record<string, string> = trustedHeaders) =>
    call('/auth/password-reset', { headers, body, ip: '203.0.113.9' });

  it('refuses an untrusted or missing Origin before touching anything', async () => {
    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const reply = await request({ email: USER.email }, headers as Record<string, string>);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  /** Shape, not existence: an empty field says nothing about who has an account,
   *  and answering "sent" to it would be a lie with no recipient. */
  it('asks for an address when none arrived', async () => {
    for (const body of [{}, { email: '' }, { email: '   ' }, { email: 42 }, undefined]) {
      const reply = await request(body);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('answers an unknown address exactly as it answers a known one', async () => {
    const unknown = await request({ email: 'nobody@quantmail.in' });

    mocks.prisma.user.findFirst.mockResolvedValue(USER);
    const known = await request({ email: USER.email });

    expect(unknown.statusCode).toBe(200);
    expect(known.statusCode).toBe(200);
    expect(unknown.body).toEqual({ success: true, data: { message: SENT_MESSAGE } });
    expect(known.body).toEqual(unknown.body);
  });

  it('creates nothing and sends nothing for an address with no account', async () => {
    await request({ email: 'nobody@quantmail.in' });

    expect(mocks.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mocks.prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('looks the account up case-insensitively and skips deleted ones', async () => {
    await request({ email: '  KUNDAN@QuantMail.in ' });

    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: 'kundan@quantmail.in', mode: 'insensitive' },
        deletedAt: null,
      },
    });
  });

  it('stores only the digest of the token it mailed', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);

    await request({ email: USER.email });

    const written = mocks.prisma.passwordResetToken.create.mock.calls[0]?.[0]?.data;
    const token = mailedToken();

    expect(looksLikeResetToken(token)).toBe(true);
    expect(written.tokenHash).toBe(hashResetToken(token));
    expect(written.userId).toBe(USER.id);
    expect(JSON.stringify(written)).not.toContain(token);
    expect(written.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
    expect(written.requestedIp).toBe('203.0.113.9');
  });

  it('never puts the token or the digest in the HTTP response', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);

    const reply = await request({ email: USER.email });
    const written = mocks.prisma.passwordResetToken.create.mock.calls[0]?.[0]?.data;

    expect(JSON.stringify(reply.body)).not.toContain(mailedToken());
    expect(JSON.stringify(reply.body)).not.toContain(written.tokenHash);
  });

  /** Otherwise repeated requests leave a pile of simultaneously-valid links, and
   *  the oldest mail in a compromised mailbox stays usable. */
  it('invalidates any outstanding link before issuing the new one', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);

    await request({ email: USER.email });

    expect(mocks.prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER.id, usedAt: null },
    });
    expect(mocks.prisma.passwordResetToken.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.passwordResetToken.create.mock.invocationCallOrder[0]!,
    );
  });

  it('mails the stored spelling of the address, with the link and the name', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);

    await request({ email: 'kundan@quantmail.in' });

    const sent = mocks.sendViaSes.mock.calls[0]?.[0];
    expect(sent.to).toEqual(['Kundan@quantmail.in']);
    expect(sent.subject).toBe('Reset your QuantMail password');
    expect(sent.bodyHtml).toContain('https://quantmail.in/reset-password?token=');
    expect(sent.bodyText).toContain('https://quantmail.in/reset-password?token=');
    expect(sent.bodyHtml).toContain('Hi Kundan,');
    expect(sent.from).toBe('QuantMail <no-reply@quantmail.in>');
  });

  it('falls back to the username when the account has no display name', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ ...USER, displayName: null });

    await request({ email: USER.email });

    expect(mocks.sendViaSes.mock.calls[0]?.[0]?.bodyHtml).toContain('Hi kundan,');
  });

  it('never mails the digest that was stored', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);

    await request({ email: USER.email });

    const written = mocks.prisma.passwordResetToken.create.mock.calls[0]?.[0]?.data;
    const sent = mocks.sendViaSes.mock.calls[0]?.[0];
    expect(sent.bodyHtml).not.toContain(written.tokenHash);
    expect(sent.bodyText).not.toContain(written.tokenHash);
  });

  /**
   * The whole point of the non-committal wording is that the response says
   * nothing about who has an account. A response that waits for SES says it in
   * latency instead, so the send is started and not awaited.
   */
  it('does not wait for delivery before answering', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);
    let released: () => void = () => {};
    mocks.sendViaSes.mockReturnValue(
      new Promise<string>((resolve) => {
        released = () => resolve('late');
      }),
    );

    const reply = await request({ email: USER.email });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.message).toBe(SENT_MESSAGE);
    released();
  });

  it('answers the same way when delivery fails outright', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);
    mocks.sendViaSes.mockRejectedValue(new Error('SES sandbox: recipient not verified'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const reply = await request({ email: USER.email });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.message).toBe(SENT_MESSAGE);
    // Not silence: "instructions have been sent" was a lie for months precisely
    // because nothing recorded that nothing was sent.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('records the failure rather than pretending, when SES is not configured', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(USER);
    mocks.isSesConfigured.mockReturnValue(false);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const reply = await request({ email: USER.email });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    // The row still exists, so a link handed over by another channel works.
    expect(mocks.prisma.passwordResetToken.create).toHaveBeenCalled();
    logged.mockRestore();
  });
});

const TOKEN = 'reset-token-'.padEnd(43, 'x');
const NEW_PASSWORD = 'a-brand-new-password';

const liveRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'prt-1',
  userId: USER.id,
  tokenHash: hashResetToken(TOKEN),
  expiresAt: new Date(Date.now() + 600_000),
  usedAt: null,
  ...overrides,
});

describe('POST /auth/password-reset/confirm — spending a link', () => {
  const confirm = (body: unknown, headers: Record<string, string> = trustedHeaders) =>
    call('/auth/password-reset/confirm', { headers, body, ip: '203.0.113.9' });

  const lastUserUpdate = () => mocks.prisma.user.update.mock.calls.at(-1)?.[0]?.data;

  it('refuses an untrusted or missing Origin before touching anything', async () => {
    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const reply = await confirm(
        { token: TOKEN, newPassword: NEW_PASSWORD },
        headers as Record<string, string>,
      );

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect(mocks.prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.argon2Hash).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed token without a database round trip', async () => {
    for (const token of [undefined, null, '', 'short', 42, `${TOKEN}!`, 'x'.repeat(200)]) {
      const reply = await confirm({ token, newPassword: NEW_PASSWORD });

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('INVALID_TOKEN');
    }
    expect(mocks.prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.argon2Hash).not.toHaveBeenCalled();
  });

  /**
   * The order that matters: judge the password first. Spending the link first
   * means a rejected password burns the only link the person has, and they read
   * the rule after it has stopped being useful to them.
   */
  it('judges the new password before the link is looked up or spent', async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(liveRow());

    for (const newPassword of [undefined, '', 'short12', 'password', 'aaaaaaaaaa']) {
      const reply = await confirm({ token: TOKEN, newPassword });

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('WEAK_PASSWORD');
      expect(typeof reply.body.error.message).toBe('string');
    }
    expect(mocks.prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('looks the link up by digest, never by the value that was mailed', async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(liveRow());

    await confirm({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(mocks.prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashResetToken(TOKEN) },
    });
    const queried = JSON.stringify(mocks.prisma.passwordResetToken.findUnique.mock.calls[0]);
    expect(queried).not.toContain(TOKEN);
  });

  it('rejects a token no row matches', async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    const reply = await confirm({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_TOKEN');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a link that has already been spent', async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(
      liveRow({ usedAt: new Date('2026-08-30T00:00:00.000Z') }),
    );

    const reply = await confirm({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RESET_LINK_EXPIRED');
    expect(mocks.prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a link that has aged out', async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(
      liveRow({ expiresAt: new Date(Date.now() - 1_000) }),
    );

    const reply = await confirm({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RESET_LINK_EXPIRED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('a reset that goes through', () => {
  const confirm = (body: unknown = { token: TOKEN, newPassword: NEW_PASSWORD }) =>
    call('/auth/password-reset/confirm', { headers: trustedHeaders, body, ip: '203.0.113.9' });

  const lastUserUpdate = () => mocks.prisma.user.update.mock.calls.at(-1)?.[0]?.data;

  beforeEach(() => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(liveRow());
  });

  it('writes the new password as an argon2 hash and says so', async () => {
    const reply = await confirm();

    expect(mocks.argon2Hash).toHaveBeenCalledWith(NEW_PASSWORD);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER.id } }),
    );
    expect(lastUserUpdate().passwordHash).toBe(`hashed_${NEW_PASSWORD}`);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({
      success: true,
      data: { message: 'Password updated. Sign in with your new password.' },
    });
  });

  /**
   * The default `argon2` mock echoes the password back inside its fake digest, so
   * this one test stands it up as opaque — otherwise "the update carries no
   * plaintext" is unprovable against a digest that contains the plaintext.
   */
  it('writes nothing but what argon2 returned', async () => {
    mocks.argon2Hash.mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$ZGlnZXN0');

    await confirm();

    const written = JSON.stringify(lastUserUpdate());
    expect(written).not.toContain(NEW_PASSWORD);
    expect(written).toContain('$argon2id$');
  });

  /** Single use decided by the database, not by the check above it: two confirms
   *  racing on one link both pass that check. */
  it('spends the exact row, scoped to still being unspent', async () => {
    await confirm();

    expect(mocks.prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'prt-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  /** Fail closed: if the write after it dies, the link is already dead. */
  it('spends the link before it writes the password', async () => {
    await confirm();

    expect(mocks.prisma.passwordResetToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.user.update.mock.invocationCallOrder[0]!,
    );
  });

  it('gives the loser of two simultaneous confirms nothing', async () => {
    mocks.prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    const reply = await confirm();

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RESET_LINK_EXPIRED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.argon2Hash).not.toHaveBeenCalled();
  });

  /** A reset is the answer to "someone else may be in here", so the sessions
   *  minted before it must not survive it. */
  it('revokes every refresh family the account had', async () => {
    await confirm();

    expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id },
      data: { isRevoked: true },
    });
  });

  it('kills any other link that was still live', async () => {
    await confirm();

    expect(mocks.prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER.id, usedAt: null },
    });
  });

  /** Someone who reset their password is very likely the person who tripped the
   *  lockout guessing at the old one. */
  it('clears the lockout the forgotten password caused', async () => {
    await confirm();

    expect(lastUserUpdate().failedLoginAttempts).toBe(0);
    expect(lastUserUpdate().lockoutUntil).toBeNull();
  });

  /**
   * The property that keeps a reset from being a 2FA bypass. Control of a
   * mailbox is not the second factor, and clearing it here would make every
   * protected account resettable down to one factor by mail.
   */
  it('leaves the second factor completely alone', async () => {
    await confirm();

    const written = lastUserUpdate();
    expect(Object.keys(written).some((key) => key.startsWith('twoFactor'))).toBe(false);
    expect(JSON.stringify(written)).not.toContain('twoFactor');
  });

  /** For the same reason: a token that arrived by mail must not hand back
   *  credentials. The new password goes through the front door. */
  it('issues no session, no token and no cookie', async () => {
    const reply = await confirm();

    expect(reply.cookie).toBeUndefined();
    expect(reply.body.data).not.toHaveProperty('accessToken');
    expect(reply.body.data).not.toHaveProperty('refreshToken');
    expect(reply.body.data).not.toHaveProperty('userId');
  });

  it('rejects a link whose account went away between the mail and the click', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const reply = await confirm();

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_TOKEN');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('accepts a token pasted with surrounding whitespace', async () => {
    const reply = await confirm({ token: ` ${TOKEN}\n`, newPassword: NEW_PASSWORD });

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashResetToken(TOKEN) },
    });
  });
});
