import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { VoiceNoteService, type VoiceMessageSink } from '../services/voice-note.service';
import { MessageService } from '../services/message.service';

const transcribeSchema = z.object({ audioUrl: z.string().url() });
const autoReplySchema = z.object({
  conversationId: z.string().min(1),
  audioUrl: z.string().url(),
});

function userId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return id;
}

/**
 * QuantChat AI voice-note routes (mounted at /voice-notes). The durable send
 * sink is wired to MessageService (real AUDIO message). STT/TTS/AI-reply are
 * pluggable and default to fail-closed (needs-staging) — no fabricated
 * transcript/audio is ever produced.
 */
export default async function voiceNoteRoutes(fastify: FastifyInstance) {
  function service(senderId: string): VoiceNoteService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const messages = new MessageService(prisma as never);
    const sink: VoiceMessageSink = {
      sendAudio: async (input) => {
        const msg = await messages.sendMessage({
          conversationId: input.conversationId,
          senderId,
          content: input.transcript ?? '',
          type: 'audio',
          mediaUrl: input.audioUrl,
        });
        return { messageId: (msg as { id: string }).id };
      },
    };
    // STT / TTS / AI reply providers are wired in staging; defaults fail closed.
    return new VoiceNoteService({ sink });
  }

  fastify.post('/transcribe', async (request, reply) => {
    const parsed = transcribeSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const text = await service(userId(request)).transcribe(parsed.data.audioUrl);
    return reply.send({ success: true, data: { text } });
  });

  fastify.post('/auto-reply', async (request, reply) => {
    const parsed = autoReplySchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service(userId(request)).autoReply({
      conversationId: parsed.data.conversationId,
      senderId: userId(request),
      audioUrl: parsed.data.audioUrl,
    });
    return reply.status(201).send({ success: true, data });
  });
}
