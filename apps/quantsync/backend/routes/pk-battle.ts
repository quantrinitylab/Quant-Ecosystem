// ============================================================================
// QuantWave Orange PK Battle Fastify Routes
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  createPkBattle,
  getBattle,
  contributePoints,
  endPkBattle,
  calculateTugOfWarRatio,
} from '../services/pk-battle.service';

const createBattleSchema = z.object({
  hostA: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  hostB: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  durationSeconds: z.number().int().positive().optional(),
});

const contributeSchema = z.object({
  contributor: z.object({
    userId: z.string().min(1),
    username: z.string().min(1),
  }),
  targetHostId: z.string().min(1),
  points: z.number().int().positive(),
});

export default async function pkBattleRoutes(fastify: FastifyInstance) {
  // Create PK Battle
  fastify.post('/', async (request, reply) => {
    const parsed = createBattleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const { hostA, hostB, durationSeconds } = parsed.data;
    const battle = createPkBattle(hostA, hostB, durationSeconds);
    const ratio = calculateTugOfWarRatio(battle.hostA.score, battle.hostB.score);
    return reply.status(201).send({
      success: true,
      data: {
        ...battle,
        tugOfWarRatio: ratio,
      },
    });
  });

  // Get PK Battle by ID with tug-of-war ratio
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const battle = getBattle(id);
    if (!battle) {
      throw createAppError('PK Battle not found', 404, 'NOT_FOUND');
    }
    const ratio = calculateTugOfWarRatio(battle.hostA.score, battle.hostB.score);
    return reply.send({
      success: true,
      data: {
        ...battle,
        tugOfWarRatio: ratio,
      },
    });
  });

  // Contribute points to a battle
  fastify.post('/:id/contribute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = contributeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const { contributor, targetHostId, points } = parsed.data;
    const battle = contributePoints(id, contributor, targetHostId, points);
    const ratio = calculateTugOfWarRatio(battle.hostA.score, battle.hostB.score);
    return reply.send({
      success: true,
      data: {
        ...battle,
        tugOfWarRatio: ratio,
      },
    });
  });

  // End battle
  fastify.post('/:id/end', async (request, reply) => {
    const { id } = request.params as { id: string };
    const battle = endPkBattle(id);
    const ratio = calculateTugOfWarRatio(battle.hostA.score, battle.hostB.score);
    return reply.send({
      success: true,
      data: {
        ...battle,
        tugOfWarRatio: ratio,
      },
    });
  });
}
