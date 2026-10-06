// ============================================================================
// QuantAI — Fastify Routes: Quanty Plan / Wallet / Permissions / Credentials
// (PR-Q6 — Muse S3 parity)
//
//   GET    /quanty/plan         → plan card + additional tokens + upgrade URL
//   GET    /quanty/wallet       → credit balances + earn/spend history
//   GET    /quanty/permissions  → per-tool allow/ask/deny policies
//   PUT    /quanty/permissions  → set policies (body: { tools: [{id, policy}] })
//   GET    /quanty/credentials  → stored grant METADATA (never token values)
//   DELETE /quanty/credentials/:id → revoke a grant
//
// All routes require auth and are scoped to the caller's userId.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  QuantyPlanService,
  ToolPolicyService,
  getAuthUserId,
  type ToolPolicy,
} from '../services/quanty-plan.service';

const setPermissionsSchema = z.object({
  tools: z
    .array(
      z.object({
        id: z.string().min(1),
        policy: z.enum(['allow', 'ask', 'deny']),
      }),
    )
    .min(1)
    .max(100),
});

export default async function quantyPlanRoutes(fastify: FastifyInstance) {
  function getPlanService(): QuantyPlanService {
    let service = (fastify as unknown as { quantyPlanService?: QuantyPlanService }).quantyPlanService;
    if (!service) {
      const prisma = (fastify as unknown as { prisma?: unknown }).prisma ?? null;
      service = new QuantyPlanService(
        prisma as unknown as ConstructorParameters<typeof QuantyPlanService>[0],
      );
      (fastify as unknown as { quantyPlanService: QuantyPlanService }).quantyPlanService = service;
    }
    return service;
  }

  function getPolicyService(): ToolPolicyService {
    let service = (fastify as unknown as { toolPolicyService?: ToolPolicyService }).toolPolicyService;
    if (!service) {
      service = new ToolPolicyService();
      (fastify as unknown as { toolPolicyService: ToolPolicyService }).toolPolicyService = service;
    }
    return service;
  }

  // -- Plan ---------------------------------------------------------------
  fastify.get('/plan', async (request, reply) => {
    const userId = getAuthUserId(request);
    const summary = await getPlanService().getPlanSummary(userId);
    return reply.send({ success: true, data: summary });
  });

  // -- Wallet -------------------------------------------------------------
  fastify.get('/wallet', async (request, reply) => {
    const userId = getAuthUserId(request);
    const wallet = await getPlanService().getWallet(userId);
    return reply.send({ success: true, data: wallet });
  });

  // -- Permissions --------------------------------------------------------
  fastify.get('/permissions', async (request, reply) => {
    const userId = getAuthUserId(request);
    const tools = getPolicyService().listPolicies(userId);
    return reply.send({ success: true, data: { tools } });
  });

  fastify.put('/permissions', async (request, reply) => {
    const userId = getAuthUserId(request);
    const parseResult = setPermissionsSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        `Invalid request body: ${parseResult.error.issues.map((i) => i.message).join('; ')}`,
        400,
        'INVALID_BODY',
      );
    }
    const updated = parseResult.data.tools.map((t) =>
      getPolicyService().setPolicy(userId, t.id, t.policy as ToolPolicy),
    );
    return reply.send({ success: true, data: { tools: updated } });
  });

  // -- Credentials (metadata only) ----------------------------------------
  fastify.get('/credentials', async (request, reply) => {
    const userId = getAuthUserId(request);
    const result = await getPlanService().getCredentials(userId);
    return reply.send({ success: true, data: result });
  });

  fastify.delete('/credentials/:id', async (request, reply) => {
    const userId = getAuthUserId(request);
    const { id } = request.params as { id: string };
    if (!id) {
      throw createAppError('Credential id is required', 400, 'GRANT_ID_REQUIRED');
    }
    const revoked = await getPlanService().revokeCredential(userId, id);
    return reply.send({ success: true, data: revoked });
  });
}
