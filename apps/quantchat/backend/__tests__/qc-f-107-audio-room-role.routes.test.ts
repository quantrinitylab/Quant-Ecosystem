// ===========================================================================
// QC-F-107 — audio-room join role self-assignment regression tests
// ===========================================================================
//
// QC-F-018 closed body-supplied IDENTITY on these routes, but the join
// handler still forwarded a body-supplied ROLE: POST /audio-rooms/:id/join
// with { role: 'co_host' } (or 'host', or any arbitrary string) was stored
// verbatim on the new participant row. The promote/mute/demote gates and
// host succession all trust that stored role, so any logged-in user could
// join someone else's room as co_host/host, mute the real host, promote
// anyone, and stand first in line to inherit the room on host leave.
//
// Root-cause fix: AudioRoomService.joinAudioRoom no longer accepts a role
// at all — every NEW participant joins as 'listener' (muted). The route
// ignores any body role (strip-not-reject, so old clients keep working).
// Role changes happen only via the host/co-host-authorised promote path
// or host succession. Re-joining keeps an existing participant's role.
//
// These tests mount the REAL route plugin on a bare Fastify instance with
// `request.auth` installed exactly the way the server-core auth plugin
// does (same harness as qc-f-018). The service is the real in-memory one.
//
// Negative control: the hostile-role tests FAIL against the pre-fix
// route+service and pass with the fix; the control tests (plain join,
// host promote/mute, re-join role retention, 401) pass on both.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import audioRoomsRoutes from '../routes/audio-rooms';
import { AudioRoomService } from '../services/audio-room.service';

const ALICE = { userId: 'user_alice', username: 'alice' }; // room host
const BOB = { userId: 'user_bob', username: 'bob' }; // attacker / joiner
const CAROL = { userId: 'user_carol', username: 'carol' }; // second joiner

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch: an error
  // carrying a numeric statusCode is rendered with that status.
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
  await app.register(audioRoomsRoutes, { prefix: '/audio-rooms' });
  await app.ready();
  return app;
}

