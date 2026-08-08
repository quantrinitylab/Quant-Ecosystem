// ============================================================================
// QuantMail — AI compose route (/ai/compose) for the composer's AI Tone/assist.
// The composer calls POST /ai/compose { instructions, tone, length } and expects
// { success, data: { subject, body, suggestions } }.
//
// Primary path: Cloudflare Workers AI (when AI_PROVIDER=cloudflare and
// CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN are set). This is the default
// for the deployed QuantMail instance.
//
// Fallback path: @quant/ai MailAIService + AIEngine (Vercel AI SDK) when a
// third-party API key is configured (OPENAI_API_KEY / ANTHROPIC_API_KEY etc.)
//
// If neither is available, returns a clean 503 so the UI degrades gracefully.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const composeSchema = z.object({
  instructions: z.string().min(1).max(4000),
  tone: z.string().optional(),
  length: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
});

const TONE_PROMPTS: Record<string, string> = {
  formal: 'Write in a professional, formal tone suitable for business communication.',
  professional: 'Write in a clear, professional tone.',
  friendly: 'Write in a warm, friendly, conversational tone.',
  casual: 'Write in a relaxed, casual tone.',
};

const LENGTH_PROMPTS: Record<string, string> = {
  short: 'Keep the response concise — 2-3 sentences maximum.',
  medium: 'Keep the response moderate length — one short paragraph.',
  long: 'Provide a detailed, comprehensive response.',
};

function buildSystemPrompt(tone?: string, length?: string, recipient?: string): string {
  const parts = [
    'You are QuantMail AI, an email writing assistant.',
    'Generate only the email body text — no subject line, no greeting unless appropriate, no sign-off unless natural.',
    'Write naturally without any markdown formatting.',
  ];
  if (tone && TONE_PROMPTS[tone]) parts.push(TONE_PROMPTS[tone]);
  if (length && LENGTH_PROMPTS[length]) parts.push(LENGTH_PROMPTS[length]);
  if (recipient) parts.push(`The recipient is: ${recipient}`);
  return parts.join(' ');
}

async function inferViaWorkersAI(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const model = process.env['CLOUDFLARE_AI_MODEL'] ?? '@cf/meta/llama-3.2-1b-instruct';
  const baseUrl =
    process.env['CLOUDFLARE_AI_BASE_URL'] ?? 'https://api.cloudflare.com/client/v4/accounts';

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI credentials not configured');
  }

  const url = `${baseUrl}/${accountId}/ai/run/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
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

  return data.result.response;
}

function isWorkersAIConfigured(): boolean {
  return (
    process.env['AI_PROVIDER']?.toLowerCase() === 'cloudflare' &&
    Boolean(process.env['CLOUDFLARE_ACCOUNT_ID']) &&
    Boolean(process.env['CLOUDFLARE_API_TOKEN'])
  );
}

export default async function aiComposeRoutes(fastify: FastifyInstance) {
  fastify.post('/compose', async (request, reply) => {
    const parsed = composeSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const { instructions, tone, length, recipient, subject } = parsed.data;
    const systemPrompt = buildSystemPrompt(tone, length, recipient);
    const userPrompt = subject
      ? `Subject: ${subject}\n\nInstructions: ${instructions}`
      : instructions;

    // Primary: Cloudflare Workers AI
    if (isWorkersAIConfigured()) {
      try {
        const body = await inferViaWorkersAI(userPrompt, systemPrompt);
        return reply.send({
          success: true,
          data: { subject: subject ?? '', body, suggestions: [] },
        });
      } catch (err) {
        request.log.error({ err }, 'Workers AI compose failed');
        return reply.code(503).send({
          success: false,
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'AI assistant temporarily unavailable. Please try again.',
            statusCode: 503,
          },
        });
      }
    }

    // Fallback: @quant/ai MailAIService (requires OPENAI/ANTHROPIC/GOOGLE key)
    try {
      const { MailAIService, AIEngine } = await import('@quant/ai');
      const engine = new AIEngine();
      const mailAI = new MailAIService(engine);
      const result = await mailAI.composeEmail(
        instructions,
        { tone, recipient, subject },
        userId,
      );
      return reply.send({
        success: true,
        data: { subject: subject ?? '', body: result.content, suggestions: [] },
      });
    } catch (err) {
      request.log.error({ err }, 'ai compose failed (no provider configured)');
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
