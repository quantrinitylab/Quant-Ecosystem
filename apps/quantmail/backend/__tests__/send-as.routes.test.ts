/**
 * Send-mail-as identities (fix/qm-accounts-import-send-as-2) — the backend
 * half of Settings → Account → "Accounts and Import".
 *
 * What this feature replaces: QuantMail had no alias story at all — the
 * compose path stamped the account's own address and there was no way to
 * send as another address. The security surface this opens is From forgery:
 * a caller who can name an arbitrary From can impersonate anyone.
 *
 * Properties pinned here (handler-level, fake Fastify; the global auth hook
 * and rate-limit enforcement run in the real app and are pinned at
 * registration):
 *  1. Ownership first: the compose path may stamp a send-as address as From
 *     only when the row exists, belongs to the caller, and is verified.
 *     Unknown or foreign ids 404, unverified rows 403 — an unverified
 *     address can never become a From.
 *  2. Verification is destination-proof: the 6-digit code is mailed to the
 *     address itself (only someone who can read that mailbox can activate
 *     it); only the SHA-256 digest is stored; the code is single-use
 *     (digest cleared on activation), 15-minute-bounded, and attempt-capped.
 *  3. Honest delivery reporting: POST answers `codeDelivered` truthfully —
 *     when SES is not configured the row is still created but the response
 *     says the code was NOT sent.
 *  4. No placebo rows: the account's own address is rejected as an alias.
 *  5. Listing never exposes code digests or attempt counts.
 *  6. Re-adding an already-verified address is idempotent — it does not
 *     mint a new code (no code-spam to the owner's own mailbox).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const sendAsIdentity = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const user = { findUnique: vi.fn() };
  return {
    prisma: { sendAsIdentity, user },
    sendViaSes: vi.fn(),
    isSesConfigured: vi.fn(() => true),
  };
});

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: mocks.sendViaSes,
  isSesConfigured: mocks.isSesConfigured,
}));

// Deterministic codes; the real hash/match/expiry primitives stay in place so
// the digest storage and attempt-capping under test are the production ones.
vi.mock('../lib/email-verification', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    generateVerificationCode: () => '123456',
  };
});

import { sendAsRoutes, resolveSendAsIdentity } from '../routes/send-as';
import { hashVerificationCode } from '../lib/email-verification';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* Fake Fastify: captures handlers plus their registration options. The
 * global auth hook attaches `request.auth` in the real app; here the
 * `authed` helper sets it directly, exactly like the sibling suites. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const routeOpts = new Map<string, unknown>();
  const fake: any = {
    prisma: mocks.prisma,
    post: (path: string, opts: unknown, handler?: RouteHandler) => {
      handlers.set(`POST ${path}`, (handler ?? opts) as RouteHandler);
      routeOpts.set(`POST ${path}`, opts);
    },
    get: (path: string, handler: RouteHandler) => handlers.set(`GET ${path}`, handler),
    delete: (path: string, handler: RouteHandler) =>
      handlers.set(`DELETE ${path}`, handler),
  };
  await sendAsRoutes(fake as never);
  return { handlers, routeOpts };
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
  };
  return reply;
};

const call = async (method: string, path: string, request: Record<string, unknown>) => {
  const { handlers } = await loadHandlers();
  const reply = makeReply();
  await handlers.get(`${method} ${path}`)!(request, reply);
  return reply;
};

const authed = (extra: Record<string, unknown> = {}) => ({
  auth: { userId: 'user-1' },
  ...extra,
});

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
};

const verifiedRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sa-1',
  userId: 'user-1',
  email: 'kundan@other-domain.com',
  displayName: 'Kundan Other',
  verifiedAt: new Date('2026-10-20T00:00:00Z'),
  codeHash: null,
  codeExpiresAt: null,
  codeAttempts: 0,
  createdAt: new Date('2026-10-20T00:00:00Z'),
  ...overrides,
});

const pendingRow = (overrides: Record<string, unknown> = {}) =>
  verifiedRow({
    verifiedAt: null,
    codeHash: hashVerificationCode('123456'),
    codeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    codeAttempts: 0,
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSesConfigured.mockReturnValue(true);
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
  mocks.prisma.sendAsIdentity.findMany.mockResolvedValue([]);
  mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(null);
});

describe('GET /settings/send-as', () => {
  it('401s without a session', async () => {
    const reply = await call('GET', '/settings/send-as', {});
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('UNAUTHORIZED');
  });

  it('lists the caller identities without leaking code digests or attempts', async () => {
    mocks.prisma.sendAsIdentity.findMany.mockResolvedValue([
      verifiedRow(),
      pendingRow({ id: 'sa-2', email: 'second@other-domain.com' }),
    ]);
    const reply = await call('GET', '/settings/send-as', authed());
    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(reply.body.data).toHaveLength(2);
    expect(reply.body.data[0]).toEqual({
      id: 'sa-1',
      email: 'kundan@other-domain.com',
      displayName: 'Kundan Other',
      verified: true,
      verifiedAt: new Date('2026-10-20T00:00:00Z'),
      createdAt: new Date('2026-10-20T00:00:00Z'),
    });
    expect(reply.body.data[0]).not.toHaveProperty('codeHash');
    expect(reply.body.data[0]).not.toHaveProperty('codeAttempts');
    expect(reply.body.data[1].verified).toBe(false);
  });
});

describe('POST /settings/send-as', () => {
  it('401s without a session', async () => {
    const reply = await call('POST', '/settings/send-as', {
      body: { email: 'x@example.com' },
    });
    expect(reply.statusCode).toBe(401);
  });

  it('registers a 5-per-15-minute rate limit (mail-bomb guard)', async () => {
    const { routeOpts } = await loadHandlers();
    const opts = routeOpts.get('POST /settings/send-as') as any;
    expect(opts.config.rateLimit.max).toBe(5);
    expect(opts.config.rateLimit.timeWindow).toBe('15 minutes');
  });

  it('400s on a malformed address', async () => {
    const reply = await call('POST', '/settings/send-as', authed({ body: { email: 'nope' } }));
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.prisma.sendAsIdentity.create).not.toHaveBeenCalled();
  });

  it('400s when the address is the account address (no placebo alias)', async () => {
    const reply = await call('POST', '/settings/send-as', authed({ body: { email: 'kundan@quantmail.in' } }));
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('SEND_AS_SAME_AS_ACCOUNT');
    expect(mocks.prisma.sendAsIdentity.create).not.toHaveBeenCalled();
  });

  it('creates an UNVERIFIED row, mails the code, reports codeDelivered honestly', async () => {
    const created = pendingRow({ id: 'sa-new' });
    mocks.prisma.sendAsIdentity.create.mockResolvedValue(created);
    const reply = await call(
      'POST',
      '/settings/send-as',
      authed({ body: { email: ' Kundan@Other-Domain.com ', displayName: 'Kundan Other' } }),
    );
    expect(reply.statusCode).toBe(201);
    const createdData = mocks.prisma.sendAsIdentity.create.mock.calls[0][0].data;
    // Normalized at write time; only the digest is stored.
    expect(createdData.email).toBe('kundan@other-domain.com');
    expect(createdData.codeHash).toBe(hashVerificationCode('123456'));
    expect(createdData.verifiedAt ?? null).toBeNull();
    // The code went to the address itself.
    expect(mocks.sendViaSes).toHaveBeenCalledTimes(1);
    expect(mocks.sendViaSes.mock.calls[0][0].to).toEqual(['kundan@other-domain.com']);
    expect(reply.body.data.pendingVerification).toBe(true);
    expect(reply.body.data.codeDelivered).toBe(true);
    expect(reply.body.data.verified).toBe(false);
    expect(reply.body.data).not.toHaveProperty('codeHash');
  });

  it('still creates the row when SES is down, but says the code was NOT sent', async () => {
    mocks.isSesConfigured.mockReturnValue(false);
    mocks.prisma.sendAsIdentity.create.mockResolvedValue(pendingRow({ id: 'sa-new' }));
    const reply = await call(
      'POST',
      '/settings/send-as',
      authed({ body: { email: 'kundan@other-domain.com' } }),
    );
    expect(reply.statusCode).toBe(201);
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
    expect(reply.body.data.pendingVerification).toBe(true);
    expect(reply.body.data.codeDelivered).toBe(false);
  });

  it('re-adding an already-verified address is idempotent and mints no new code', async () => {
    const existing = verifiedRow();
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(existing);
    const reply = await call(
      'POST',
      '/settings/send-as',
      authed({ body: { email: 'kundan@other-domain.com' } }),
    );
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.verified).toBe(true);
    expect(mocks.prisma.sendAsIdentity.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('re-adding an unverified address replaces the pending code, never stacking codes', async () => {
    const existing = pendingRow();
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(existing);
    mocks.prisma.sendAsIdentity.update.mockResolvedValue(existing);
    const reply = await call(
      'POST',
      '/settings/send-as',
      authed({ body: { email: 'kundan@other-domain.com' } }),
    );
    expect(reply.statusCode).toBe(201);
    const updated = mocks.prisma.sendAsIdentity.update.mock.calls[0][0];
    expect(updated.where.id).toBe('sa-1');
    expect(updated.data.codeAttempts).toBe(0);
    expect(updated.data.verifiedAt).toBeNull();
  });
});

describe('POST /settings/send-as/:id/verify', () => {
  it('401s without a session', async () => {
    const reply = await call('POST', '/settings/send-as/:id/verify', {
      params: { id: 'sa-1' },
      body: { code: '123456' },
    });
    expect(reply.statusCode).toBe(401);
  });

  it('400s on a malformed code', async () => {
    const reply = await call(
      'POST',
      '/settings/send-as/:id/verify',
      authed({ params: { id: 'sa-1' }, body: { code: 'abc' } }),
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404s a foreign row without distinguishing "missing" from "not yours"', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(
      verifiedRow({ userId: 'user-2' }),
    );
    const reply = await call(
      'POST',
      '/settings/send-as/:id/verify',
      authed({ params: { id: 'sa-1' }, body: { code: '123456' } }),
    );
    expect(reply.statusCode).toBe(404);
    expect(reply.body.error.code).toBe('SEND_AS_NOT_FOUND');
  });

  it('400s when no code is pending', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(
      pendingRow({ codeHash: null, codeExpiresAt: null }),
    );
    const reply = await call(
      'POST',
      '/settings/send-as/:id/verify',
      authed({ params: { id: 'sa-1' }, body: { code: '123456' } }),
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('SEND_AS_NO_PENDING_CODE');
  });

  it('400s and clears the state on an expired code', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(
      pendingRow({ codeExpiresAt: new Date(Date.now() - 60 * 1000) }),
    );
    mocks.prisma.sendAsIdentity.update.mockResolvedValue(pendingRow());
    const reply = await call(
      'POST',
      '/settings/send-as/:id/verify',
      authed({ params: { id: 'sa-1' }, body: { code: '123456' } }),
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('SEND_AS_CODE_EXPIRED');
    const cleared = mocks.prisma.sendAsIdentity.update.mock.calls[0][0].data;
    expect(cleared.codeHash).toBeNull();
    expect(cleared.codeExpiresAt).toBeNull();
  });

  it('increments attempts on a wrong code', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(pendingRow());
    mocks.prisma.sendAsIdentity.update.mockResolvedValue(pendingRow({ codeAttempts: 1 }));
    const reply = await call(
      'POST',
      '/settings/send-as/:id/verify',
      authed({ params: { id: 'sa-1' }, body: { code: '000000' } }),
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('SEND_AS_CODE_MISMATCH');
    const bumped = mocks.prisma.sendAsIdentity.update.mock.calls[0][0].data;
    expect(bumped.codeAttempts).toBe(1);
  });

  it('activates on the right code and clears the digest (single-use)', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(pendingRow());
    mocks.prisma.sendAsIdentity.update.mockResolvedValue(verifiedRow());
    const reply = await call(
      'POST',
      '/settings/send-as/:id/verify',
      authed({ params: { id: 'sa-1' }, body: { code: '123456' } }),
    );
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.verified).toBe(true);
    const activated = mocks.prisma.sendAsIdentity.update.mock.calls[0][0].data;
    expect(activated.verifiedAt).toBeInstanceOf(Date);
    expect(activated.codeHash).toBeNull();
    expect(activated.codeExpiresAt).toBeNull();
    expect(activated.codeAttempts).toBe(0);
  });
});

describe('DELETE /settings/send-as/:id', () => {
  it('401s without a session', async () => {
    const reply = await call('DELETE', '/settings/send-as/:id', { params: { id: 'sa-1' } });
    expect(reply.statusCode).toBe(401);
  });

  it('404s a foreign row', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(
      verifiedRow({ userId: 'user-2' }),
    );
    const reply = await call('DELETE', '/settings/send-as/:id', authed({ params: { id: 'sa-1' } }));
    expect(reply.statusCode).toBe(404);
    expect(mocks.prisma.sendAsIdentity.delete).not.toHaveBeenCalled();
  });

  it('removes the caller own row', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(verifiedRow());
    mocks.prisma.sendAsIdentity.delete.mockResolvedValue(verifiedRow());
    const reply = await call('DELETE', '/settings/send-as/:id', authed({ params: { id: 'sa-1' } }));
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data).toEqual({ removed: true, id: 'sa-1' });
  });
});

describe('resolveSendAsIdentity (compose path gate)', () => {
  it('404s an unknown id', async () => {
    await expect(resolveSendAsIdentity(mocks.prisma as never, 'user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('404s a foreign row', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(verifiedRow({ userId: 'user-2' }));
    await expect(resolveSendAsIdentity(mocks.prisma as never, 'user-1', 'sa-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('403s an unverified row — it can never become a From', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(pendingRow());
    await expect(resolveSendAsIdentity(mocks.prisma as never, 'user-1', 'sa-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('returns the address for a verified, owned row', async () => {
    mocks.prisma.sendAsIdentity.findUnique.mockResolvedValue(verifiedRow());
    await expect(
      resolveSendAsIdentity(mocks.prisma as never, 'user-1', 'sa-1'),
    ).resolves.toEqual({ email: 'kundan@other-domain.com', displayName: 'Kundan Other' });
  });
});
