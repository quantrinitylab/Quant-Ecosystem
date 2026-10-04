successfully downloaded text file (SHA: d17020426953fe49245d9d594e5ee399a25088cf)",
        "type": "text"
      },
      {
        "resource": {
          "mimeType": "text/plain; charset=utf-8",
          "text": "import type { FastifyInstance } from 'fastify';
import { voiceInterface } from '@quant/agentic';
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

export default async function voiceRoutes(fastify: FastifyInstance) {
  // Honest capability reporting — the frontend gates voice UI on this.
  fastify.get('/status', async (_request, reply) => {
    const stt = isMetaSTTConfigured() ? 'meta' : voiceInterface.isBackendConfigured() ? 'openai' : 'none';
    return reply.send({
      stt,
      sttModel: stt === 'meta' ? process.env['META_VOICE_MODEL'] ?? 'muse-voice-transcribe-1.0' : null,
      tts: 'browser',
      metaVoiceConfigured: isMetaSTTConfigured(),
    });
  });

  fastify.post('/tts', async (request, reply) => {
    const { text } = request.body as any;

    const audio = await voiceInterface.textToSpeech(text);

    reply.header('Content-Type', 'audio/mpeg');
    return reply.send(audio);
  });

  fastify.post('/stt', async (request, reply) => {
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
