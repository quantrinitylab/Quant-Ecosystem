// ============================================================================
// QuantMail — QuantAI chat route (POST /ai/chat)
//
// Powers the "Ask QuantAI" copilot panel: a real multi-turn chat that is aware
// of what the user currently has on screen (route, selected thread, subject,
// visible text) so answers reference the actual workspace instead of guessing.
//
// Inference goes through the pluggable provider layer (services/ai-provider),
// so switching from Cloudflare Workers AI to an OpenAI-compatible endpoint or
// our own future model is a config change only — no code change here.
//
// `intent` is the settings page's "How much thinking" picker arriving at the
// only place that can act on it. It used to stop at `localStorage`: the page
// wrote `quant-ai-model-mode`, promised the value was "sent with each request as
// an intent", and this route hardcoded `{ maxTokens: 1024, temperature: 0.6 }`
// for every caller. The tier now decides the answer-length budget, the reasoning
// directive, the provider timeout and (when a deployment pins one) the model —
// and the resolved tier goes back in the response so the client can say which
// one actually ran instead of which one was asked for.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AI_INTENTS, measureAISignals, resolveAIIntent } from '@quant/common';
import {
  aiChat,
  isAIConfigured,
  activeProvider,
  resolveTierModel,
} from '../services/ai-provider.service';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(6000),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(24),
  // Optional so a client that predates this field still works: absent is `auto`,
  // which is also the picker's default.
  intent: z.enum(AI_INTENTS).optional(),
  context: z
    .object({
      app: z.string().max(200).optional(),
      route: z.string().max(500).optional(),
      view: z.string().max(2000).optional(),
      subject: z.string().max(1000).optional(),
      from: z.string().max(320).optional(),
      selection: z.string().max(4000).optional(),
      screenText: z.string().max(8000).optional(),
    })
    .optional(),
});

const SYSTEM_PROMPT = [
  'You are QuantAI, the assistant built into the Quantrinity workspace (QuantMail: mail, calendar, contacts, drive, code).',
  'You can see a summary of what the user currently has on screen; use it to give specific, grounded answers.',
  'Be concise and practical. Prefer short paragraphs or tight bullet lists.',
  'When the user asks you to write an email, output only the email body text, ready to paste.',
  'If the on-screen context does not contain what you need, say what is missing instead of inventing details.',
  'Never claim to have performed an action you cannot perform; describe the exact next step in QuantMail instead.',
].join(' ');

function buildContextBlock(context: z.infer<typeof chatSchema>['context']): string {
  if (!context) return '';
  const lines: string[] = [];
  if (context.app) lines.push(`App: ${context.app}`);
  if (context.route) lines.push(`Route: ${context.route}`);
  if (context.view) lines.push(`View: ${context.view}`);
  if (context.from) lines.push(`Open message from: ${context.from}`);
  if (context.subject) lines.push(`Open subject: ${context.subject}`);
  if (context.selection) lines.push(`User selection:\n${context.selection}`);
  if (context.screenText) lines.push(`Visible screen text:\n${context.screenText}`);
  if (lines.length === 0) return '';
  return `On-screen context:\n${lines.join('\n')}`;
}

export default async function aiChatRoutes(fastify: FastifyInstance) {
  fastify.get('/chat/health', async (_request, reply) => {
    if (!isAIConfigured()) {
      return reply.status(503).send({
        success: false,
        data: { status: 'offline' },
        error: { code: 'AI_UNAVAILABLE', message: 'QuantAI is not configured on this environment' },
      });
    }

    return reply.send({ success: true, data: { status: 'ready', provider: activeProvider() } });
  });

  fastify.post('/chat', async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const { messages, context, intent } = parsed.data;
    const contextBlock = buildContextBlock(context);

    // `auto` decides from the size and depth of what actually arrived, not from
    // anything the client asserts about itself.
    const plan = resolveAIIntent(intent, measureAISignals(messages, context));

    const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: plan.directive },
    ];
    if (contextBlock) {
      modelMessages.push({ role: 'system', content: contextBlock });
    }
    modelMessages.push(...messages);

    if (!isAIConfigured()) {
      throw createAppError('QuantAI is not configured on this environment', 503, 'AI_UNAVAILABLE');
    }

    try {
      // No `temperature` here on purpose: the tiers differ by budget, prompt and
      // time, so every one of them keeps the provider's own 0.6. A hidden
      // per-tier temperature spread is the "Precise / Creative" defect again.
      const message = await aiChat(modelMessages, {
        maxTokens: plan.maxTokens,
        timeoutMs: plan.timeoutMs,
        model: resolveTierModel(plan.modelEnvVar),
      });
      return reply.send({
        success: true,
        data: { message, tier: plan.tier, routed: plan.routed },
      });
    } catch (err) {
      request.log.error({ err, tier: plan.tier }, 'QuantAI chat failed');
      throw createAppError('QuantAI could not answer right now', 503, 'AI_UNAVAILABLE');
    }
  });
}
