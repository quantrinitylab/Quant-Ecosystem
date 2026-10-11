import type { FastifyInstance } from 'fastify';
import { voiceInterface } from '@quant/agentic';
import { createAppError } from '@quant/server-core';
import {
  listAvailableVoices,
  synthesizeSpeech,
  generateSsml,
  type TTSProvider,
} from '../services/voiceover-tts.service';
import {
  transcribeWithMeta,
  isMetaSTTConfigured,
  MetaVoiceSTTError,
} from '../services/meta-voice.service';

// TODO(UNVERIFIED): injectable agent-ownership seam. Merge-time wiring must
// decorate 'agentOwnership' with the real @quant/agentic agent-owner lookup:
//   fastify.decorate('agentOwnership', { assertAgentOwnership })
// Contract: assertAgentOwnership(agentId, userId) resolves silently when userId
// owns agentId; throws createAppError('Forbidden', 403, 'AGENT_FORBIDDEN') on
// mismatch; throws on lookup errors. Default (unwired) fails closed with
// createAppError('Ownership check unavailable', 503, 'OWNERSHIP_CHECK_UNAVAILABLE').
export interface AgentOwnershipPort {
  assertAgentOwnership(agentId: string, userId: string): Promise<void>;
}

function getAgentOwnershipPort(fastify: FastifyInstance): AgentOwnershipPort {
  if (!fastify.hasDecorator('agentOwnership')) {
    fastify.decorate('agentOwnership', {
      async assertAgentOwnership() {
        throw createAppError(
          'Ownership check unavailable',
          503,
          'OWNERSHIP_CHECK_UNAVAILABLE',
        );
      },
    } satisfies AgentOwnershipPort);
  }
  return (fastify as unknown as { agentOwnership: AgentOwnershipPort }).agentOwnership;
}

/**
 * Per-request TTS input cap. TTS providers bill per character, so a single
 * unbounded request could burn significant credits; reject junk before any
 * provider call. 5000 chars ≈ the common single-request ceiling of TTS APIs.
 */
export const MAX_TTS_TEXT_CHARS = 5000;

export default async function voiceRoutes(fastify: FastifyInstance) {
  const ownership = getAgentOwnershipPort(fastify);

  // Paid voice endpoints are explicitly gated here. The global onRequest auth
  // hook in createApp() (packages/server-core) also rejects unauthenticated
  // callers, but these routes declare the guard themselves so the protection
  // survives if they are ever mounted on a bare Fastify instance or the global
  // hook's public-path list is ever widened by mistake. Fail-closed: 401
  // before any STT/TTS provider call, so no credits can be burned.
  const paidGuard = { preHandler: fastify.requireAuth() };

  // Honest capability reporting — the frontend gates voice UI on this.
  // Read-only metadata, no provider cost: intentionally left public.
  fastify.get('/status', async (_request, reply) => {
    const stt = isMetaSTTConfigured() ? 'meta' : voiceInterface.isBackendConfigured() ? 'openai' : 'none';
    return reply.send({
      stt,
      sttModel: stt === 'meta' ? process.env['META_VOICE_MODEL'] ?? 'muse-voice-transcribe-1.0' : null,
      tts: 'browser',
      metaVoiceConfigured: isMetaSTTConfigured(),
    });
  });

  fastify.post('/tts', paidGuard, async (request, reply) => {
    const { text } = request.body as any;

    // Bounded input: reject empty/oversized text before any provider call so a
    // single request cannot burn unbounded TTS credits on junk.
    if (typeof text !== 'string' || text.trim().length === 0) {
      return reply
        .status(400)
        .send({ error: 'text is required and must be a non-empty string' });
    }
    if (text.length > MAX_TTS_TEXT_CHARS) {
      return reply.status(400).send({
        error: `text exceeds the per-request limit of ${MAX_TTS_TEXT_CHARS} characters`,
      });
    }

    const audio = await voiceInterface.textToSpeech(text);

    reply.header('Content-Type', 'audio/mpeg');
    return reply.send(audio);
  });

  fastify.post('/stt', paidGuard, async (request, reply) => {
    const data = await (request as any).file();
    if (!data) {
      return reply.status(400).send({ error: 'No audio file uploaded (multipart field "file")' });
    }
    const buffer: Buffer = await data.toBuffer();

    // Prefer Meta STT when configured (real transcription, no placeholder).
    if (isMetaSTTConfigured()) {
      try {
        const result = await transcribeWithMeta(buffer);
        return reply.send({
          text: result.text,
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs,
        });
      } catch (err) {
        const status = err instanceof MetaVoiceSTTError ? err.statusCode : 500;
        const message = err instanceof Error ? err.message : 'STT failed';
        return reply.status(status).send({ error: message, provider: 'meta' });
      }
    }

    // Fallback to the legacy voice interface (OpenAI Whisper when configured).
    try {
      const text = await voiceInterface.speechToText(buffer);
      return reply.send({ text, provider: 'openai' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'STT failed';
      return reply.status(503).send({ error: message, provider: 'none' });
    }
  });

  fastify.post('/command', paidGuard, async (request, reply) => {
    // requireAuth (paidGuard) already verified the token and populated
    // request.auth; this is a defensive assertion, not the gate.
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { audio, agentId } = request.body as any;

    // Only gate when an agentId is supplied: global (agentId-less) voice commands
    // stay allowed for authenticated users.
    // TODO(UNVERIFIED): confirm with product whether agentId-less global voice
    // commands really should bypass ownership checks for every authenticated user.
    if (agentId) {
      await ownership.assertAgentOwnership(agentId, userId);
    }

    const result = await voiceInterface.processVoiceCommand(Buffer.from(audio, 'base64'), agentId);

    return reply.send(result);
  });

  // MagicAI Multi-Provider Voiceover TTS Routes
  fastify.get('/voices', async (request, reply) => {
    const query = (request.query || {}) as {
      provider?: TTSProvider;
      language?: string;
      gender?: string;
    };
    const voices = listAvailableVoices(query);
    return reply.send({ success: true, count: voices.length, voices });
  });

  fastify.post('/synthesize', paidGuard, async (request, reply) => {
    const body = request.body as any;
    if (!body || !body.text || !body.voiceId) {
      return reply.status(400).send({ error: 'text and voiceId are required' });
    }
    const result = await synthesizeSpeech({
      text: body.text,
      voiceId: body.voiceId,
      speed: body.speed,
      pitch: body.pitch,
      audioFormat: body.audioFormat,
    });
    return reply.send(result);
  });

  fastify.post('/ssml', paidGuard, async (request, reply) => {
    const body = request.body as any;
    if (!body || !body.text) {
      return reply.status(400).send({ error: 'text is required' });
    }
    const ssml = generateSsml(body.text, {
      speed: body.speed,
      pitch: body.pitch,
    });
    return reply.send({ ssml });
  });
}
