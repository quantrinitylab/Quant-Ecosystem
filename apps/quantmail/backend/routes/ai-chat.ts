// ============================================================================
// QuantMail — QuantAI chat route (POST /ai/chat)
//
// Powers the "Ask QuantAI" copilot panel: a real multi-turn chat that is aware
// of what the user currently has on screen (route, selected thread, subject,
// visible text) so answers reference the actual workspace instead of guessing.
//
// Primary path: Cloudflare Workers AI (AI_PROVIDER=cloudflare) — same provider
// the composer already uses. Falls back to a clean 503 when no provider is
// configured so the UI degrades gracefully instead of showing a broken panel.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(6000),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(24),
  context: z
    .object({
      app: z.string().max(60).optional(),
      route: z.string().max(300).optional(),
      view: z.string().max(120).optional(),
      subject: z.string().max(500).optional(),
      from: z.string().max(320).optional(),
      selection: z.string().max(4000).optional(),
      screenText: z.string().max(6000).optional(),
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

async function inferViaWorkersAI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const model = process.env['CLOUDFLARE_AI_MODEL'] ?? '@cf/meta/llama-3.2-1b-instruct';
  const baseUrl =
    process.env['CLOUDFLARE_AI_BASE_URL'] ?? 'https://api.cloudflare.com/client/v4/accounts';

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI credentials not configured');
  }

  const response = await fetch(`${baseUrl}/${accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.6 }),
  });

  if (!response.ok) {
    throw new Error(`Workers AI returned ${response.status}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result?: { response?: string };
  };

  if (!data.success || !data.result?.response) {
    throw new Error('Workers AI returned empty response');
  }

  return data.result.response.trim();
}

function isWorkersAIConfigured(): boolean {
  return (
    process.env['AI_PROVIDER']?.toLowerCase() === 'cloudflare' &&
    Boolean(process.env['CLOUDFLARE_ACCOUNT_ID']) &&
    Boolean(process.env['CLOUDFLARE_API_TOKEN'])
  );
}

export default async function aiChatRoutes(fastify: FastifyInstance) {
  fastify.get('/chat/health', async (_request, reply) => {
    if (!isWorkersAIConfigured()) {
      return reply.status(503).send({
        success: false,
        data: { status: 'offline' },
        error: { code: 'AI_UNAVAILABLE', message: 'QuantAI is not configured on this environment' },
      });
    }

    return reply.send({ success: true, data: { status: 'ready' } });
  });

  fastify.post('/chat', async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const { messages, context } = parsed.data;
    const contextBlock = buildContextBlock(context);

    const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    if (contextBlock) {
      modelMessages.push({ role: 'system', content: contextBlock });
    }
    modelMessages.push(...messages);

    if (!isWorkersAIConfigured()) {
      throw createAppError('QuantAI is not configured on this environment', 503, 'AI_UNAVAILABLE');
    }

    try {
      const message = await inferViaWorkersAI(modelMessages);
      return reply.send({ success: true, data: { message } });
    } catch (err) {
      request.log.error({ err }, 'QuantAI chat failed');
      throw createAppError('QuantAI could not answer right now', 503, 'AI_UNAVAILABLE');
    }
  });
}
