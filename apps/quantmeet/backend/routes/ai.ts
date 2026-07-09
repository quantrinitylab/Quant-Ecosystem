import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { AIEngineAdapter } from '../services/ai-engine-adapter';
import { SummaryService } from '../services/summary.service';
import { ActionItemsService } from '../services/action-items.service';
import { RoomService } from '../services/room.service';
import { createMemoryService, createInMemoryMemoryDb, UserCommitmentMemory } from '@quant/ai';
import type { TranscriptSegment } from '../services/transcript.service';

interface TranscriptInput {
  participantId: string;
  text: string;
  roomId?: string;
}

export default async function aiRoutes(fastify: FastifyInstance) {
  const adapter = new AIEngineAdapter();
  // SummaryService and ActionItemsService are now Prisma-backed (durable AI
  // summaries + action items). Build them with the shared `fastify.prisma`
  // decorator exactly as the other Prisma-backed routes across the ecosystem
  // do, passing prisma FIRST then the existing AI collaborator.
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const summaryService = new SummaryService(prisma as never, adapter);

  // Commitment bridge (#31): assigned action items also land in the shared
  // commitments channel so they surface in QuantMail follow-ups. Composition
  // rule (#27): real Prisma persistence with DATABASE_URL, else in-memory.
  const memoryDb = process.env['DATABASE_URL'] ? prisma : createInMemoryMemoryDb();
  const commitmentChannel = new UserCommitmentMemory(
    createMemoryService({ prisma: memoryDb as never }),
  );
  const actionItemsService = new ActionItemsService(prisma as never, adapter, {
    channel: commitmentChannel,
    rooms: new RoomService(prisma as never),
  });

  fastify.post('/summary', async (request, reply) => {
    const body = request.body as { transcript?: TranscriptInput[] };

    if (!body.transcript || !Array.isArray(body.transcript) || body.transcript.length === 0) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const summary = await summaryService.generateSummary(body.transcript as TranscriptSegment[]);
    return reply.send({ success: true, data: summary });
  });

  fastify.post('/action-items', async (request, reply) => {
    const body = request.body as { transcript?: TranscriptInput[] };

    if (!body.transcript || !Array.isArray(body.transcript) || body.transcript.length === 0) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const items = await actionItemsService.extractActionItems(
      body.transcript as TranscriptSegment[],
    );
    return reply.send({ success: true, data: items });
  });
}
