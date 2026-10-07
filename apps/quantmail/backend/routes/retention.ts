import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { RetentionService } from '../services/retention.service';

const retentionService = new RetentionService();

function requireUserId(request: FastifyRequest): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const createPolicySchema = z.object({
  name: z.string().trim().min(1, 'Policy name is required').max(100),
  durationDays: z.coerce.number().int().min(1, 'Duration must be at least 1 day').max(3650),
  targetFolders: z.array(z.string()).optional().default(['ALL']),
  action: z.enum(['ARCHIVE', 'PERMANENT_DELETE']).default('ARCHIVE'),
});

const placeLegalHoldSchema = z.object({
  custodianEmail: z.string().trim().email('Valid custodian email is required'),
  matterName: z.string().trim().min(1, 'Matter name is required').max(120),
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});

const releaseLegalHoldSchema = z.object({
  releaseReason: z.string().trim().min(1, 'Release reason is required').max(500),
});

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma?: unknown }).prisma;
}

function getService(fastify: FastifyInstance): RetentionService {
  const prisma = getPrisma(fastify);
  return prisma ? new RetentionService(prisma) : retentionService;
}

export default async function retentionRoutes(fastify: FastifyInstance) {
  // GET /retention/policies - List all retention policies
  fastify.get('/policies', async (request, reply) => {
    requireUserId(request);
    const service = getService(fastify);
    const policies = await service.getPolicies();
    return reply.send({
      success: true,
      data: policies,
    });
  });

  // POST /retention/policies - Create a mailbox retention policy
  fastify.post('/policies', async (request, reply) => {
    requireUserId(request);
    const parsed = createPolicySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid policy parameters',
        400,
        'VALIDATION_ERROR',
      );
    }

    const service = getService(fastify);
    const policy = await service.createPolicy(parsed.data);
    return reply.status(201).send({
      success: true,
      data: policy,
    });
  });

  // GET /retention/legal-holds - List legal holds
  fastify.get('/legal-holds', async (request, reply) => {
    requireUserId(request);
    const query = request.query as { activeOnly?: string };
    const activeOnly = query?.activeOnly === 'true';
    const service = getService(fastify);
    const holds = await service.getLegalHolds(activeOnly);
    return reply.send({
      success: true,
      data: holds,
    });
  });

  // GET /retention/legal-holds/check - Check if custodian is under active legal hold
  fastify.get<{ Querystring: { email?: string } }>('/legal-holds/check', async (request, reply) => {
    requireUserId(request);
    const email = request.query?.email;
    if (!email) {
      throw createAppError('Missing email query parameter', 400, 'MISSING_EMAIL');
    }
    const service = getService(fastify);
    const isHeld = await service.isUnderLegalHold(email);
    return reply.send({
      success: true,
      data: { email, isHeld },
    });
  });

  // POST /retention/legal-holds - Place a legal hold on a custodian
  fastify.post('/legal-holds', async (request, reply) => {
    const callerId = requireUserId(request);
    const parsed = placeLegalHoldSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid legal hold payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const service = getService(fastify);
    const hold = await service.placeLegalHold({
      custodianEmail: parsed.data.custodianEmail,
      matterName: parsed.data.matterName,
      reason: parsed.data.reason,
      placedBy: callerId,
    });

    return reply.status(201).send({
      success: true,
      data: hold,
    });
  });

  // DELETE /retention/legal-holds/:id - Release a legal hold
  fastify.delete<{ Params: { id: string } }>('/legal-holds/:id', async (request, reply) => {
    const callerId = requireUserId(request);
    const parsed = releaseLegalHoldSchema.safeParse(request.body ?? {});
    const releaseReason = parsed.success
      ? parsed.data.releaseReason
      : 'Legal hold released by administrator';

    const service = getService(fastify);
    const released = await service.releaseLegalHold(request.params.id, releaseReason, callerId);

    return reply.send({
      success: true,
      data: released,
    });
  });
}

export { retentionService };
