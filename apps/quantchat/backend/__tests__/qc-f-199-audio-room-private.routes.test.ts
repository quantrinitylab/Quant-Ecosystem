// ===========================================================================
// QC-F-199 — audio-room isPrivate gate (private rooms were unenforced)
// ===========================================================================
//
// Finding: `isPrivate` was stored on the room but NEVER read — any logged-in
// (and, on GETs, even logged-out) caller could list / read / join / probe
// any "private" room. There was no invite or admission model at all.
// Root-cause fix (this slice):
//   - service: invite-or-membership admission — JOIN iff host OR participant
//     OR invited; READ (list/detail) iff host OR participant (an invite is a
//     join ticket only); leave-probe returns { room: null };
//     `invitedUserIds` visible to the host only (stripForViewer);
//   - routes: in-route requireAuthContext on GET / and GET /:id (fail-closed
//     under bare-mount compositions), new host-only POST /:id/invite +
//     DELETE /:id/invite/:targetUserId.
// The raw `getAudioRoom` getter stays for internal/test use (F-018/F-107
// suites call it directly); the public surface goes through the viewer-aware
// `getRoomForViewer` / `listActiveRooms(filter, viewerId)`.
// Negative control: the 5 gate assertions below FAIL on the pre-fix service
// (~/workspace/.f199-negctrl/negctrl.ts, unfixed byte-copy @ a19fe7ea9:
// NC-1..NC-5 FAIL, LP-1..LP-3 PASS); the legit-pin cases PASS on both.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import audioRoomsRoutes from '../routes/audio-rooms';
import { AudioRoomService } from '../services/audio-room.service';

const H = { userId: 'user_host', username: 'host' }; // room host
const I = { userId: 'user_invited', username: 'invited' }; // invited, not joined
const P = { userId: 'user_participant', username: 'participant' }; // participant
const X = { userId: 'user_stranger_x', username: 'strangerx' }; // stranger
const Y = { userId: 'user_stranger_y', username: 'strangery' }; // stranger

async function appFor(
  auth: { userId: string; username: string } | null,
  prefix = '/audio-rooms',
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch (F-018/F-107 harness).
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
  await app.register(audioRoomsRoutes, { prefix });
  await app.ready();
  return app;
}

async function createRoom(
  app: FastifyInstance,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/audio-rooms', payload });
  expect(res.statusCode).toBe(201);
  return res.json().data.id as string;
}

