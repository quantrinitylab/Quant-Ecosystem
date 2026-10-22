// ============================================================================
// QC-F-564 — POST /avatar/select must project onto User.avatarUrl
//
// Pre-fix defect: select persisted the chosen variant ONLY to the Avatar
// model (201 "primary avatar"), while every real surface — conversation
// DTOs, stories authorAvatar, directory search, map, /auth/me, Flutter
// DTOs — reads User.avatarUrl, which select never wrote. The generated
// avatar therefore appeared nowhere except the profile header's
// AlienAvatar mount.
//
// Band fix (specialist-qc-f-564-buildprep.md §4): after the unchanged
// QC-F-330 media gate passes, ONE interactive $transaction performs
// avatar.upsert + user.update({ avatarUrl: imageUrl }). No migration, no
// envelope change, PUT /auth/profile's allowData:false untouched.
//
// Harness: bare Fastify (QC-F-330 buildRouteApp pattern) over ONE shared
// store, so the read-back chain (T3) runs through the real routes that
// read User.avatarUrl. The fake prisma is transactionally honest: writes
// inside $transaction stage on a cloned state and land only on commit;
// a throw discards them (rollback). Counters/faults live in a shared ctx
// so the tx-scoped client reports into the same tallies.
// ============================================================================
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import avatarRoutes from '../routes/avatar';
import authRoutes from '../routes/auth';
import usersRoutes from '../routes/users';
import storiesRoutes from '../routes/stories';
import { ConversationService } from '../services/conversation.service';

const OWNER = 'user-1';
const OTHER = 'user-2';
const DATA_SVG =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
const DATA_SVG_ALT = 'data:image/svg+xml;base64,QUxULVNWRy1WQVJJQU5ULTI=';
const DATA_PNG_THUMB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const OWN_URL = 'https://quantchat-media.s3.amazonaws.com/user-1/media_abc/photo.jpg';
const OWN_THUMB = 'https://quantchat-media.s3.amazonaws.com/user-1/media_abc/thumb.jpg';

// ---------------------------------------------------------------------------
// Store + transactional fake prisma
// ---------------------------------------------------------------------------
interface StoreUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: string;
  xpPoints: number;
  level: number;
  statusEmoji: string | null;
  statusEmojiExpiresAt: Date | null;
  deletedAt: Date | null;
  status: string;
  preferences?: unknown;
}

interface AvatarRow {
  userId: string;
  style: string;
  imageUrl: string;
  thumbnailUrl: string;
  reactions: unknown;
  updatedAt: Date;
}

interface StoryRow {
  id: string;
  userId: string;
  type: string;
  mediaUrl: string | null;
  textContent: string | null;
  duration: number;
  viewCount: number;
  audience: string;
  createdAt: Date;
  expiresAt: Date;
}

interface DbState {
  users: Map<string, StoreUser>;
  avatars: Map<string, AvatarRow>;
  stories: StoryRow[];
}

interface Ctx {
  counts: { avatarUpsert: number; userUpdate: number };
  faults: { failUserUpdate: boolean };
}

function seedState(): DbState {
  const users = new Map<string, StoreUser>();
  users.set(OWNER, {
    id: OWNER,
    email: 'user1@example.com',
    username: 'user1',
    displayName: 'User One',
    bio: null,
    avatarUrl: null,
    role: 'USER',
    xpPoints: 0,
    level: 1,
    statusEmoji: null,
    statusEmojiExpiresAt: null,
    deletedAt: null,
    status: 'ACTIVE',
  });
  users.set(OTHER, {
    id: OTHER,
    email: 'user2@example.com',
    username: 'user2',
    displayName: 'User Two',
    bio: null,
    avatarUrl: null,
    role: 'USER',
    xpPoints: 0,
    level: 1,
    statusEmoji: null,
    statusEmojiExpiresAt: null,
    deletedAt: null,
    status: 'ACTIVE',
  });
  return { users, avatars: new Map(), stories: [] };
}

function cloneState(state: DbState): DbState {
  return {
    users: new Map([...state.users].map(([k, v]) => [k, structuredClone(v)])),
    avatars: new Map([...state.avatars].map(([k, v]) => [k, structuredClone(v)])),
    stories: structuredClone(state.stories),
  };
}

function project<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, boolean>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out;
}

