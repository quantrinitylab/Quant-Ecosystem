// ============================================================================
// QC-F-042 — privacy enforcement regression tests
//
// The 8 privacy settings were WRITE-ONLY: PUT /settings persisted them into
// User.preferences.chatSettings.privacy and nothing ever read them back, so
// a user who set "hide my online status / read receipts / typing", "nobody
// can message me", "hide me from search", "nobody can see my location", or
// "allow screenshots" got a saved toggle and zero effect. The fix adds a
// shared PrivacyService resolver and one gate per field:
//
//   showOnlineStatus   -> WS presence list + publication (websocket.ts)
//   showTypingIndicator-> WS typing frames dropped silently
//   showReadReceipts   -> read receipts neither created (reader pref) nor
//                         shown (sender pref, reciprocity); delivered kept
//   hideFromSearch     -> GET /users/search post-filter
//   whoCanMessage      -> NEW conversations (direct + group create) and
//                         addMember (QC-F-277) (403 MESSAGE_NOT_ALLOWED /
//                         honest 503 on prefs error); existing
//                         conversations are NEVER gated (case 11)
//   whoCanSeeLocation  -> LocationService owner-side filter
//   allowScreenshots   -> screenshot system message only when the AUTHOR
//                         did not opt out (notified flag tells the truth)
//   whoCanSeeStory     -> already enforced by QC-F-021 (feed/view/reply,
//                         same v1 friend definition) — not re-tested here.
//
// Every gate test FAILS against the pre-fix code (the pre-fix services have
// no privacy parameter and ignore prefs entirely — verified by negative
// control) and passes with the fix. Fakes are in-memory with stable
// module-level identities; no fresh-identity mocks.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { PrivacyService, getPrivacyService } from '../services/privacy.service';
import { LocationService } from '../services/location.service';
import { ConversationService } from '../services/conversation.service';
import { ReceiptService } from '../services/receipt.service';
import { DisappearingService } from '../services/disappearing.service';
import { MessageService } from '../services/message.service';
import { createFakeMessagePrisma, asPrismaClient } from './fake-message-prisma';
import usersRoutes from '../routes/users';
import receiptsRoutes from '../routes/receipts';
import settingsRoutes from '../routes/settings';
import { websocketRoutes } from '../routes/websocket';

// Stable identities (module-level).
const OWNER = { userId: 'user_owner', username: 'owner' };
const STRANGER = { userId: 'user_stranger', username: 'stranger' };
const CLOSE_FRIEND = { userId: 'user_close_friend', username: 'closefriend' };
const READER_OFF = { userId: 'user_reader_off', username: 'readeroff' };
const SENDER_OFF = { userId: 'user_sender_off', username: 'senderoff' };
const SENDER_ON = { userId: 'user_sender_on', username: 'senderon' };

function prefs(privacy: Record<string, unknown>) {
  return { chatSettings: { privacy } };
}

/** PrivacyService over a simple user-id -> preferences map. */
function privacyOver(userPrefs: Map<string, unknown>, throwOnRead = false) {
  const fake = {
    user: {
      async findUnique(args: unknown) {
        if (throwOnRead) throw new Error('db down');
        const id = (args as { where: { id: string } }).where.id;
        if (!userPrefs.has(id)) return null;
        return { preferences: userPrefs.get(id) };
      },
      async findMany(args: unknown) {
        if (throwOnRead) throw new Error('db down');
        const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
        return ids
          .filter((id) => userPrefs.has(id))
          .map((id) => ({ id, preferences: userPrefs.get(id) }));
      },
    },
    closeFriend: {
      async findMany() {
        return [];
      },
    },
    conversationMember: {
      async findMany() {
        return [];
      },
    },
    conversation: {
      async findMany() {
        return [];
      },
    },
  };
  return new PrivacyService(fake as never);
}

