// ===========================================================================
// QC-F-466 Slice 1 — expiring emoji status: the READ surfaces (brief §5-T2).
//
// The write path is pinned in qc-f-466-emoji-status.routes.test.ts. This
// file pins the three surfaces OTHER people (or the same person, later)
// read a status from:
//   * conversation participant DTO (ConversationService.toParticipantDto)
//   * user-directory search DTO (GET /users/search)
//   * the catalog contract: the backend mirror list in
//     backend/lib/emoji-status.ts must equal the frontend QC-F-336
//     manifest (src/lib/custom-emoji.ts) — drift fails HERE instead of
//     silently accepting a key no client can render.
//
// The invariant on every surface (brief §3.4): a status is served ONLY
// when both stored columns are present, the key still resolves in the
// catalog, and the expiry is strictly in the future. Expired (including
// expiresAt == now), half-written, and unknown-key rows all read null —
// a stale status is never served.
//
// Harness: participant cases drive the REAL ConversationService against
// the same vi.fn() prisma shape as conversation.service.test.ts; search
// cases run the REAL users route against a fake prisma whose findMany
// HONESTLY evaluates where/orderBy/skip/take/select (the QC-F-348
// evaluator family) — a fake that ignored the query would make these
// green against broken code.
//
// Negative control (brief §5): on pre-fix code the participant cases fail
// (the DTO has no emojiStatus field at all), the search cases fail (same),
// and the contract case fails (backend/lib/emoji-status.ts does not
// exist). The hideFromSearch case is a guard pin for the inherited
// QC-F-042 behaviour — its ABSENCE assertion passes pre-fix too; only its
// live-status half is new.
// ===========================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';

// The service only needs the Prisma enum *values* at runtime (same stub as
// conversation.service.test.ts).
vi.mock('@prisma/client', () => ({
  Prisma: {},
  ConversationType: { DIRECT: 'DIRECT', GROUP: 'GROUP', CHANNEL: 'CHANNEL' },
  ConversationRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
}));

vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const err = new Error(message) as Error & { statusCode: number; code: string };
    err.statusCode = statusCode;
    err.code = code;
    return err;
  },
  // users.ts imports createAppError only; privacy.service (loaded by both
  // modules under test) resolves its own imports — keep this stub minimal
  // and faithful: anything else it needs comes from the real module graph
  // in the existing suites.
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ConversationService } from '../services/conversation.service';
import usersRoutes from '../routes/users';
import { EMOJI_STATUS_NAMES, EMOJI_STATUS_PACK } from '../lib/emoji-status';
import { CUSTOM_EMOJI_PACKS } from '../../src/lib/custom-emoji';

const FUTURE = () => new Date(Date.now() + 3_600_000);
const PAST = () => new Date(Date.now() - 3_600_000);

// ---------------------------------------------------------------------------
// Participant DTO (ConversationService.getConversation)
// ---------------------------------------------------------------------------
function memberWith(userPartial: Record<string, unknown>) {
  return {
    userId: String(userPartial.id ?? 'user-2'),
    role: 'MEMBER',
    nickname: null,
    joinedAt: new Date('2026-01-02T00:00:00Z'),
    lastReadAt: null,
    user: {
      id: 'user-2',
      username: 'peer',
      displayName: 'Peer Person',
      avatarUrl: null,
      statusEmoji: null,
      statusEmojiExpiresAt: null,
      ...userPartial,
    },
  };
}

