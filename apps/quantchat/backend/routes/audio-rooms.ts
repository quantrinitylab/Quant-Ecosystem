import type { FastifyPluginAsync } from 'fastify';
import { createAppError } from '@quant/server-core';
import { AudioRoomService, AudioRoomRole } from '../services/audio-room.service';

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
  fastify.get('/', async (request, reply) => {
    const query = request.query as { topic?: string; tag?: string };
    const rooms = AudioRoomService.listActiveRooms(query);
    return reply.send({ success: true, data: rooms });
  });

  // GET /audio-rooms/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = AudioRoomService.getAudioRoom(id);
    if (!room) {
      return reply.status(404).send({ success: false, error: 'Audio room not found' });
    }
    return reply.send({ success: true, data: room });
  });

  // POST /audio-rooms/:id/join
  fastify.post('/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { role?: AudioRoomRole } | undefined;

    const { userId, username } = requireAuthContext(request);
    const userInfo = { userId, username, displayName: username };

    try {
      const result = AudioRoomService.joinAudioRoom(id, userInfo, body?.role);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(404).send({ success: false, error: err.message });
    }
  });

  // POST /audio-rooms/:id/leave
  fastify.post('/:id/leave', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = requireAuthContext(request);

    const result = AudioRoomService.leaveAudioRoom(id, userId);
    return reply.send({ success: true, data: result });
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