// ---------------------------------------------------------------------------
// whoCanSeeLocation — LocationService owner-side gate
// ---------------------------------------------------------------------------
describe('QC-F-042 location: owner whoCanSeeLocation gate', () => {
  function locationService(ownerPreferences: unknown) {
    const fake = {
      closeFriend: {
        // QC-F-533 harness direction: the edge is OWNER -> STRANGER (the
        // owner listed the viewer as a close friend — the only direction
        // that authorizes the viewer), answered WHERE-AWARE from the
        // actual query so the old caller-side query shape
        // ({ where: { userId: viewer } }) finds no authorizing edge.
        async findMany(args: unknown) {
          const edges = [
            { id: 'edge-1', userId: OWNER.userId, friendId: STRANGER.userId, createdAt: new Date() },
          ];
          const where =
            (args as { where?: { userId?: string; friendId?: string } }).where ?? {};
          return edges.filter(
            (e) =>
              (where.userId === undefined || e.userId === where.userId) &&
              (where.friendId === undefined || e.friendId === where.friendId),
          );
        },
      },
      // QC-F-533: empty DIRECT delegates — no conversation relationships
      // in this harness, so the DIRECT half proves nobody (fail-closed).
      conversationMember: {
        async findMany() {
          return [];
        },
      },
      conversation: {
        async findMany() {
          return [];
        },
      },
      friendLocation: {
        async findMany() {
          return [
            {
              id: 'loc-1',
              userId: OWNER.userId,
              latitude: 10,
              longitude: 20,
              // QC-F-437 fixture clock: fresh (inside the 8h staleness
              // window) so the 'friends'-pref cases exercise the QC-F-042
              // gate itself, not the staleness filter. Assertions unchanged.
              updatedAt: new Date(),
            },
          ];
        },
      },
      user: {
        async findMany() {
          return [
            {
              id: OWNER.userId,
              username: 'owner',
              displayName: 'Owner',
              avatarUrl: null,
              preferences: ownerPreferences,
            },
          ];
        },
      },
    };
    return new LocationService(fake as never);
  }

  it("hides an owner whose pref is 'nobody' even from their close friends", async () => {
    const svc = locationService(prefs({ whoCanSeeLocation: 'nobody' }));
    await expect(svc.getFriendsOnMap(STRANGER.userId)).resolves.toEqual([]);
  });

  it("hides an owner whose pref is 'ghost'", async () => {
    const svc = locationService(prefs({ whoCanSeeLocation: 'ghost' }));
    await expect(svc.getFriendsOnMap(STRANGER.userId)).resolves.toEqual([]);
  });

  it("shows an owner whose pref is 'friends' (the default behaviour is unchanged)", async () => {
    const svc = locationService(prefs({ whoCanSeeLocation: 'friends' }));
    const result = await svc.getFriendsOnMap(STRANGER.userId);
    expect(result.map((f) => f.userId)).toEqual([OWNER.userId]);
  });

  it('shows an owner who never stored prefs (default friends)', async () => {
    const svc = locationService(null);
    const result = await svc.getFriendsOnMap(STRANGER.userId);
    expect(result.map((f) => f.userId)).toEqual([OWNER.userId]);
  });

  it('hides the owner without crashing when stored prefs are malformed', async () => {
    const svc = locationService('not-an-object');
    await expect(svc.getFriendsOnMap(STRANGER.userId)).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// whoCanMessage — ConversationService gate on NEW direct conversations
// ---------------------------------------------------------------------------
describe('QC-F-042 whoCanMessage: new direct conversation gate', () => {
  function makeConversationPrisma(userPrefs: Map<string, unknown>) {
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      conversation: {
        async create(args: unknown) {
          const conv = { id: 'conv-new', ...(args as { data: object }).data };
          created.push(conv);
          return conv;
        },
      },
      conversationMember: {
        async createMany() {
          return { count: 2 };
        },
      },
    };
    const prisma = {
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!userPrefs.has(id)) return null;
          return { preferences: userPrefs.get(id) };
        },
        async findMany(args: unknown) {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return ids
            .filter((id) => userPrefs.has(id))
            .map((id) => ({ id, preferences: userPrefs.get(id) }));
        },
      },
      closeFriend: {
        async findMany(args: unknown) {
          const where = (args as { where: { userId: string; friendId: string } }).where;
          return where.userId === OWNER.userId && where.friendId === CLOSE_FRIEND.userId
            ? [{ userId: OWNER.userId }]
            : [];
        },
      },
      conversationMember: {
        async findMany() {
          return [];
        },
        async findFirst() {
          return null;
        },
      },
      conversation: {
        async findMany() {
          return [];
        },
      },
      async $transaction(cb: (tx: unknown) => Promise<unknown>) {
        return cb(tx);
      },
    };
    return { prisma, created };
  }

  function serviceFor(userPrefs: Map<string, unknown>, throwOnRead = false) {
    const { prisma, created } = makeConversationPrisma(userPrefs);
    const privacy = throwOnRead
      ? privacyOver(new Map(), true)
      : new PrivacyService(prisma as never);
    const service = new ConversationService(prisma as never, privacy);
    return { service, created, prisma };
  }

  it("rejects a stranger with 403 MESSAGE_NOT_ALLOWED when the target chose 'nobody', creating nothing", async () => {
    const { service, created } = serviceFor(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'nobody' })]]),
    );
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId],
        type: 'direct',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(created).toEqual([]);
  });

  it("rejects a stranger under the default 'friends' pref, but allows the target's close friend", async () => {
    const { service, created } = serviceFor(new Map([[OWNER.userId, null]]));
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId],
        type: 'direct',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });

    const conv = await service.createConversation({
      creatorId: CLOSE_FRIEND.userId,
      participantIds: [OWNER.userId],
      type: 'direct',
    });
    expect(conv.id).toBe('conv-new');
    expect(created).toHaveLength(1);
  });

  it("allows a stranger when the target chose 'everyone'", async () => {
    const { service } = serviceFor(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'everyone' })]]),
    );
    const conv = await service.createConversation({
      creatorId: STRANGER.userId,
      participantIds: [OWNER.userId],
      type: 'direct',
    });
    expect(conv.id).toBe('conv-new');
  });

  it('answers an honest 503 (not a fabricated refusal) when prefs cannot be read', async () => {
    const { service, created } = serviceFor(new Map(), true);
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId],
        type: 'direct',
      }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'UPSTREAM_UNAVAILABLE' });
    expect(created).toEqual([]);
  });

  // QC-F-277 (PIN FLIP): this case previously asserted the bypass — group
  // creation was "out of v1 scope" and a 'nobody' target was added without
  // any gate. Group creation is initiation, so it is gated exactly like a
  // direct create now.
  it('rejects group creation when a target chose nobody (QC-F-277 pin flip)', async () => {
    const { service, created } = serviceFor(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'nobody' })]]),
    );
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId, CLOSE_FRIEND.userId],
        type: 'group',
        name: 'Team',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(created).toEqual([]);
  });

  it('QC-F-277: rejects a 2-person group when the sole target chose nobody', async () => {
    const { service, created } = serviceFor(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'nobody' })]]),
    );
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId],
        type: 'group',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(created).toEqual([]);
  });

  it("QC-F-277: 2-person group under the default 'friends' pref rejects a stranger but allows the target's close friend", async () => {
    const { service, created } = serviceFor(new Map([[OWNER.userId, null]]));
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId],
        type: 'group',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(created).toEqual([]);

    const conv = await service.createConversation({
      creatorId: CLOSE_FRIEND.userId,
      participantIds: [OWNER.userId],
      type: 'group',
    });
    expect(conv.id).toBe('conv-new');
    expect(created).toHaveLength(1);
  });

  it('QC-F-277: a large group is all-or-nothing — one denied target rejects the whole create, nothing is created', async () => {
    const { service, created } = serviceFor(
      new Map<string, unknown>([
        [SENDER_ON.userId, prefs({ whoCanMessage: 'everyone' })],
        [SENDER_OFF.userId, prefs({ whoCanMessage: 'everyone' })],
        [OWNER.userId, prefs({ whoCanMessage: 'nobody' })],
      ]),
    );
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [SENDER_ON.userId, SENDER_OFF.userId, OWNER.userId],
        type: 'group',
        name: 'Big Team',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(created).toEqual([]);
  });

  it('QC-F-277: a large group whose targets all allow the creator is created', async () => {
    const { service, created } = serviceFor(
      new Map<string, unknown>([
        [SENDER_ON.userId, prefs({ whoCanMessage: 'everyone' })],
        [SENDER_OFF.userId, prefs({ whoCanMessage: 'everyone' })],
        [OWNER.userId, prefs({ whoCanMessage: 'everyone' })],
      ]),
    );
    const conv = await service.createConversation({
      creatorId: STRANGER.userId,
      participantIds: [SENDER_ON.userId, SENDER_OFF.userId, OWNER.userId],
      type: 'group',
      name: 'Big Team',
    });
    expect(conv.id).toBe('conv-new');
    expect(created).toHaveLength(1);
  });

  it('QC-F-277: group creation answers an honest 503 when a target prefs read fails, creating nothing', async () => {
    const { service, created } = serviceFor(new Map(), true);
    await expect(
      service.createConversation({
        creatorId: STRANGER.userId,
        participantIds: [OWNER.userId, CLOSE_FRIEND.userId],
        type: 'group',
        name: 'Team',
      }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'UPSTREAM_UNAVAILABLE' });
    expect(created).toEqual([]);
  });

  it('QC-F-277: group creation keeps direct-gate parity for a missing target (gate skipped; existence is QC-F-278 scope)', async () => {
    const { service, created } = serviceFor(new Map());
    const conv = await service.createConversation({
      creatorId: STRANGER.userId,
      participantIds: ['user_missing_target'],
      type: 'group',
    });
    expect(conv.id).toBe('conv-new');
    expect(created).toHaveLength(1);
  });

  it('case 11: an existing conversation keeps working after the recipient flips to nobody — sendMessage carries no pref gate', async () => {
    // The conversation already exists with both members. whoCanMessage
    // guards INITIATION only; MessageService.sendMessage must still deliver
    // (membership is its only authority). If a future refactor adds a pref
    // gate to the send path, this test goes red on purpose.
    const fake = createFakeMessagePrisma([
      { conversationId: 'conv-existing', memberIds: [STRANGER.userId, OWNER.userId] },
    ]);
    const messages = new MessageService(asPrismaClient(fake));
    const sent = await messages.sendMessage({
      conversationId: 'conv-existing',
      senderId: STRANGER.userId,
      content: 'still delivered inside our existing chat',
    });
    expect(sent.conversationId).toBe('conv-existing');
    expect(fake.__state.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// QC-F-277 — whoCanMessage gate on addMember (initiation via an existing
// group). The ADDER is the actor: the target's pref judges the adder,
// exactly as the create gate judges the creator. The privacy check runs
// LAST — every pre-existing rejection (404 / DIRECT 400 / NOT_A_MEMBER /
// NOT_CONVERSATION_ADMIN / ALREADY_MEMBER 409) keeps its precedence.
// ---------------------------------------------------------------------------
describe('QC-F-277 whoCanMessage: addMember gate', () => {
  const ADDER = STRANGER;
  const GROUP_ID = 'conv-group';

  function makeAddMemberService(
    userPrefs: Map<string, unknown>,
    opts: {
      conversationType?: string;
      memberIds?: string[];
      throwOnRead?: boolean;
    } = {},
  ) {
    const memberIds = new Set(opts.memberIds ?? [ADDER.userId, CLOSE_FRIEND.userId]);
    const added: Array<Record<string, unknown>> = [];
    const prisma = {
      conversation: {
        async findUnique() {
          return { id: GROUP_ID, type: opts.conversationType ?? 'GROUP' };
        },
        async findMany() {
          return [];
        },
      },
      conversationMember: {
        async findFirst(args: unknown) {
          const w = (args as { where: { userId: string } }).where;
          return memberIds.has(w.userId)
            ? { id: `mem-${w.userId}`, conversationId: GROUP_ID, userId: w.userId, role: 'MEMBER', leftAt: null }
            : null;
        },
        async findMany() {
          return [];
        },
        async create(args: unknown) {
          const row = { id: 'mem-new', ...(args as { data: object }).data };
          added.push(row as Record<string, unknown>);
          return row;
        },
      },
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!userPrefs.has(id)) return null;
          return { preferences: userPrefs.get(id) };
        },
        async findMany(args: unknown) {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return ids
            .filter((id) => userPrefs.has(id))
            .map((id) => ({ id, preferences: userPrefs.get(id) }));
        },
      },
      closeFriend: {
        async findMany(args: unknown) {
          const where = (args as { where: { userId: string; friendId: string } }).where;
          return where.userId === OWNER.userId && where.friendId === CLOSE_FRIEND.userId
            ? [{ userId: OWNER.userId }]
            : [];
        },
      },
    };
    const privacy = opts.throwOnRead
      ? privacyOver(new Map(), true)
      : new PrivacyService(prisma as never);
    const service = new ConversationService(prisma as never, privacy);
    return { service, added };
  }

  it("rejects adding a target who chose 'nobody', creating no member", async () => {
    const { service, added } = makeAddMemberService(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'nobody' })]]),
    );
    await expect(
      service.addMember(GROUP_ID, ADDER.userId, OWNER.userId),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(added).toEqual([]);
  });

  it("adds a target who chose 'everyone'", async () => {
    const { service, added } = makeAddMemberService(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'everyone' })]]),
    );
    const row = await service.addMember(GROUP_ID, ADDER.userId, OWNER.userId);
    expect(row.userId).toBe(OWNER.userId);
    expect(added).toHaveLength(1);
  });

  it("under the default 'friends' pref, a stranger adder is rejected but the target's close friend may add", async () => {
    const denied = makeAddMemberService(new Map([[OWNER.userId, null]]));
    await expect(
      denied.service.addMember(GROUP_ID, ADDER.userId, OWNER.userId),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MESSAGE_NOT_ALLOWED' });
    expect(denied.added).toEqual([]);

    const allowed = makeAddMemberService(new Map([[OWNER.userId, null]]));
    const row = await allowed.service.addMember(GROUP_ID, CLOSE_FRIEND.userId, OWNER.userId);
    expect(row.userId).toBe(OWNER.userId);
    expect(allowed.added).toHaveLength(1);
  });

  it('answers an honest 503 when the target prefs read fails, creating no member', async () => {
    const { service, added } = makeAddMemberService(new Map(), { throwOnRead: true });
    await expect(
      service.addMember(GROUP_ID, ADDER.userId, OWNER.userId),
    ).rejects.toMatchObject({ statusCode: 503, code: 'UPSTREAM_UNAVAILABLE' });
    expect(added).toEqual([]);
  });

  it('precedence: an already-member target gets 409 ALREADY_MEMBER even when their pref would deny', async () => {
    const { service, added } = makeAddMemberService(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'nobody' })]]),
      { memberIds: [ADDER.userId, OWNER.userId] },
    );
    await expect(
      service.addMember(GROUP_ID, ADDER.userId, OWNER.userId),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_MEMBER' });
    expect(added).toEqual([]);
  });

  it('precedence: a plain member assigning a privileged role still gets NOT_CONVERSATION_ADMIN before the privacy gate', async () => {
    const { service, added } = makeAddMemberService(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'everyone' })]]),
    );
    await expect(
      service.addMember(GROUP_ID, ADDER.userId, OWNER.userId, 'ADMIN'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_CONVERSATION_ADMIN' });
    expect(added).toEqual([]);
  });

  it('precedence: adding to a direct conversation still gets 400 DIRECT_CONVERSATION', async () => {
    const { service, added } = makeAddMemberService(
      new Map([[OWNER.userId, prefs({ whoCanMessage: 'everyone' })]]),
      { conversationType: 'DIRECT' },
    );
    await expect(
      service.addMember(GROUP_ID, ADDER.userId, OWNER.userId),
    ).rejects.toMatchObject({ statusCode: 400, code: 'DIRECT_CONVERSATION' });
    expect(added).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// showReadReceipts — ReceiptService reader gate + sender visibility gate
// ---------------------------------------------------------------------------
describe('QC-F-042 read receipts: reader creation gate + sender visibility gate', () => {
  function makeReceipts() {
    const rows = new Map<string, { messageId: string; userId: string; deliveredAt: Date | null; readAt: Date | null }>();
    const userPrefs = new Map<string, unknown>([
      [READER_OFF.userId, prefs({ showReadReceipts: false })],
      [SENDER_OFF.userId, prefs({ showReadReceipts: false })],
      [SENDER_ON.userId, null],
      [STRANGER.userId, null],
    ]);
    const fake = {
      messageDelivery: {
        async findUnique(args: unknown) {
          const w = (args as { where: { messageId_userId: { messageId: string; userId: string } } }).where.messageId_userId;
          return rows.get(`${w.messageId}::${w.userId}`) ?? null;
        },
        async upsert(args: unknown) {
          const a = args as {
            where: { messageId_userId: { messageId: string; userId: string } };
            create: { messageId: string; userId: string; deliveredAt?: Date; readAt?: Date };
            update: { deliveredAt?: Date; readAt?: Date };
          };
          const key = `${a.where.messageId_userId.messageId}::${a.where.messageId_userId.userId}`;
          const existing = rows.get(key);
          const row = existing
            ? { ...existing, ...a.update }
            : {
                messageId: a.create.messageId,
                userId: a.create.userId,
                deliveredAt: a.create.deliveredAt ?? null,
                readAt: a.create.readAt ?? null,
              };
          rows.set(key, row as never);
          return row;
        },
        async findMany(args: unknown) {
          const messageId = (args as { where: { messageId: string } }).where.messageId;
          return [...rows.values()].filter((r) => r.messageId === messageId);
        },
      },
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!userPrefs.has(id)) return null;
          return { preferences: userPrefs.get(id) };
        },
        async findMany(args: unknown) {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return ids
            .filter((id) => userPrefs.has(id))
            .map((id) => ({ id, preferences: userPrefs.get(id) }));
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversationMember: {
        async findMany() { return []; },
        // QC-F-042 amend (gap 1): ReceiptService now proves membership
        // before recording/querying receipts. These scenarios presuppose
        // ACTIVE members of 'conv-rcpt' — modelled here; authorization
        // failures themselves are pinned in qc-f-042-amend-receipts.test.ts.
        async findFirst(args: unknown) {
          const w = (args as { where: { conversationId: string; userId: string; leftAt: null } }).where;
          const members = [READER_OFF.userId, STRANGER.userId, SENDER_OFF.userId, SENDER_ON.userId, 'user_rsender'];
          return w.conversationId === 'conv-rcpt' && members.includes(w.userId)
            ? { conversationId: w.conversationId, userId: w.userId, leftAt: null }
            : null;
        },
      },
      conversation: { async findMany() { return []; } },
      // QC-F-042 amend (gap 1): message rows for the authorization checks.
      // msg-1/msg-2 were sent by a third party ('user_rsender'); the two
      // reciprocity messages are sent BY the two senders under test.
      message: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          const senders: Record<string, string> = {
            'msg-1': 'user_rsender',
            'msg-2': 'user_rsender',
            'msg-3': SENDER_OFF.userId,
            'msg-4': SENDER_ON.userId,
          };
          const senderId = senders[id];
          return senderId ? { conversationId: 'conv-rcpt', senderId } : null;
        },
      },
    };
    const service = new ReceiptService(fake as never, new PrivacyService(fake as never));
    return { service, rows };
  }

  it('reader with receipts off: read is suppressed — no row is persisted, delivered still records', async () => {
    const { service, rows } = makeReceipts();
    const delivered = await service.markMessageDelivered('msg-1', READER_OFF.userId);
    expect(delivered.status).toBe('delivered');

    const read = await service.markMessageRead('msg-1', READER_OFF.userId);
    expect(read.status).toBe('read');
    expect(read.suppressed).toBe(true);

    const row = rows.get(`msg-1::${READER_OFF.userId}`);
    expect(row?.readAt).toBeNull();
    expect(row?.deliveredAt).toBeInstanceOf(Date);
  });

  it('reader with default prefs: read records normally (control)', async () => {
    const { service, rows } = makeReceipts();
    const read = await service.markMessageRead('msg-2', STRANGER.userId);
    expect(read.suppressed).toBeUndefined();
    expect(rows.get(`msg-2::${STRANGER.userId}`)?.readAt).toBeInstanceOf(Date);
  });

  it('sender with receipts off never sees a read status (reciprocity); sender with defaults does', async () => {
    const { service } = makeReceipts();
    // QC-F-042 amend (gap 1): receipt status is sender-only now, so the
    // two viewers can no longer query the SAME message — each sender
    // queries their OWN message (msg-3 = SENDER_OFF's, msg-4 =
    // SENDER_ON's), both read by the same reader. The reciprocity
    // assertions themselves are unchanged.
    await service.markMessageRead('msg-3', STRANGER.userId);
    await service.markMessageRead('msg-4', STRANGER.userId);

    const forOff = await service.getMessageReceiptStatus('msg-3', SENDER_OFF.userId);
    expect(forOff.status).toBe('delivered');
    expect(forOff.receipts[0]?.status).toBe('delivered');

    const forOn = await service.getMessageReceiptStatus('msg-4', SENDER_ON.userId);
    expect(forOn.status).toBe('read');
    expect(forOn.receipts[0]?.status).toBe('read');
  });
});