function matchesWhere(user: StoreUser, where: Record<string, unknown>): boolean {
  const idCond = where['id'] as
    | string
    | { not?: string; in?: string[] }
    | undefined;
  if (typeof idCond === 'string' && user.id !== idCond) return false;
  if (idCond && typeof idCond === 'object') {
    if (idCond.not !== undefined && user.id === idCond.not) return false;
    if (idCond.in !== undefined && !idCond.in.includes(user.id)) return false;
  }
  if (where['deletedAt'] === null && user.deletedAt !== null) return false;
  const statusCond = where['status'] as { notIn?: string[] } | undefined;
  if (statusCond?.notIn && statusCond.notIn.includes(user.status)) return false;
  const or = where['OR'] as Array<Record<string, { contains?: string }>> | undefined;
  if (or) {
    const hit = or.some((clause) => {
      const field = Object.keys(clause)[0] as 'username' | 'displayName' | 'email';
      const needle = clause[field]?.contains?.toLowerCase();
      return needle !== undefined && String(user[field]).toLowerCase().includes(needle);
    });
    if (!hit) return false;
  }
  return true;
}

function makeClient(state: DbState, ctx: Ctx): Record<string, unknown> {
  const client: Record<string, unknown> = {
    avatar: {
      upsert: async (args: {
        where: { userId: string };
        create: Omit<AvatarRow, 'updatedAt'>;
        update: Omit<AvatarRow, 'userId' | 'updatedAt'>;
      }) => {
        ctx.counts.avatarUpsert += 1;
        const existing = state.avatars.get(args.where.userId);
        const row: AvatarRow = existing
          ? { ...existing, ...args.update, updatedAt: new Date() }
          : { ...args.create, updatedAt: new Date() };
        state.avatars.set(args.where.userId, row);
        return { ...row };
      },
      findUnique: async (args: { where: { userId: string } }) => {
        const row = state.avatars.get(args.where.userId);
        return row ? { ...row } : null;
      },
    },
    user: {
      findUnique: async (args: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => {
        const user = state.users.get(args.where.id);
        return user ? project(user as unknown as Record<string, unknown>, args.select) : null;
      },
      findMany: async (args: {
        where?: Record<string, unknown>;
        select?: Record<string, boolean>;
        skip?: number;
        take?: number;
      }) => {
        let rows = [...state.users.values()];
        if (args.where) rows = rows.filter((u) => matchesWhere(u, args.where!));
        rows.sort((a, b) =>
          a.displayName === b.displayName
            ? a.id.localeCompare(b.id)
            : a.displayName.localeCompare(b.displayName),
        );
        if (args.skip) rows = rows.slice(args.skip);
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return rows.map((u) => project(u as unknown as Record<string, unknown>, args.select));
      },
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        ctx.counts.userUpdate += 1;
        if (ctx.faults.failUserUpdate) {
          throw new Error('Simulated P2025: user row vanished mid-transaction');
        }
        const user = state.users.get(args.where.id);
        if (!user) throw new Error('P2025: record to update not found');
        Object.assign(user, args.data);
        return project(user as unknown as Record<string, unknown>, args.select);
      },
    },
    story: {
      create: async (args: { data: Omit<StoryRow, 'id' | 'viewCount' | 'createdAt'> }) => {
        const author = state.users.get(args.data.userId);
        const row: StoryRow = {
          id: `story-${state.stories.length + 1}`,
          viewCount: 0,
          createdAt: new Date(),
          ...args.data,
        };
        state.stories.push(row);
        return {
          ...row,
          user: {
            id: author?.id,
            displayName: author?.displayName,
            avatarUrl: author?.avatarUrl ?? null,
          },
        };
      },
    },
    conversation: {
      // ConversationService.getConversation read model: the members'
      // included `user` rows are joined from the SAME store at query
      // time — exactly what Prisma's include does against one database.
      findUnique: async () => ({
        id: 'conv-1',
        type: 'DIRECT',
        name: null,
        description: null,
        avatarUrl: null,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [OWNER, OTHER].map((userId, i) => {
          const user = state.users.get(userId)!;
          return {
            id: `member-${i + 1}`,
            conversationId: 'conv-1',
            userId,
            role: i === 0 ? 'ADMIN' : 'MEMBER',
            leftAt: null,
            joinedAt: new Date(),
            lastReadAt: null,
            user: { ...user },
          };
        }),
      }),
    },
    $transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const staged = cloneState(state);
      const result = await fn(makeClient(staged, ctx));
      // Commit: staged state replaces the live state wholesale.
      state.users = staged.users;
      state.avatars = staged.avatars;
      state.stories = staged.stories;
      return result;
    },
  };
  return client;
}