describe('QC-F-199 audio-room private gate', () => {
  let apps: FastifyInstance[] = [];

  beforeEach(() => {
    AudioRoomService.clearAllRoomsForTesting();
    apps = [];
  });

  afterEach(async () => {
    for (const app of apps) await app.close();
    apps = [];
  });

  it('case 1: host sees the private room fully (list shows invitedUserIds; detail 200; re-join keeps host role)', async () => {
    const h = await appFor(H);
    apps.push(h);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });

    const list = await h.inject({ method: 'GET', url: '/audio-rooms' });
    const privRow = list.json().data.find((r: any) => r.id === priv);
    expect(privRow).toBeDefined();
    expect(privRow.invitedUserIds).toEqual([]);

    const detail = await h.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.invitedUserIds).toEqual([]);

    const rejoin = await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });
    expect(rejoin.statusCode).toBe(200);
    expect(rejoin.json().data.participant.role).toBe('host');
    expect(rejoin.json().data.room.invitedUserIds).toEqual([]);
  });

  it('case 2: stranger list never shows the private room (plain, topic and tag filters)', async () => {
    const h = await appFor(H);
    const x = await appFor(X);
    apps.push(h, x);
    const priv = await createRoom(h, { title: 'Secret Room', topic: 'SecTopic', tags: ['secrettag'], isPrivate: true });
    const pub = await createRoom(h, { title: 'Open Room', topic: 'SecTopic', tags: ['secrettag'] });

    for (const url of ['/audio-rooms', '/audio-rooms?topic=sectopic', '/audio-rooms?tag=secrettag']) {
      const res = await x.inject({ method: 'GET', url });
      const rows = res.json().data as any[];
      expect(rows.some((r) => r.id === priv)).toBe(false);
      expect(rows.some((r) => r.id === pub)).toBe(true);
      // No title/topic/tags/roster placeholder of the private room leaks.
      expect(JSON.stringify(rows)).not.toContain('Secret Room');
    }
  });

  it('case 3: stranger detail 404 is byte-identical to unknown-id 404 (no existence oracle)', async () => {
    const h = await appFor(H);
    const x = await appFor(X);
    apps.push(h, x);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });

    const strangerRes = await x.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    const unknownRes = await x.inject({ method: 'GET', url: '/audio-rooms/room_nope_000' });
    expect(strangerRes.statusCode).toBe(404);
    expect(strangerRes.body).toBe(unknownRes.body);
    expect(strangerRes.json()).toEqual({ success: false, error: 'Audio room not found' });
  });

  it('case 4: stranger join is denied and creates no participant', async () => {
    const h = await appFor(H);
    const x = await appFor(X);
    apps.push(h, x);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });

    const join = await x.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });
    expect(join.statusCode).toBe(404);
    expect(join.json().error).toBe('Audio room not found or inactive');

    const detail = await h.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(detail.json().data.participants.map((p: any) => p.userId)).not.toContain(X.userId);
  });

  it('case 5: stranger leave-probe returns { room: null } — no roster leak', async () => {
    const h = await appFor(H);
    const x = await appFor(X);
    apps.push(h, x);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });

    const leave = await x.inject({ method: 'POST', url: `/audio-rooms/${priv}/leave`, payload: {} });
    expect(leave.statusCode).toBe(200);
    expect(leave.json().data.room).toBeNull();
  });

  it('case 6: invite is host-only (stranger/participant/invited -> 403; host invites -> 200; logged-out -> 401; unknown room -> 404)', async () => {
    const h = await appFor(H);
    const x = await appFor(X);
    const p = await appFor(P);
    const i = await appFor(I);
    const anon = await appFor(null);
    apps.push(h, x, p, i, anon);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: I.userId } });
    // P joins only after an invite (private): an uninvited join fails.
    const pJoin = await p.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });
    expect(pJoin.statusCode).toBe(404);

    for (const app of [x, i]) {
      const res = await app.inject({
        method: 'POST',
        url: `/audio-rooms/${priv}/invite`,
        payload: { targetUserId: Y.userId },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('only the host can invite');
    }

    const hostInvite = await h.inject({
      method: 'POST',
      url: `/audio-rooms/${priv}/invite`,
      payload: { targetUserId: Y.userId },
    });
    expect(hostInvite.statusCode).toBe(200);
    expect(hostInvite.json().data.invitedUserIds).toContain(Y.userId);

    const anonInvite = await anon.inject({
      method: 'POST',
      url: `/audio-rooms/${priv}/invite`,
      payload: { targetUserId: Y.userId },
    });
    expect(anonInvite.statusCode).toBe(401);

    const unknownInvite = await h.inject({
      method: 'POST',
      url: '/audio-rooms/room_nope_000/invite',
      payload: { targetUserId: Y.userId },
    });
    expect(unknownInvite.statusCode).toBe(404);

    // Invite is idempotent: duplicate invite adds no second entry.
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: Y.userId } });
    const dup = await h.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(dup.json().data.invitedUserIds.filter((id: string) => id === Y.userId)).toHaveLength(1);
  });

  it('case 7: invited-but-not-joined sees no private room; invitedUserIds absent from non-host responses', async () => {
    const h = await appFor(H);
    const i = await appFor(I);
    const x = await appFor(X);
    apps.push(h, i, x);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    const pub = await createRoom(h, { title: 'Open Room' });
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: I.userId } });

    const list = await i.inject({ method: 'GET', url: '/audio-rooms' });
    const rows = list.json().data as any[];
    expect(rows.some((r: any) => r.id === priv)).toBe(false);
    expect(rows.some((r: any) => r.id === pub)).toBe(true);
    for (const row of rows) {
      expect('invitedUserIds' in row).toBe(false);
    }

    const detail = await i.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(detail.statusCode).toBe(404);

    const xDetail = await x.inject({ method: 'GET', url: `/audio-rooms/${pub}` });
    expect('invitedUserIds' in xDetail.json().data).toBe(false);
  });

  it('case 8: invited user joins (200, listener); now sees list + detail with roster, no invite roster', async () => {
    const h = await appFor(H);
    const i = await appFor(I);
    apps.push(h, i);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: I.userId } });

    const join = await i.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });
    expect(join.statusCode).toBe(200);
    expect(join.json().data.participant.role).toBe('listener');
    expect('invitedUserIds' in join.json().data.room).toBe(false);

    const list = await i.inject({ method: 'GET', url: '/audio-rooms' });
    const row = (list.json().data as any[]).find((r) => r.id === priv);
    expect(row).toBeDefined();
    expect('invitedUserIds' in row).toBe(false);

    const detail = await i.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.participants.map((p: any) => p.userId)).toContain(I.userId);
    expect('invitedUserIds' in detail.json().data).toBe(false);
  });

  it('case 9: participant re-join keeps role; invite revoked after join does not eject, but after leave the room drops', async () => {
    const h = await appFor(H);
    const p = await appFor(P);
    apps.push(h, p);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: P.userId } });
    await p.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });

    const rejoin = await p.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });
    expect(rejoin.statusCode).toBe(200);
    expect(rejoin.json().data.participant.role).toBe('listener');

    // Host revokes P's invite after P joined: no eject (pinned limit) —
    // P still sees the room while a participant.
    const revoke = await h.inject({ method: 'DELETE', url: `/audio-rooms/${priv}/invite/${P.userId}` });
    expect(revoke.statusCode).toBe(200);
    const stillIn = await p.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(stillIn.statusCode).toBe(200);

    // P leaves with no invite left -> admission basis gone.
    const leave = await p.inject({ method: 'POST', url: `/audio-rooms/${priv}/leave`, payload: {} });
    expect(leave.statusCode).toBe(200);

    const detail = await p.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(detail.statusCode).toBe(404);
    const list = await p.inject({ method: 'GET', url: '/audio-rooms' });
    expect((list.json().data as any[]).some((r) => r.id === priv)).toBe(false);
  });

  it('case 10: revoked invite is indistinguishable from never-invited (join 404)', async () => {
    const h = await appFor(H);
    const y = await appFor(Y);
    apps.push(h, y);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: Y.userId } });

    const revoke = await h.inject({ method: 'DELETE', url: `/audio-rooms/${priv}/invite/${Y.userId}` });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().data.invitedUserIds).not.toContain(Y.userId);

    const join = await y.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });
    expect(join.statusCode).toBe(404);

    // Non-host revoke -> 403; logged-out revoke -> 401.
    const xApp = await appFor(X);
    apps.push(xApp);
    const xRevoke = await xApp.inject({ method: 'DELETE', url: `/audio-rooms/${priv}/invite/${H.userId}` });
    expect(xRevoke.statusCode).toBe(403);

    const anonApp = await appFor(null);
    apps.push(anonApp);
    const anonRevoke = await anonApp.inject({ method: 'DELETE', url: `/audio-rooms/${priv}/invite/${H.userId}` });
    expect(anonRevoke.statusCode).toBe(401);
  });

  it('case 11: host succession transfers invite rights; the departed old host loses them', async () => {
    const h = await appFor(H);
    const p = await appFor(P);
    apps.push(h, p);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/invite`, payload: { targetUserId: P.userId } });
    await p.inject({ method: 'POST', url: `/audio-rooms/${priv}/join`, payload: {} });

    // H (host) leaves -> P inherits host.
    const hLeave = await h.inject({ method: 'POST', url: `/audio-rooms/${priv}/leave`, payload: {} });
    expect(hLeave.json().data.hostTransferred).toBe(true);
    expect(hLeave.json().data.room.hostId).toBe(P.userId);

    // New host P can invite.
    const pInvite = await p.inject({
      method: 'POST',
      url: `/audio-rooms/${priv}/invite`,
      payload: { targetUserId: X.userId },
    });
    expect(pInvite.statusCode).toBe(200);

    // Old host H (now outside) cannot invite (403) and cannot read detail (404).
    const hInvite = await h.inject({
      method: 'POST',
      url: `/audio-rooms/${priv}/invite`,
      payload: { targetUserId: Y.userId },
    });
    expect(hInvite.statusCode).toBe(403);
    const hDetail = await h.inject({ method: 'GET', url: `/audio-rooms/${priv}` });
    expect(hDetail.statusCode).toBe(404);
  });

  it('case 12: raise-hand / promote / mute behave unchanged; strangers stay blocked', async () => {
    const h = await appFor(H);
    const p = await appFor(P);
    const x = await appFor(X);
    apps.push(h, p, x);
    const room = await createRoom(h, { title: 'Open Room' });
    await p.inject({ method: 'POST', url: `/audio-rooms/${room}/join`, payload: {} });

    const raise = await p.inject({ method: 'POST', url: `/audio-rooms/${room}/raise-hand`, payload: {} });
    expect(raise.statusCode).toBe(200);

    const promote = await h.inject({
      method: 'POST',
      url: `/audio-rooms/${room}/promote`,
      payload: { targetUserId: P.userId },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().data.role).toBe('speaker');

    const xRaise = await x.inject({ method: 'POST', url: `/audio-rooms/${room}/raise-hand`, payload: {} });
    expect(xRaise.statusCode).toBe(400); // not a participant — participant gate intact
    const xMute = await x.inject({
      method: 'POST',
      url: `/audio-rooms/${room}/mute`,
      payload: { targetUserId: P.userId },
    });
    expect(xMute.statusCode).toBe(403); // not host/co-host
  });

  it('case 13: public rooms are unchanged for strangers (list / detail / join)', async () => {
    const h = await appFor(H);
    const x = await appFor(X);
    apps.push(h, x);
    const pub = await createRoom(h, { title: 'Open Room' });

    const list = await x.inject({ method: 'GET', url: '/audio-rooms' });
    expect((list.json().data as any[]).some((r) => r.id === pub)).toBe(true);

    const detail = await x.inject({ method: 'GET', url: `/audio-rooms/${pub}` });
    expect(detail.statusCode).toBe(200);

    const join = await x.inject({ method: 'POST', url: `/audio-rooms/${pub}/join`, payload: {} });
    expect(join.statusCode).toBe(200);
    expect(join.json().data.participant.userId).toBe(X.userId);
  });

  it('case 14: logged-out gets 401 on list / detail / join / invite (route-level, bare harness)', async () => {
    const h = await appFor(H);
    const anon = await appFor(null);
    apps.push(h, anon);
    const priv = await createRoom(h, { title: 'Secret Room', isPrivate: true });
    const pub = await createRoom(h, { title: 'Open Room' });

    expect((await anon.inject({ method: 'GET', url: '/audio-rooms' })).statusCode).toBe(401);
    expect((await anon.inject({ method: 'GET', url: `/audio-rooms/${pub}` })).statusCode).toBe(401);
    expect((await anon.inject({ method: 'GET', url: `/audio-rooms/${priv}` })).statusCode).toBe(401);
    expect(
      (await anon.inject({ method: 'POST', url: `/audio-rooms/${pub}/join`, payload: {} })).statusCode,
    ).toBe(401);
    expect(
      (
        await anon.inject({
          method: 'POST',
          url: `/audio-rooms/${pub}/invite`,
          payload: { targetUserId: X.userId },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('case 15: both prefixes enforce the same gates (/api/audio-rooms)', async () => {
    const h = await appFor(H, '/api/audio-rooms');
    const x = await appFor(X, '/api/audio-rooms');
    apps.push(h, x);
    const created = await h.inject({
      method: 'POST',
      url: '/api/audio-rooms',
      payload: { title: 'Secret Room', isPrivate: true },
    });
    expect(created.statusCode).toBe(201);
    const priv = created.json().data.id as string;

    const list = await x.inject({ method: 'GET', url: '/api/audio-rooms' });
    expect((list.json().data as any[]).some((r: any) => r.id === priv)).toBe(false);

    const detail = await x.inject({ method: 'GET', url: `/api/audio-rooms/${priv}` });
    expect(detail.statusCode).toBe(404);

    const join = await x.inject({ method: 'POST', url: `/api/audio-rooms/${priv}/join`, payload: {} });
    expect(join.statusCode).toBe(404);
  });

  it('case 16: listActiveRooms() with no viewerId fails closed (public rooms only)', () => {
    AudioRoomService.createAudioRoom(H.userId, { username: 'host', displayName: 'Host' }, {
      title: 'Secret Room',
      isPrivate: true,
    });
    const pub = AudioRoomService.createAudioRoom(H.userId, { username: 'host', displayName: 'Host' }, {
      title: 'Open Room',
    });
    // F-018 :290 pattern — called with no args on a public room.
    const rows = AudioRoomService.listActiveRooms();
    expect(rows.some((r) => r.id === pub.id)).toBe(true);
    expect(rows.every((r) => !(r as any).isPrivate)).toBe(true);
  });
});
