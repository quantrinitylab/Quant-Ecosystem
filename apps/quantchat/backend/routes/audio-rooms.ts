import type { FastifyPluginAsync } from 'fastify';
import { createAppError } from '@quant/server-core';
import { AudioRoomService } from '../services/audio-room.service';

// QC-F-018 — identity forgery fix.
// Actor identity comes ONLY from the authenticated request context
// (`request.auth`, populated by the server-core auth plugin from the verified
// JWT). Identity fields in the request body (`hostId`, `user.userId`,
// `userId`, `actorId`, profile objects) are NEVER trusted: previously the
// body won over `(request as any).user?.id` — a field no auth code ever sets —
// so any caller could create/join/leave rooms, raise hands, promote or mute
// as any other user, and unauthenticated-in-route calls fell back to
// fabricated identities ('user_host_1', `user_${Date.now()}`, 'guest_user').
// Missing auth now fails closed with 401, matching games/memories routes.
interface AuthedRequest {
  auth?: { userId?: string; username?: string };
  user?: { id?: string; username?: string };
}

function requireAuthContext(request: unknown): { userId: string; username: string } {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  const username = r.auth?.username ?? r.user?.username ?? userId;
  return { userId, username };
}

const audioRoomsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /audio-rooms
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      title: string;
      topic?: string;
      tags?: string[];
      isPrivate?: boolean;
      maxSpeakers?: number;
    };

    const { userId: hostId, username } = requireAuthContext(request);
    const room = AudioRoomService.createAudioRoom(
      hostId,
      { username, displayName: username },
      {
        title: body.title,
        topic: body.topic,
        tags: body.tags,
        isPrivate: body.isPrivate,
        maxSpeakers: body.maxSpeakers,
      },
    );

    return reply.status(201).send({ success: true, data: room });
  });

  // GET /audio-rooms
  // QC-F-199 (C5): GETs now carry in-route auth — the route-level gate is
  // the only fail-closed layer under bare-mount compositions (production
  // buildApp's global hook does not cover these either way). The caller id
  // doubles as the viewerId for the private-room admission filter.
  fastify.get('/', async (request, reply) => {
    const { userId } = requireAuthContext(request);
    const query = request.query as { topic?: string; tag?: string };
    const rooms = AudioRoomService.listActiveRooms(query, userId);
    return reply.send({ success: true, data: rooms });
  });

  // GET /audio-rooms/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = requireAuthContext(request);
    const room = AudioRoomService.getRoomForViewer(id, userId);
    if (!room) {
      return reply.status(404).send({ success: false, error: 'Audio room not found' });
    }
    return reply.send({ success: true, data: room });
  });

  // POST /audio-rooms/:id/join
  // QC-F-107: a `role` in the request body is NEVER honoured — new
  // participants always join as 'listener' (the service no longer even
  // accepts a role). A body-supplied role is silently ignored, not
  // rejected, so older clients do not break; role changes happen only
  // through the host/co-host-authorised /promote path.
  fastify.post('/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { userId, username } = requireAuthContext(request);
    const userInfo = { userId, username, displayName: username };

    try {
      const result = AudioRoomService.joinAudioRoom(id, userInfo);
      // QC-F-199: non-host joiners get the room WITHOUT the invite roster.
      return reply.send({
        success: true,
        data: {
          room: AudioRoomService.stripForViewer(result.room, userId),
          participant: result.participant,
        },
      });
    } catch (err: any) {
      return reply.status(404).send({ success: false, error: err.message });
    }
  });

  // POST /audio-rooms/:id/leave
  fastify.post('/:id/leave', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = requireAuthContext(request);

    const result = AudioRoomService.leaveAudioRoom(id, userId);
    // QC-F-199 (C6): a non-participant probe gets { room: null } — no leak.
    // Leavers see the room without the invite roster.
    return reply.send({
      success: true,
      data: {
        room: result.room ? AudioRoomService.stripForViewer(result.room, userId) : null,
        hostTransferred: result.hostTransferred,
      },
    });
  });

  // POST /audio-rooms/:id/invite
  // QC-F-199 — host-only invite (private rooms). 403/404 via err.statusCode;
  // empty targetUserId is a 400 (no statusCode attached by the service).
  fastify.post('/:id/invite', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { targetUserId?: string } | undefined;
    const { userId: actorId } = requireAuthContext(request);

    try {
      const room = AudioRoomService.inviteToRoom(id, actorId, body?.targetUserId ?? '');
      return reply.send({ success: true, data: room });
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      return reply.status(statusCode).send({ success: false, error: err.message });
    }
  });

  // DELETE /audio-rooms/:id/invite/:targetUserId
  // QC-F-199 — host-only revoke. Stops not-yet-joined users; does NOT eject
  // joined participants (pinned limit).
  fastify.delete('/:id/invite/:targetUserId', async (request, reply) => {
    const { id, targetUserId } = request.params as { id: string; targetUserId: string };
    const { userId: actorId } = requireAuthContext(request);

    try {
      const room = AudioRoomService.revokeInvite(id, actorId, targetUserId);
      return reply.send({ success: true, data: room });
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      return reply.status(statusCode).send({ success: false, error: err.message });
    }
  });

  // POST /audio-rooms/:id/raise-hand
  fastify.post('/:id/raise-hand', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { action?: 'raise' | 'lower' } | undefined;
    const { userId } = requireAuthContext(request);

    try {
      const participant =
        body?.action === 'lower'
          ? AudioRoomService.lowerHand(id, userId)
          : AudioRoomService.raiseHand(id, userId);
      return reply.send({ success: true, data: participant });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // POST /audio-rooms/:id/promote
  fastify.post('/:id/promote', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { targetUserId: string };
    const { userId: actorId } = requireAuthContext(request);

    try {
      const participant = AudioRoomService.promoteToSpeaker(id, actorId, body.targetUserId);
      return reply.send({ success: true, data: participant });
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      return reply.status(statusCode).send({ success: false, error: err.message });
    }
  });

  // POST /audio-rooms/:id/mute
  fastify.post('/:id/mute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { targetUserId: string };
    const { userId: actorId } = requireAuthContext(request);

    try {
      const participant = AudioRoomService.muteSpeaker(id, actorId, body.targetUserId);
      return reply.send({ success: true, data: participant });
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      return reply.status(statusCode).send({ success: false, error: err.message });
    }
  });
};

export default audioRoomsRoutes;
