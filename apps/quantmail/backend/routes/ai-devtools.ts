import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { AIEngine } from '@quant/ai';
import { AICodeReviewService, CodeReviewInputSchema } from '../services/ai-code-review.service';
import {
  AICommitMessageService,
  CommitMessageInputSchema,
} from '../services/ai-commit-message.service';
import {
  AIPRDescriptionService,
  PRDescriptionInputSchema,
} from '../services/ai-pr-description.service';
import { AICIFixService, CIFixInputSchema } from '../services/ai-ci-fix.service';
import { AICodeSearchService, CodeSearchInputSchema } from '../services/ai-code-search.service';
import {
  AISecurityScanService,
  SecurityScanInputSchema,
} from '../services/ai-security-scan.service';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function aiDevtoolsRoutes(fastify: FastifyInstance) {
  const engine = new AIEngine();
  const codeReviewService = new AICodeReviewService(engine);
  const commitMessageService = new AICommitMessageService(engine);
  const prDescriptionService = new AIPRDescriptionService(engine);
  const ciFixService = new AICIFixService(engine);
  const codeSearchService = new AICodeSearchService(engine);
  const securityScanService = new AISecurityScanService(engine);

  // POST /code-review
  fastify.post('/code-review', async (request, reply) => {
    const userId = getUserId(request);
    const body = CodeReviewInputSchema.parse(request.body);
    const result = await codeReviewService.reviewDiff(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /commit-message
  fastify.post('/commit-message', async (request, reply) => {
    const userId = getUserId(request);
    const body = CommitMessageInputSchema.parse(request.body);
    const result = await commitMessageService.generateMessage(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /pr-description
  fastify.post('/pr-description', async (request, reply) => {
    const userId = getUserId(request);
    const body = PRDescriptionInputSchema.parse(request.body);
    const result = await prDescriptionService.generateDescription(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ci-fix
  fastify.post('/ci-fix', async (request, reply) => {
    const userId = getUserId(request);
    const body = CIFixInputSchema.parse(request.body);
    const result = await ciFixService.suggestFix(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /code-search
  fastify.post('/code-search', async (request, reply) => {
    const userId = getUserId(request);
    const body = CodeSearchInputSchema.parse(request.body);
    const result = await codeSearchService.semanticSearch(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /security-scan
  fastify.post('/security-scan', async (request, reply) => {
    const userId = getUserId(request);
    const body = SecurityScanInputSchema.parse(request.body);
    const result = await securityScanService.scanDiff(body, userId);
    return reply.send({ success: true, data: result });
  });
}
