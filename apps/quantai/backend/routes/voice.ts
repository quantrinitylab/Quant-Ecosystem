import type { FastifyInstance } from 'fastify';
import { voiceInterface } from '@quant/agentic';
import { createAppError } from '@quant/server-core';
import {
  listAvailableVoices,
  synthesizeSpeech,
  generateSsml,
  type TTSProvider,
} from '../services/voiceover-tts.service';

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

export default async function voiceRoutes(fastify: FastifyInstance) {
  const ownership = getAgentOwnershipPort(fastify);

  fastify.post('/tts', async (request, reply) => {
    const { text } = request.body as any;

    const audio = await voiceInterface.textToSpeech(text);

    reply.header('Content-Type', 'audio/mpeg');
    return reply.send(audio);
  });

  fastify.post('/stt', async (request, reply) => {
    const data = await (request as any).file();
    const buffer = await data.toBuffer();

    const text = await voiceInterface.speechToText(buffer);

    return reply.send({ text });
  });

  fastify.post('/command', async (request, reply) => {
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

  fastify.post('/synthesize', async (request, reply) => {
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

  fastify.post('/ssml', async (request, reply) => {
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