// ---------------------------------------------------------------------------
// allowScreenshots — DisappearingService author gate
// ---------------------------------------------------------------------------
describe('QC-F-042 screenshots: author allowScreenshots gates the notification', () => {
  function makeDisappearing(authorPrefs: unknown, viewerPrefs: unknown) {
    const created: Array<Record<string, unknown>> = [];
    const userPrefs = new Map<string, unknown>([
      [OWNER.userId, authorPrefs],
      [STRANGER.userId, viewerPrefs],
    ]);
    const fake = {
      message: {
        async findUnique() {
          return { id: 'msg-1', conversationId: 'conv-1', senderId: OWNER.userId };
        },
        async create(args: unknown) {
          created.push(args as Record<string, unknown>);
          return { id: 'sys-1' };
        },
      },
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!userPrefs.has(id)) return null;
          return { preferences: userPrefs.get(id) };
        },
        async findMany(args: unknown) {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return ids
            .filter((id) => userPrefs.has(id))
            .map((id) => ({ id, preferences: userPrefs.get(id) }));
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversationMember: {
        async findMany() { return []; },
        // QC-F-042 r2 (rebase onto QC-F-038): recordScreenshot now runs the
        // F-038 membership gate first. These scenarios presuppose a MEMBER
        // viewer — what is under test here is the author's pref, not
        // membership (F-038's own suite pins the non-member rejection).
        async findFirst() { return { id: 'mem-1', leftAt: null }; },
      },
      conversation: { async findMany() { return []; } },
    };
    const service = new DisappearingService(fake as never, new PrivacyService(fake as never));
    return { service, created };
  }

  it('author opted out (allowScreenshots true): no system message, notified false', async () => {
    const { service, created } = makeDisappearing(prefs({ allowScreenshots: true }), null);
    const result = await service.recordScreenshot('msg-1', STRANGER.userId, 'Stranger');
    expect(result.notified).toBe(false);
    expect(result.systemMessageId).toBeNull();
    expect(created).toEqual([]);
  });

  it('author default (allowScreenshots false): system message is posted, notified true', async () => {
    const { service, created } = makeDisappearing(null, null);
    const result = await service.recordScreenshot('msg-1', STRANGER.userId, 'Stranger');
    expect(result.notified).toBe(true);
    expect(result.systemMessageId).toBe('sys-1');
    expect(created).toHaveLength(1);
  });

  it("direction pin: the viewer's own pref never decides — only the author's", async () => {
    // Viewer allows screenshots, author does not -> still notified.
    const a = makeDisappearing(prefs({ allowScreenshots: false }), prefs({ allowScreenshots: true }));
    await expect(
      a.service.recordScreenshot('msg-1', STRANGER.userId, 'Stranger'),
    ).resolves.toMatchObject({ notified: true });
    // Viewer disallows, author allows -> still suppressed.
    const b = makeDisappearing(prefs({ allowScreenshots: true }), prefs({ allowScreenshots: false }));
    await expect(
      b.service.recordScreenshot('msg-1', STRANGER.userId, 'Stranger'),
    ).resolves.toMatchObject({ notified: false });
  });
});