describe('QC-F-107 audio-room join role', () => {
  let apps: FastifyInstance[] = [];

  beforeEach(() => {
    AudioRoomService.clearAllRoomsForTesting();
    apps = [];
  });

  afterEach(async () => {
    for (const app of apps) await app.close();
    apps = [];
  });

  async function appFor(auth: typeof ALICE | null) {
    const app = await buildRouteApp(auth);
    apps.push(app);
    return app;
  }

  /** Alice creates a room; returns its id. */
  async function createRoomAsAlice(): Promise<string> {
    const alice = await appFor(ALICE);
    const created = await alice.inject({
      method: 'POST',
      url: '/audio-rooms',
      payload: { title: 'Role Target' },
    });
    expect(created.statusCode).toBe(201);
    return created.json().data.id as string;
  }

  async function joinAs(
    auth: typeof ALICE,
    roomId: string,
    payload: Record<string, unknown>,
  ) {
    const app = await appFor(auth);
    return app.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/join`,
      payload,
    });
  }

  it("join with role 'co_host' lands as listener (muted), not co_host", async () => {
    const roomId = await createRoomAsAlice();
    const res = await joinAs(BOB, roomId, { role: 'co_host' });
    expect(res.statusCode).toBe(200);
    const participant = res.json().data.participant;
    expect(participant.userId).toBe('user_bob');
    expect(participant.role).toBe('listener');
    expect(participant.isMuted).toBe(true);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants.find((p) => p.userId === 'user_bob')?.role).toBe('listener');
  });

  it("join with role 'host' does not create a second host; room.hostId unchanged", async () => {
    const roomId = await createRoomAsAlice();
    const res = await joinAs(BOB, roomId, { role: 'host' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.role).toBe('listener');
    expect(res.json().data.participant.isMuted).toBe(true);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.hostId).toBe('user_alice');
    expect(room?.participants.filter((p) => p.role === 'host')).toHaveLength(1);
    expect(room?.participants.find((p) => p.role === 'host')?.userId).toBe('user_alice');
  });

  it("join with role 'speaker' lands as listener — speaker only via host promote", async () => {
    const roomId = await createRoomAsAlice();
    const res = await joinAs(BOB, roomId, { role: 'speaker' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.role).toBe('listener');
    expect(res.json().data.participant.isMuted).toBe(true);
  });

  it('join with an arbitrary role string lands as listener', async () => {
    const roomId = await createRoomAsAlice();
    const res = await joinAs(BOB, roomId, { role: 'admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.role).toBe('listener');
  });

  it('join with no role in body lands as listener (control)', async () => {
    const roomId = await createRoomAsAlice();
    const res = await joinAs(BOB, roomId, {});
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.role).toBe('listener');
    expect(res.json().data.participant.isMuted).toBe(true);
  });

  it("self-declared 'co_host' cannot mute the real host (403)", async () => {
    const roomId = await createRoomAsAlice();
    await joinAs(BOB, roomId, { role: 'co_host' });

    const bob = await appFor(BOB);
    const res = await bob.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/mute`,
      payload: { targetUserId: 'user_alice' },
    });
    expect(res.statusCode).toBe(403);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants.find((p) => p.userId === 'user_alice')?.isMuted).toBe(false);
  });

  it("self-declared 'co_host' cannot promote themselves to speaker (403)", async () => {
    const roomId = await createRoomAsAlice();
    await joinAs(BOB, roomId, { role: 'co_host' });

    const bob = await appFor(BOB);
    const res = await bob.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/promote`,
      payload: { targetUserId: 'user_bob' },
    });
    expect(res.statusCode).toBe(403);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants.find((p) => p.userId === 'user_bob')?.role).toBe('listener');
  });

  it('host can still promote a joined listener and mute them (legit flow control)', async () => {
    const roomId = await createRoomAsAlice();
    await joinAs(BOB, roomId, { role: 'co_host' }); // claim ignored; bob is a listener

    const alice = await appFor(ALICE);
    const promoteRes = await alice.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/promote`,
      payload: { targetUserId: 'user_bob' },
    });
    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().data.role).toBe('speaker');
    expect(promoteRes.json().data.isMuted).toBe(false);

    const muteRes = await alice.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/mute`,
      payload: { targetUserId: 'user_bob' },
    });
    expect(muteRes.statusCode).toBe(200);
    expect(muteRes.json().data.isMuted).toBe(true);
  });

  it('host succession skips a self-declared co_host: promoted speaker inherits, not the claimant', async () => {
    const roomId = await createRoomAsAlice();
    await joinAs(BOB, roomId, { role: 'co_host' }); // attacker claims co_host
    await joinAs(CAROL, roomId, {}); // carol joins honestly

    const alice = await appFor(ALICE);
    const promoteRes = await alice.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/promote`,
      payload: { targetUserId: 'user_carol' },
    });
    expect(promoteRes.statusCode).toBe(200);

    const leaveRes = await alice.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/leave`,
      payload: {},
    });
    expect(leaveRes.statusCode).toBe(200);

    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.hostId).toBe('user_carol');
    expect(room?.participants.find((p) => p.userId === 'user_carol')?.role).toBe('host');
    expect(room?.participants.find((p) => p.userId === 'user_bob')?.role).toBe('listener');
  });

  it('creator re-joining keeps the host role (existing-participant branch untouched)', async () => {
    const roomId = await createRoomAsAlice();
    const res = await joinAs(ALICE, roomId, { role: 'listener' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.role).toBe('host');
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants).toHaveLength(1);
  });

  it('promoted speaker re-joining keeps the speaker role', async () => {
    const roomId = await createRoomAsAlice();
    await joinAs(BOB, roomId, {});
    const alice = await appFor(ALICE);
    await alice.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/promote`,
      payload: { targetUserId: 'user_bob' },
    });

    const res = await joinAs(BOB, roomId, {});
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.role).toBe('speaker');
    expect(res.json().data.participant.isMuted).toBe(false);
  });

  it("unauthenticated join claiming role 'host' is rejected 401 with no participant added", async () => {
    const roomId = await createRoomAsAlice();
    const anon = await appFor(null);
    const res = await anon.inject({
      method: 'POST',
      url: `/audio-rooms/${roomId}/join`,
      payload: { role: 'host' },
    });
    expect(res.statusCode).toBe(401);
    const room = AudioRoomService.getAudioRoom(roomId);
    expect(room?.participants).toHaveLength(1);
  });

  it('service-level: direct joinAudioRoom call always creates a listener', () => {
    const room = AudioRoomService.createAudioRoom(
      'user_alice',
      { username: 'alice', displayName: 'alice' },
      { title: 'Service Level' },
    );
    const { participant } = AudioRoomService.joinAudioRoom(room.id, {
      userId: 'user_bob',
      username: 'bob',
      displayName: 'bob',
    });
    expect(participant.role).toBe('listener');
    expect(participant.isMuted).toBe(true);
  });
});