// ---------------------------------------------------------------------------
// Bare-Fastify harness (QC-F-330 pattern; identity via x-test-user header)
// ---------------------------------------------------------------------------
async function buildApp(prisma: Record<string, unknown>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
    'prisma',
    prisma,
  );
  app.addHook('preHandler', async (req) => {
    const who = req.headers['x-test-user'];
    if (who === '__none__') return;
    (req as unknown as { auth: unknown }).auth = {
      userId: typeof who === 'string' ? who : OWNER,
      username: 'user1',
    };
  });
  await app.register(avatarRoutes, { prefix: '/avatar' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(storiesRoutes, { prefix: '/stories' });
  await app.ready();
  return app;
}

function selectPayload(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST' as const,
    url: '/avatar/select',
    headers: { 'x-test-user': OWNER },
    payload: { style: 'crystalline', imageUrl: DATA_SVG, thumbnailUrl: DATA_SVG, ...overrides },
  };
}

describe('QC-F-564 avatar select → User.avatarUrl projection', () => {
  let state: DbState;
  let ctx: Ctx;
  let client: Record<string, unknown>;
  let app: FastifyInstance;

  beforeEach(async () => {
    state = seedState();
    ctx = { counts: { avatarUpsert: 0, userUpdate: 0 }, faults: { failUserUpdate: false } };
    client = makeClient(state, ctx);
    app = await buildApp(client);
  });
  afterEach(async () => {
    await app.close();
  });

  it('T1: the real generate→select flow (data:image/svg+xml) projects imageUrl onto User.avatarUrl in the same write', async () => {
    const res = await app.inject(selectPayload());
    expect(res.statusCode).toBe(201);
    const body = res.json() as { success: boolean; data: { imageUrl: string } };
    expect(body.success).toBe(true);
    expect(body.data.imageUrl).toBe(DATA_SVG);
    expect(ctx.counts.avatarUpsert).toBe(1);
    expect(ctx.counts.userUpdate).toBe(1);
    expect(state.avatars.get(OWNER)?.imageUrl).toBe(DATA_SVG);
    expect(state.users.get(OWNER)?.avatarUrl).toBe(DATA_SVG);
  });

  it('T2: an own-storage https avatar projects too (projection is not data:-only)', async () => {
    const res = await app.inject(selectPayload({ imageUrl: OWN_URL, thumbnailUrl: OWN_THUMB }));
    expect(res.statusCode).toBe(201);
    expect(state.avatars.get(OWNER)?.imageUrl).toBe(OWN_URL);
    expect(state.users.get(OWNER)?.avatarUrl).toBe(OWN_URL);
  });

  it('T3: read-back chain — /auth/me, directory search (another user), story authorAvatar and the conversation DTO all serve the new avatar', async () => {
    const sel = await app.inject(selectPayload());
    expect(sel.statusCode).toBe(201);

    // (a) /auth/me — the identity surface behind web userinfo.
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'x-test-user': OWNER },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { data: { avatarUrl?: string } }).data.avatarUrl).toBe(DATA_SVG);

    // (b) Directory search as ANOTHER user — "dusre ke view me bhi".
    const search = await app.inject({
      method: 'GET',
      url: '/users/search?q=user1',
      headers: { 'x-test-user': OTHER },
    });
    expect(search.statusCode).toBe(200);
    const rows = (search.json() as { data: Array<{ id: string; avatarUrl: string | null }> }).data;
    const ownerRow = rows.find((r) => r.id === OWNER);
    expect(ownerRow).toBeDefined();
    expect(ownerRow?.avatarUrl).toBe(DATA_SVG);

    // (c1) Story creation serializes authorAvatar from the same row.
    const story = await app.inject({
      method: 'POST',
      url: '/stories',
      headers: { 'x-test-user': OWNER },
      payload: { type: 'text', text: 'avatar check' },
    });
    expect(story.statusCode).toBe(201);
    const storyBody = story.json() as { story: { authorAvatar: string } };
    expect(storyBody.story.authorAvatar).toBe(DATA_SVG);

    // (c2) Conversation participant DTO (the chat-list/chat surface).
    const service = new ConversationService(client as never);
    const conv = await service.getConversation('conv-1', OTHER);
    const ownerDto = conv?.participants.find((p) => p.userId === OWNER);
    expect(ownerDto).toBeDefined();
    expect(ownerDto?.avatarUrl).toBe(DATA_SVG);
  });

  it('T4: imageUrl ≠ thumbnailUrl — the Avatar row keeps both verbatim, User.avatarUrl receives imageUrl (never the thumbnail)', async () => {
    const res = await app.inject(
      selectPayload({ imageUrl: DATA_SVG, thumbnailUrl: DATA_PNG_THUMB }),
    );
    expect(res.statusCode).toBe(201);
    expect(state.avatars.get(OWNER)?.imageUrl).toBe(DATA_SVG);
    expect(state.avatars.get(OWNER)?.thumbnailUrl).toBe(DATA_PNG_THUMB);
    expect(state.users.get(OWNER)?.avatarUrl).toBe(DATA_SVG);
  });

  it('T5: unauthenticated select → 401 and zero writes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/avatar/select',
      headers: { 'x-test-user': '__none__' },
      payload: { style: 'crystalline', imageUrl: DATA_SVG, thumbnailUrl: DATA_SVG },
    });
    expect(res.statusCode).toBe(401);
    expect(ctx.counts.avatarUpsert).toBe(0);
    expect(ctx.counts.userUpdate).toBe(0);
    expect(state.avatars.size).toBe(0);
    expect(state.users.get(OWNER)?.avatarUrl).toBeNull();
  });

  it('T6: invalid body (bad style / empty URL) → 400 and zero writes', async () => {
    const badStyle = await app.inject(selectPayload({ style: 'bogus' }));
    expect(badStyle.statusCode).toBe(400);
    const emptyUrl = await app.inject(selectPayload({ imageUrl: '' }));
    expect(emptyUrl.statusCode).toBe(400);
    expect(ctx.counts.avatarUpsert).toBe(0);
    expect(ctx.counts.userUpdate).toBe(0);
    expect(state.avatars.size).toBe(0);
  });

  it('T7: user.update fails inside the transaction → no 201, and the Avatar row is rolled back (no half-state)', async () => {
    ctx.faults.failUserUpdate = true;
    const res = await app.inject(selectPayload());
    expect(res.statusCode).not.toBe(201);
    expect(state.avatars.has(OWNER)).toBe(false);
    expect(state.users.get(OWNER)?.avatarUrl).toBeNull();
  });

  it('T8: a second select replaces BOTH rows together — the old value survives nowhere', async () => {
    const first = await app.inject(selectPayload());
    expect(first.statusCode).toBe(201);
    const second = await app.inject(
      selectPayload({ style: 'bioluminescent', imageUrl: DATA_SVG_ALT, thumbnailUrl: DATA_SVG_ALT }),
    );
    expect(second.statusCode).toBe(201);
    expect(state.avatars.get(OWNER)?.imageUrl).toBe(DATA_SVG_ALT);
    expect(state.users.get(OWNER)?.avatarUrl).toBe(DATA_SVG_ALT);
  });

  it('T9: a prisma without $transaction fails closed 503 — no silent non-transactional downgrade, zero writes', async () => {
    const bare = { ...client };
    delete bare['$transaction'];
    const bareApp = await buildApp(bare);
    try {
      const res = await bareApp.inject(selectPayload());
      expect(res.statusCode).toBe(503);
      expect(state.avatars.size).toBe(0);
      expect(state.users.get(OWNER)?.avatarUrl).toBeNull();
    } finally {
      await bareApp.close();
    }
  });

  it('T10 (gate pin): an external-host avatar is rejected 400 with BOTH writes at zero (QC-F-330 NC-3)', async () => {
    const res = await app.inject(
      selectPayload({ imageUrl: 'https://tracker.evil.example/a.png' }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'MEDIA_URL_NOT_ALLOWED' },
    });
    expect(ctx.counts.avatarUpsert).toBe(0);
    expect(ctx.counts.userUpdate).toBe(0);
    expect(state.avatars.size).toBe(0);
    expect(state.users.get(OWNER)?.avatarUrl).toBeNull();
  });
});
