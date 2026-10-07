import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CodeAnalyzer } from '@quant/code-agent';

// Layer 2 type augmentation: expose the decorated code-agent CodeAnalyzer on the
// Fastify instance. Constructed in buildApp() (per-app lane), decorated after
// agentRuntime (dependsOn). CodeAnalyzer is the engine's constructible,
// dependency-free service (it derives a repo model from a file listing); the
// engine's TaskExecutor is intentionally NOT wired here because its only
// collaborator is an execution sandbox whose sole in-package implementation is a
// test double — wiring it would require an unbuilt external (see Req 6.6 gate).
declare module 'fastify' {
  interface FastifyInstance {
    codeAgent: CodeAnalyzer;
  }
}

const analyzeSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(50000),
});

/**
 * code-agent seam routes (per-app lane), registered under the `/agents/code`
 * prefix in quantai's buildApp(). The global auth hook protects every path; the
 * analysis mutation declares the `agents:execute` scope.
 */
export default async function codeAgentRoutes(fastify: FastifyInstance) {
  // POST /agents/code/analyze — derive a repo model (languages, frameworks,
  // build system, entry points, tests) from a file-path listing.
  fastify.post(
    '/analyze',
    {
      preHandler: fastify.requireAuth({ scopes: ['agents:execute'] }),
    },
    async (request, reply) => {
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const analysis = fastify.codeAgent.generateRepoModel(parsed.data.paths);
      return reply.send({ success: true, data: analysis });
    },
  );
}