async function participantFor(userPartial: Record<string, unknown>) {
  const prisma = {
    conversation: {
      findUnique: vi.fn(async () => ({
        id: 'conv-1',
        members: [
          memberWith({ id: 'user-1', username: 'owner' }),
          memberWith(userPartial),
        ],
      })),
      update: vi.fn(),
    },
    conversationMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const service = new ConversationService(prisma as never);
  const conv = await service.getConversation('conv-1', 'user-1');
  const peer = conv!.participants.find((p) => p.userId === 'user-2');
  return peer!;
}

describe('QC-F-466: participant DTO carries only a LIVE status', () => {
  it('9a: live stored status → {key, expiresAt ISO} on the participant DTO, raw columns never leak', async () => {
    const expiry = FUTURE();
    const peer = await participantFor({
      statusEmoji: 'quant:flame',
      statusEmojiExpiresAt: expiry,
    });
    expect(peer.emojiStatus).toEqual({ key: 'quant:flame', expiresAt: expiry.toISOString() });
    expect(peer).not.toHaveProperty('statusEmoji');
    expect(peer).not.toHaveProperty('statusEmojiExpiresAt');
  });

  it('10a: expired stored status → null (stale never served)', async () => {
    const peer = await participantFor({
      statusEmoji: 'quant:flame',
      statusEmojiExpiresAt: PAST(),
    });
    expect(peer.emojiStatus).toBeNull();
  });

  it('10b: expiresAt exactly now → null (the boundary is strict >)', async () => {
    const peer = await participantFor({
      statusEmoji: 'quant:flame',
      statusEmojiExpiresAt: new Date(),
    });
    expect(peer.emojiStatus).toBeNull();
  });

  it('11a: half-written rows (either column alone) and unknown keys → null', async () => {
    for (const partial of [
      { statusEmoji: 'quant:wave', statusEmojiExpiresAt: null },
      { statusEmoji: null, statusEmojiExpiresAt: FUTURE() },
      { statusEmoji: 'quant:gone', statusEmojiExpiresAt: FUTURE() },
      { statusEmoji: '🔥', statusEmojiExpiresAt: FUTURE() },
    ]) {
      const peer = await participantFor(partial);
      expect(peer.emojiStatus).toBeNull();
    }
  });

  it('the member query SELECTs the status columns (the DTO is fed by the query, not by luck)', async () => {
    const findUnique = vi.fn(async (_args: unknown) => ({
      id: 'conv-1',
      members: [memberWith({ id: 'user-1', username: 'owner' }), memberWith({})],
    }));
    const prisma = {
      conversation: { findUnique, update: vi.fn() },
      conversationMember: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    const service = new ConversationService(prisma as never);
    await service.getConversation('conv-1', 'user-1');
    const arg = findUnique.mock.calls[0]![0] as unknown as {
      include: { members: { include: { user: { select: Record<string, boolean> } } } };
    };
    expect(arg.include.members.include.user.select).toMatchObject({
      statusEmoji: true,
      statusEmojiExpiresAt: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Search DTO (GET /users/search) — honest fake prisma (QC-F-348 family)
// ---------------------------------------------------------------------------
const SEARCHER = { userId: 'u_searcher', username: 'searcher' };

interface DirectoryRow {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  deletedAt: Date | null;
  preferences: unknown;
  statusEmoji: string | null;
  statusEmojiExpiresAt: Date | null;
}

function row(partial: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    username: partial.id,
    displayName: partial.id,
    email: `${partial.id}@example.test`,
    avatarUrl: null,
    bio: null,
    status: 'ACTIVE',
    deletedAt: null,
    preferences: null,
    statusEmoji: null,
    statusEmojiExpiresAt: null,
    ...partial,
  };
}

type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond === 'string') return value === cond;
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    if ('not' in c) return !matchField(value, c.not);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
    if ('contains' in c) {
      const hay = String(value ?? '');
      const needle = String(c.contains);
      return c.mode === 'insensitive'
        ? hay.toLowerCase().includes(needle.toLowerCase())
        : hay.includes(needle);
    }
  }
  return value === cond;
}

function matchWhere(r: DirectoryRow, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Where[]).some((clause) => matchWhere(r, clause))) return false;
    } else if (!matchField((r as unknown as Record<string, unknown>)[key], cond)) {
      return false;
    }
  }
  return true;
}

function directoryPrisma(rows: DirectoryRow[]) {
  return {
    user: {
      async findMany(args: unknown) {
        const a = args as {
          where?: Where;
          select?: Record<string, boolean>;
          take?: number;
          skip?: number;
          orderBy?: Array<Record<string, string>>;
        };
        if (a.select?.preferences) {
          const ids = (a.where?.id as { in?: string[] } | undefined)?.in ?? [];
          return rows
            .filter((r) => ids.includes(r.id))
            .map((r) => ({ id: r.id, preferences: r.preferences }));
        }
        let out = rows.filter((r) => matchWhere(r, a.where ?? {}));
        if (a.orderBy) {
          const keys = a.orderBy;
          out = [...out].sort((x, y) => {
            for (const key of keys) {
              for (const [field, dir] of Object.entries(key)) {
                const cmp = String(
                  (x as unknown as Record<string, unknown>)[field] ?? '',
                ).localeCompare(String((y as unknown as Record<string, unknown>)[field] ?? ''));
                if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
              }
            }
            return 0;
          });
        }
        if (typeof a.skip === 'number') out = out.slice(a.skip);
        if (typeof a.take === 'number') out = out.slice(0, a.take);
        const select = a.select ?? {};
        return out.map((r) => {
          const projected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) projected[key] = (r as unknown as Record<string, unknown>)[key];
          }
          return projected;
        });
      },
      async findUnique(args: unknown) {
        const id = (args as { where: { id: string } }).where.id;
        const found = rows.find((r) => r.id === id);
        return found ? { preferences: found.preferences } : null;
      },
    },
  };
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function buildSearchApp(rows: DirectoryRow[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  app.decorate('prisma', directoryPrisma(rows) as never);
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth: unknown }).auth = { userId: SEARCHER.userId, username: SEARCHER.username };
  });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.ready();
  apps.push(app);
  return app;
}