// ---------------------------------------------------------------------------
// Route-level harness (bare Fastify + fake prisma, QC-F-021 pattern)
// ---------------------------------------------------------------------------
const apps: FastifyInstance[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function buildTestApp(
  register: (app: FastifyInstance) => Promise<void>,
  prisma: unknown,
  auth: { userId: string; username: string } | null,
): Promise<FastifyInstance> {
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
  app.decorate('prisma', prisma as never);
  if (auth) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: auth.userId,
        username: auth.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await register(app);
  await app.ready();
  apps.push(app);
  return app;
}

// ---------------------------------------------------------------------------
// hideFromSearch — GET /users/search post-filter
// ---------------------------------------------------------------------------
describe('QC-F-042 search: hideFromSearch post-filter', () => {
  const directory = [
    { id: OWNER.userId, username: 'owner', displayName: 'Owner', avatarUrl: null, bio: null },
    { id: STRANGER.userId, username: 'stranger', displayName: 'Stranger', avatarUrl: null, bio: null },
  ];
  const userPrefs = new Map<string, unknown>([
    [OWNER.userId, prefs({ hideFromSearch: true })],
    [STRANGER.userId, null],
  ]);

  function directoryPrisma(throwOnPrefsRead = false) {
    return {
      user: {
        async findMany(args: unknown) {
          const a = args as { select?: Record<string, boolean>; where?: { id?: { in: string[] } } };
          if (a.select?.preferences) {
            if (throwOnPrefsRead) throw new Error('db down');
            const ids = a.where?.id?.in ?? [];
            return ids
              .filter((id) => userPrefs.has(id))
              .map((id) => ({ id, preferences: userPrefs.get(id) }));
          }
          // Directory query: the fake returns the rows the query matched.
          return directory;
        },
      },
    };
  }

  it('hides a hideFromSearch user from results; default users remain', async () => {
    const app = await buildTestApp(
      async (a) => {
        await a.register(usersRoutes, { prefix: '/users' });
      },
      directoryPrisma(),
      CLOSE_FRIEND,
    );
    const res = await app.inject({ method: 'GET', url: '/users/search?q=o' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.map((u) => u.id)).toEqual([STRANGER.userId]);
  });

  it('fails closed (200, hidden user absent) when the prefs read fails', async () => {
    const app = await buildTestApp(
      async (a) => {
        await a.register(usersRoutes, { prefix: '/users' });
      },
      directoryPrisma(true),
      CLOSE_FRIEND,
    );
    const res = await app.inject({ method: 'GET', url: '/users/search?q=o' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.map((u) => u.id)).not.toContain(OWNER.userId);
  });
});

// ---------------------------------------------------------------------------
// Receipts route: a suppressed read publishes no realtime tick and stores none
// ---------------------------------------------------------------------------
describe('QC-F-042 receipts route: suppressed read stores nothing', () => {
  function receiptsPrisma(readerPrefs: unknown) {
    const rows = new Map<string, { messageId: string; userId: string; deliveredAt: Date | null; readAt: Date | null }>();
    const prisma = {
      messageDelivery: {
        async findUnique(args: unknown) {
          const w = (args as { where: { messageId_userId: { messageId: string; userId: string } } }).where.messageId_userId;
          return rows.get(`${w.messageId}::${w.userId}`) ?? null;
        },
        async upsert(args: unknown) {
          const a = args as {
            where: { messageId_userId: { messageId: string; userId: string } };
            create: { messageId: string; userId: string; deliveredAt?: Date; readAt?: Date };
            update: { deliveredAt?: Date; readAt?: Date };
          };
          const key = `${a.where.messageId_userId.messageId}::${a.where.messageId_userId.userId}`;
          const row = {
            messageId: a.create.messageId,
            userId: a.create.userId,
            deliveredAt: a.create.deliveredAt ?? null,
            readAt: a.create.readAt ?? null,
            ...(rows.get(key) ?? {}),
            ...a.update,
          };
          rows.set(key, row as never);
          return row;
        },
        async findMany(args: unknown) {
          const messageId = (args as { where: { messageId: string } }).where.messageId;
          return [...rows.values()].filter((r) => r.messageId === messageId);
        },
      },
      message: {
        // QC-F-042 amend (gap 1): msg-1 was sent by OWNER; the caller in
        // these scenarios (READER_OFF) is its recipient in 'conv-1'.
        async findUnique() {
          return { conversationId: 'conv-1', senderId: OWNER.userId };
        },
      },
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          return id === READER_OFF.userId ? { preferences: readerPrefs } : null;
        },
        async findMany() {
          return [];
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversationMember: {
        async findMany() { return []; },
        // QC-F-042 amend (gap 1): READER_OFF is an active member of conv-1
        // (the scenario's presupposition); OWNER is the sender.
        async findFirst(args: unknown) {
          const w = (args as { where: { conversationId: string; userId: string; leftAt: null } }).where;
          return w.conversationId === 'conv-1' &&
            (w.userId === READER_OFF.userId || w.userId === OWNER.userId)
            ? { conversationId: w.conversationId, userId: w.userId, leftAt: null }
            : null;
        },
      },
      conversation: { async findMany() { return []; } },
    };
    return { prisma, rows };
  }

  it('reader with receipts off gets suppressed:true and no MessageDelivery row is written', async () => {
    const { prisma, rows } = receiptsPrisma(prefs({ showReadReceipts: false }));
    const app = await buildTestApp(
      async (a) => {
        await a.register(receiptsRoutes, { prefix: '/receipts' });
      },
      prisma,
      READER_OFF,
    );
    const res = await app.inject({ method: 'POST', url: '/receipts/msg-1/read' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { status: string; suppressed?: boolean } };
    expect(body.data.suppressed).toBe(true);
    expect(rows.size).toBe(0);
  });

  it('reader with default prefs records the read (control)', async () => {
    const { prisma, rows } = receiptsPrisma(null);
    const app = await buildTestApp(
      async (a) => {
        await a.register(receiptsRoutes, { prefix: '/receipts' });
      },
      prisma,
      READER_OFF,
    );
    const res = await app.inject({ method: 'POST', url: '/receipts/msg-1/read' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { status: string; suppressed?: boolean } };
    expect(body.data.suppressed).toBeUndefined();
    expect(rows.get(`msg-1::${READER_OFF.userId}`)?.readAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Settings PUT: the saved pref applies immediately via cache invalidation
// ---------------------------------------------------------------------------
describe('QC-F-042 settings: PUT invalidates the shared privacy cache', () => {
  it('a pref saved through PUT /settings is what resolve() returns right after', async () => {
    const row: { preferences: unknown } = { preferences: null };
    const prisma = {
      user: {
        async findUnique() {
          return { preferences: row.preferences };
        },
        async findMany() {
          return [];
        },
        async update(args: unknown) {
          row.preferences = (args as { data: { preferences: unknown } }).data.preferences;
          return {};
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversationMember: { async findMany() { return []; } },
      conversation: { async findMany() { return []; } },
    };
    // QC-F-371: the settings PUT writer runs through the atomic
    // preferences helper, which requires $transaction on the client.
    Object.assign(prisma, {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    });
    const app = await buildTestApp(
      async (a) => {
        await a.register(settingsRoutes, { prefix: '/settings' });
      },
      prisma,
      OWNER,
    );

    const privacy = getPrivacyService(prisma);
    const before = await privacy.resolve(OWNER.userId);
    expect(before.prefs.showOnlineStatus).toBe(true);

    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { privacy: { showOnlineStatus: false } },
    });
    expect(res.statusCode).toBe(200);

    // Same shared instance, no TTL wait: invalidation made the save live.
    const after = await privacy.resolve(OWNER.userId);
    expect(after.source).toBe('stored');
    expect(after.prefs.showOnlineStatus).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Presence list: GET /ws/presence filters showOnlineStatus=false users
//
// QC-F-524 expansion (declared meaning change, brief §8): the snapshot is
// now recipient-scoped — the handler requires an authenticated caller,
// honours the `userIds` parameter, and only returns users the caller is
// related to. This case therefore installs an auth preHandler (caller =
// CLOSE_FRIEND), requests both users explicitly via ?userIds=, and makes
// BOTH of them the caller's DIRECT co-members, so the question this case
// has always asked is preserved exactly under the new rules: of two
// related, requested, online users, the one with showOnlineStatus=false
// is hidden and the default one remains. No assertion was deleted and
// the expected result is unchanged.
// ---------------------------------------------------------------------------
describe('QC-F-042 presence: /ws/presence snapshot hides opted-out users', () => {
  it('filters the hidden user out of the online list; the default user remains', async () => {
    const userPrefs = new Map<string, unknown>([
      [OWNER.userId, prefs({ showOnlineStatus: false })],
      [STRANGER.userId, null],
    ]);
    // QC-F-524: caller (CLOSE_FRIEND) shares an active DIRECT conversation
    // with each of OWNER and STRANGER (WHERE-aware, direction-sensitive).
    const memberRows = [
      { conversationId: 'conv-f042-owner', userId: CLOSE_FRIEND.userId, leftAt: null },
      { conversationId: 'conv-f042-owner', userId: OWNER.userId, leftAt: null },
      { conversationId: 'conv-f042-stranger', userId: CLOSE_FRIEND.userId, leftAt: null },
      { conversationId: 'conv-f042-stranger', userId: STRANGER.userId, leftAt: null },
    ];
    const prisma = {
      user: {
        async findUnique(args: unknown) {
          const id = (args as { where: { id: string } }).where.id;
          if (!userPrefs.has(id)) return null;
          return { preferences: userPrefs.get(id) };
        },
        async findMany(args: unknown) {
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          return ids
            .filter((id) => userPrefs.has(id))
            .map((id) => ({ id, preferences: userPrefs.get(id) }));
        },
      },
      closeFriend: { async findMany() { return []; } },
      conversationMember: {
        async findMany(args: unknown) {
          const where = (args as { where?: Record<string, unknown> }).where ?? {};
          const convCond = where['conversationId'] as
            | string
            | { in?: string[] }
            | undefined;
          return memberRows.filter((row) => {
            if (where['userId'] !== undefined && row.userId !== where['userId']) {
              return false;
            }
            if (typeof convCond === 'string' && row.conversationId !== convCond) {
              return false;
            }
            if (
              convCond &&
              typeof convCond === 'object' &&
              Array.isArray(convCond.in) &&
              !convCond.in.includes(row.conversationId)
            ) {
              return false;
            }
            if (where['leftAt'] === null && row.leftAt !== null) return false;
            return true;
          });
        },
      },
      conversation: { async findMany() { return []; } },
    };
    const backplane = {
      instanceId: 'inst-test',
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
      publish: async () => undefined,
      onMessage: () => undefined,
      nextSequence: async () => 1,
      isHealthy: () => true,
    };
    const presence = {
      getOnlineInApp: () => [OWNER.userId, STRANGER.userId],
      setOnline: () => false,
      setOffline: () => false,
      heartbeat: () => undefined,
    };
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma as never);
    app.decorate('realtimeBackplane', backplane as never);
    app.decorate('presence', presence as never);
    // QC-F-524: the snapshot now requires an authenticated caller (the
    // QC-F-017 preHandler pattern, standing in for the real auth plugin).
    app.addHook('preHandler', async (request) => {
      (request as { auth?: { userId: string } }).auth = { userId: CLOSE_FRIEND.userId };
    });
    await app.register(websocketRoutes, { prefix: '/ws' });
    await app.ready();
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: `/ws/presence?userIds=${OWNER.userId},${STRANGER.userId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { online: string[] };
    expect(body.online).toEqual([STRANGER.userId]);
  });
});
