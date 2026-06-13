import type { FastifyInstance } from 'fastify';
import { voiceInterface } from '@quant/agentic';

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
}
