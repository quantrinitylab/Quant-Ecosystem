import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { RoomService, CreateRoomSchema, JoinParticipantSchema } from '../services/room.service';

const roomIdParamSchema = z.object({
  id: z.string().min(1),
});

const leaveBodySchema = z.object({
  participantId: z.string().min(1),
});

export default async function roomsRoutes(fastify: FastifyInstance) {
  const roomService = new RoomService();

  fastify.post('/', async (request, reply) => {
    const parseResult = CreateRoomSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid room data', 400, 'VALIDATION_ERROR');
    }

    const room = roomService.createRoom(parseResult.data);
    return reply.status(201).send({ success: true, data: room });
  });

  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    const bodyResult = JoinParticipantSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw createAppError('Invalid participant data', 400, 'VALIDATION_ERROR');
    }

    const room = roomService.joinRoom(paramResult.data.id, bodyResult.data);
    return reply.send({ success: true, data: room });
  });

  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    const bodyResult = leaveBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw createAppError('Invalid leave data', 400, 'VALIDATION_ERROR');
    }

    const room = roomService.leaveRoom(paramResult.data.id, bodyResult.data.participantId);
    return reply.send({ success: true, data: room });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    const room = roomService.getRoom(paramResult.data.id);
    return reply.send({ success: true, data: room });
  });

  fastify.get<{ Params: { id: string } }>('/:id/participants', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    const participants = roomService.listParticipants(paramResult.data.id);
    return reply.send({ success: true, data: participants });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    roomService.closeRoom(paramResult.data.id);
    return reply.send({ success: true, data: null });
  });
}
