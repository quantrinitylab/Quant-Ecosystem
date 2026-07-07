// ============================================================================
// QuantMail — AI compose route (/ai/compose) for the composer's AI Tone/assist.
// The composer calls POST /ai/compose { instructions, tone, length } and expects
// { success, data: { subject, body, suggestions } }. Backed by the real
// @quant/ai MailAIService + AIEngine (Vercel AI SDK). If no provider API key is
// configured (OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY /
// OPENROUTER_API_KEY), the engine throws — we catch it and return a clean 503
// so the UI degrades gracefully (keeps the user's text) instead of erroring.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MailAIService, AIEngine } from '@quant/ai';

const composeSchema = z.object({
  instructions: z.string().min(1).max(4000),
  tone: z.string().optional(),
  length: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
});

export default async function aiComposeRoutes(fastify: FastifyInstance) {
  fastify.post('/compose', async (request, reply) => {
    const parsed = composeSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    try {
      const engine = new AIEngine();
      const mailAI = new MailAIService(engine);
      const result = await mailAI.composeEmail(
        parsed.data.instructions,
        {
          tone: parsed.data.tone,
          recipient: parsed.data.recipient,
          subject: parsed.data.subject,
        },
        userId,
      );
      return reply.send({
        success: true,
        data: { subject: parsed.data.subject ?? '', body: result.content, suggestions: [] },
      });
    } catch (err) {
      request.log.error({ err }, 'ai compose failed (provider key likely missing)');
      return reply.code(503).send({
        success: false,
        error: {
          code: 'AI_UNAVAILABLE',
          message:
            'AI assistant is not configured yet. Add a provider API key to enable AI compose.',
          statusCode: 503,
        },
      });
    }
  });
}
