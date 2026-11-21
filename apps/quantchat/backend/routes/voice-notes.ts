import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { VoiceNoteService, type VoiceMessageSink } from '../services/voice-note.service';
import { MessageService } from '../services/message.service';
import { validateMediaUrl, ownStorageHosts } from '../lib/media-url';

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
 * QC-F-425: the transcriber is a server-side fetcher-in-waiting — the URL
 * must be the caller's OWN uploaded media, never an arbitrary host.
 * F-330's validateMediaUrl gives scheme + ownership key-shape, but its
 * local-host allowance is calibrated for browser-loaded media; a server
 * fetch must additionally match the own-storage host set EXACTLY
 * (localhost/127.0.0.1/minio are this server's own loopback here).
 * One error for every failure — no host/key oracle.
 */
function assertTranscribableAudioUrl(raw: string, ownerId: string): void {
  let host = '';
  try {
    host = new URL(raw).host;
  } catch {
    /* verdict below is already false */
  }
  const verdict = validateMediaUrl(raw, { ownerId, allowData: false, maxUrlLength: 4096 });
  if (!verdict.ok || !ownStorageHosts().has(host)) {
    throw createAppError('Audio URL must reference your own uploaded media', 400, 'MEDIA_URL_NOT_ALLOWED');
  }
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
    const callerId = userId(request);
    assertTranscribableAudioUrl(parsed.data.audioUrl, callerId);
    const text = await service(callerId).transcribe(parsed.data.audioUrl);
    return reply.send({ success: true, data: { text } });
  });

  fastify.post('/auto-reply', async (request, reply) => {
    const parsed = autoReplySchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const callerId = userId(request);
    assertTranscribableAudioUrl(parsed.data.audioUrl, callerId);
    const data = await service(callerId).autoReply({
      conversationId: parsed.data.conversationId,
      senderId: callerId,
      audioUrl: parsed.data.audioUrl,
    });
    return reply.status(201).send({ success: true, data });
  });
}