interface SearchUser {
  id: string;
  emojiStatus?: { key: string; expiresAt: string } | null;
  statusEmoji?: unknown;
}

async function searchUsers(app: FastifyInstance): Promise<SearchUser[]> {
  const res = await app.inject({ method: 'GET', url: '/users/search?q=status' });
  expect(res.statusCode).toBe(200);
  return (res.json() as { data: SearchUser[] }).data;
}

function searchRows(): DirectoryRow[] {
  return [
    row({ id: SEARCHER.userId, username: 'status_searcher', displayName: 'Status Searcher' }),
    row({
      id: 'u_live',
      username: 'status_live',
      displayName: 'Status Live',
      statusEmoji: 'quant:rocket',
      statusEmojiExpiresAt: FUTURE(),
    }),
    row({
      id: 'u_expired',
      username: 'status_expired',
      displayName: 'Status Expired',
      statusEmoji: 'quant:rocket',
      statusEmojiExpiresAt: PAST(),
    }),
    row({
      id: 'u_half',
      username: 'status_half',
      displayName: 'Status Half',
      statusEmoji: 'quant:rocket',
      statusEmojiExpiresAt: null,
    }),
    row({
      id: 'u_hidden',
      username: 'status_hidden',
      displayName: 'Status Hidden',
      statusEmoji: 'quant:rocket',
      statusEmojiExpiresAt: FUTURE(),
      preferences: { chatSettings: { privacy: { hideFromSearch: true } } },
    }),
  ];
}

describe('QC-F-466: search DTO carries only a LIVE status', () => {
  it('9b: live → {key, expiresAt}; the raw stored columns never leave the server', async () => {
    const app = await buildSearchApp(searchRows());
    const data = await searchUsers(app);
    const live = data.find((u) => u.id === 'u_live');
    expect(live?.emojiStatus?.key).toBe('quant:rocket');
    expect(live?.emojiStatus?.expiresAt).toBeTruthy();
    expect(live).not.toHaveProperty('statusEmoji');
    expect(live).not.toHaveProperty('statusEmojiExpiresAt');
  });

  it('10c: expired and half-written rows read emojiStatus null — the field is always present', async () => {
    const app = await buildSearchApp(searchRows());
    const data = await searchUsers(app);
    for (const id of ['u_expired', 'u_half']) {
      const found = data.find((u) => u.id === id);
      expect(found).toBeDefined();
      expect(found!.emojiStatus).toBeNull();
    }
  });

  it('12: hideFromSearch still hides the whole row — a hidden user leaks no status (QC-F-042 inheritance)', async () => {
    const app = await buildSearchApp(searchRows());
    const data = await searchUsers(app);
    expect(data.map((u) => u.id)).not.toContain('u_hidden');
  });
});

// ---------------------------------------------------------------------------
// Catalog contract (brief §5-T2 case 13)
// ---------------------------------------------------------------------------
describe('QC-F-466: backend mirror == frontend catalog (drift fails here)', () => {
  it('13: EMOJI_STATUS_NAMES equals CUSTOM_EMOJI_PACKS[quant] entry names, in order', () => {
    const pack = CUSTOM_EMOJI_PACKS.find((p) => p.id === EMOJI_STATUS_PACK);
    expect(pack).toBeDefined();
    expect([...EMOJI_STATUS_NAMES]).toEqual(pack!.entries.map((e) => e.name));
    expect(EMOJI_STATUS_NAMES).toHaveLength(12);
  });
});
