import type { FastifyPluginAsync } from 'fastify';
import { AudioRoomService, AudioRoomRole } from '../services/audio-room.service';

const audioRoomsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /audio-rooms
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      hostId?: string;
      hostProfile?: { username: string; displayName: string; avatarUrl?: string };
      title: string;
      topic?: string;
      tags?: string[];
      isPrivate?: boolean;
      maxSpeakers?: number;
    };

    const hostId = body.hostId || (request as any).user?.id || 'user_host_1';
    const hostProfile = body.hostProfile || {
      username: (request as any).user?.username || 'host_user',
      displayName: (request as any).user?.displayName || 'Room Host',
    };

    const room = AudioRoomService.createAudioRoom(hostId, hostProfile, {
      title: body.title,
      topic: body.topic,
      tags: body.tags,
      isPrivate: body.isPrivate,
      maxSpeakers: body.maxSpeakers,
    });

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
    const body = request.body as {
      user?: { userId: string; username: string; displayName: string; avatarUrl?: string };
      role?: AudioRoomRole;
    };

    const userInfo = body.user || {
      userId: (request as any).user?.id || `user_${Date.now()}`,
      username: (request as any).user?.username || 'guest_user',
      displayName: (request as any).user?.displayName || 'Guest User',
    };

    try {
      const result = AudioRoomService.joinAudioRoom(id, userInfo, body.role);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(404).send({ success: false, error: err.message });
    }
  });

  // POST /audio-rooms/:id/leave
  fastify.post('/:id/leave', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { userId?: string };
    const userId = body.userId || (request as any).user?.id;

    if (!userId) {
      return reply.status(400).send({ success: false, error: 'userId is required' });
    }

    const result = AudioRoomService.leaveAudioRoom(id, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /audio-rooms/:id/raise-hand
  fastify.post('/:id/raise-hand', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { userId?: string; action?: 'raise' | 'lower' };
    const userId = body.userId || (request as any).user?.id;

    if (!userId) {
      return reply.status(400).send({ success: false, error: 'userId is required' });
    }

    try {
      const participant =
        body.action === 'lower'
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
    const body = request.body as { actorId?: string; targetUserId: string };
    const actorId = body.actorId || (request as any).user?.id;

    if (!actorId) {
      return reply.status(400).send({ success: false, error: 'actorId is required' });
    }

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
    const body = request.body as { actorId?: string; targetUserId: string };
    const actorId = body.actorId || (request as any).user?.id;

    if (!actorId) {
      return reply.status(400).send({ success: false, error: 'actorId is required' });
    }

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
