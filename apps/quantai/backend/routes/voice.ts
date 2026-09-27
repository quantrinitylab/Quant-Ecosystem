import type { FastifyInstance } from 'fastify';
import { voiceInterface } from '@quant/agentic';
import {
  listAvailableVoices,
  synthesizeSpeech,
  generateSsml,
  type TTSProvider,
} from '../services/voiceover-tts.service';

export default async function voiceRoutes(fastify: FastifyInstance) {
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
    const { audio, agentId } = request.body as any;

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
