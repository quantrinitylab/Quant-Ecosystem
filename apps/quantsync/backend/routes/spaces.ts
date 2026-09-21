import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SpaceService } from '../services/space.service';

// ============================================================================
// QuantWave audio Spaces routes (mounted at /spaces).
//
//   GET    /spaces                      -> live + scheduled Spaces
//   POST   /spaces                      -> create a Space (caller becomes HOST)
//   GET    /spaces/live                 -> live Spaces only
//   GET    /spaces/:id                  -> full state, projected for the caller
//   POST   /spaces/:id/join             -> join as listener (idempotent)
//   POST   /spaces/:id/leave            -> leave; host leaving ends the Space
//   POST   /spaces/:id/mic              -> toggle your own mic
//   POST   /spaces/:id/raise-hand       -> raise hand
//   DELETE /spaces/:id/raise-hand       -> lower hand
//   POST   /spaces/:id/invite-speaker   -> host: promote listener
//   POST   /spaces/:id/remove-speaker   -> host: demote speaker
//   POST   /spaces/:id/mute-speaker     -> host: force-mute
//   POST   /spaces/:id/end              -> host: end the Space
//   POST   /spaces/:id/recording/start  -> host: start recording
//   POST   /spaces/:id/recording/stop   -> host: stop recording
//
// This module is new: every `/spaces/*` proxy under `src/app/api` forwarded here but no
// backend route existed, so the Spaces UI was dead. `raise-hand` is the canonical path
// (matching the pre-existing proxy); `src/hooks/useSpaces.ts` previously called `/hand`.
// ============================================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

const createSpaceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  topics: z.array(z.string().min(1).max(50)).max(10).optional(),
  scheduledAt: z.coerce.date().optional(),
});

const micSchema = z.object({ muted: z.boolean().optional() }).optional();
const targetSchema = z.object({ userId: z.string().min(1) });

/** Read the authenticated user id or throw 401. */
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function spacesRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const spaces = new SpaceService(prisma);

  // --- discovery ----------------------------------------------------------

  fastify.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await spaces.listSpaces(parsed.data);
    return reply.send({ success: true, ...data });
  });

  fastify.get('/live', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await spaces.listLiveSpaces(parsed.data);
    return reply.send({ success: true, ...data });
  });

  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createSpaceSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const space = await spaces.createSpace(userId, parsed.data);
    return reply.status(201).send({ success: true, data: space });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await spaces.getSpaceState(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // --- membership ---------------------------------------------------------

  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await spaces.joinSpace(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await spaces.leaveSpace(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // --- audio + hand queue -------------------------------------------------

  fastify.post<{ Params: { id: string } }>('/:id/mic', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = micSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await spaces.toggleMic(request.params.id, userId, parsed.data?.muted);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/raise-hand', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await spaces.raiseHand(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  fastify.delete<{ Params: { id: string } }>('/:id/raise-hand', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await spaces.lowerHand(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // --- host moderation ----------------------------------------------------

  fastify.post<{ Params: { id: string } }>('/:id/invite-speaker', async (request, reply) => {
    const hostId = requireUserId(request);
    const parsed = targetSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await spaces.inviteSpeaker(request.params.id, hostId, parsed.data.userId);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/remove-speaker', async (request, reply) => {
    const hostId = requireUserId(request);
    const parsed = targetSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await spaces.removeSpeaker(request.params.id, hostId, parsed.data.userId);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/mute-speaker', async (request, reply) => {
    const hostId = requireUserId(request);
    const parsed = targetSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await spaces.muteSpeaker(request.params.id, hostId, parsed.data.userId);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/end', async (request, reply) => {
    const hostId = requireUserId(request);
    const data = await spaces.endSpace(request.params.id, hostId);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/recording/start', async (request, reply) => {
    const hostId = requireUserId(request);
    const data = await spaces.setRecording(request.params.id, hostId, true);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/recording/stop', async (request, reply) => {
    const hostId = requireUserId(request);
    const data = await spaces.setRecording(request.params.id, hostId, false);
    return reply.send({ success: true, data });
  });
}
