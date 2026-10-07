import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CrossAppOrchestrator, allTools } from '@quant/quant-tools';

// Layer 2 type augmentation: expose the decorated quant-tools cross-app
// orchestrator on the Fastify instance. Constructed in buildApp() with the full
// `allTools` catalog (per-app lane). It turns a natural-language intent into a
// validated, permission-aware multi-step tool plan and executes it — the tool
// arm of the agent-runtime stack it dependsOn.
declare module 'fastify' {
  interface FastifyInstance {
    quantTools: CrossAppOrchestrator;
  }
}

const planSchema = z.object({
  input: z.string().min(1).max(10000),
});

const executeSchema = z.object({
  input: z.string().min(1).max(10000),
  dryRun: z.boolean().optional(),
});

/**
 * quant-tools seam routes (per-app lane), registered under the `/tools` prefix in
 * quantai's buildApp() but namespaced under `/orchestrator/*` so they coexist
 * with the existing `/tools` service routes (which own `/` and `/:name/execute`).
 *
 * The global auth hook protects every path; `userId`/`sessionId` are read from
 * `request.auth`. The state-changing `/execute` route declares `agents:execute`.
 */
export default async function quantToolsRoutes(fastify: FastifyInstance) {
  // GET /tools/orchestrator/catalog — the cross-app tool catalog the planner uses
  fastify.get('/orchestrator/catalog', async (_request, reply) => {
    const tools = allTools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      appId: tool.appId,
      description: tool.description,
    }));
    return reply.send({ success: true, data: { tools } });
  });

  // POST /tools/orchestrator/plan — build (but do not run) a multi-step tool plan
  fastify.post('/orchestrator/plan', async (request, reply) => {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const plan = fastify.quantTools.createPlan(parsed.data.input);
    return reply.send({ success: true, data: plan });
  });

  // POST /tools/orchestrator/execute — plan + execute a cross-app tool workflow
  fastify.post(
    '/orchestrator/execute',
    {
      preHandler: fastify.requireAuth({ scopes: ['agents:execute'] }),
    },
    async (request, reply) => {
      const parsed = executeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const results = await fastify.quantTools.execute(parsed.data.input, {
        userId: request.auth.userId,
        sessionId: request.auth.sessionId,
        dryRun: parsed.data.dryRun,
      });
      return reply.status(201).send({ success: true, data: { results } });
    },
  );
}
