import type { FastifyInstance } from 'fastify';
import { AgentVoiceInterface, voiceInterface } from '@quant/agentic';
import { createAppError } from '@quant/server-core';
import {
  listAvailableVoices,
  synthesizeSpeech,
  generateSsml,
  type TTSProvider,
} from '../services/voiceover-tts.service';
import {
  resolveServerTtsVoice,
  DEFAULT_SERVER_TTS_VOICE,
} from '../services/persona-voice';
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

// --- Voice upload policy (F-055) -------------------------------------------------
// POST /voice/stt accepts real multipart audio uploads. These limits are shared
// with the @fastify/multipart registration in backend/app.ts so the route and
// the parser can never drift apart.
/** Max accepted audio upload: mic-dictation recordings are small; 10 MB is generous. */
export const VOICE_MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const VOICE_UPLOAD_LIMITS = {
  fileSize: VOICE_MAX_AUDIO_BYTES,
  files: 1,
  fields: 20,
  parts: 40,
} as const;

/**
 * Audio MIME types accepted by POST /voice/stt. Compared case-insensitively
 * with any ";codecs=..." parameters stripped. The web clients send
 * audio/wav (see useVoiceCapture), but MediaRecorder on other browsers emits
 * audio/webm or audio/mp4, so the common container types are all allowed.
 */
export const SUPPORTED_AUDIO_MIMETYPES: ReadonlySet<string> = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
]);

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

  // Per-voice AgentVoiceInterface instances so a persona's voiceId actually
  // reaches the TTS provider (F-046): the shared voiceInterface singleton
  // always synthesizes with the default voice, so persona-mapped voices get
  // lazily-built instances whose config.voice flows into
  // backend.synthesize(text, config) -> the provider's `voice` parameter.
  // Instances are cached per voice so we don't rebuild backends per request.
  const ttsByVoice = new Map<string, AgentVoiceInterface>();
  function ttsForVoice(voice: string): AgentVoiceInterface {
    if (voice === DEFAULT_SERVER_TTS_VOICE) return voiceInterface;
    let tts = ttsByVoice.get(voice);
    if (!tts) {
      tts = new AgentVoiceInterface({ voice });
      ttsByVoice.set(voice, tts);
    }
    return tts;
  }

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
    const body = (request.body ?? {}) as { text?: unknown; voiceId?: unknown };
    const { text } = body;

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

    // F-046: honor the persona voiceId the client sends. Unknown/missing ids
    // fall back to the default voice with a logged warning — never a silent
    // no-op, never an invented provider voice.
    const { voice, known } = resolveServerTtsVoice(body.voiceId);
    if (!known) {
      request.log.warn(
        { voiceId: body.voiceId },
        '[voice/tts] unknown or missing voiceId — using default server voice',
      );
    }

    const audio = await ttsForVoice(voice).textToSpeech(text);

    reply.header('Content-Type', 'audio/mpeg');
    return reply.send(audio);
  });

  // Paid STT endpoint stays behind the F-043 auth guard — the hardened F-055
  // handler below replaces the route body but must not drop the guard.
  fastify.post('/stt', paidGuard, async (request, reply) => {
    // @fastify/multipart MUST be registered on the app (see backend/app.ts) —
    // without it request.file is undefined and every audio upload 500s (F-055).
    let data: Awaited<ReturnType<typeof request.file>>;
    try {
      data = await request.file();
    } catch {
      // Not a multipart request at all, or the multipart framing is malformed
      // (bad boundary, truncated body). Never a 500: the client sent the wrong
      // shape, so say so honestly.
      return reply.status(400).send({
        error: 'Expected a multipart audio upload (field "file")',
        code: 'VOICE_NO_AUDIO_FILE',
      });
    }
    if (!data) {
      // Valid multipart body, but it carried no file part.
      return reply.status(400).send({
        error: 'No audio file uploaded (multipart field "file")',
        code: 'VOICE_NO_AUDIO_FILE',
      });
    }

    // Validate the audio MIME type BEFORE buffering anything, so a wrong file
    // gets an honest 415 instead of a confusing STT/provider failure downstream.
    const mime = (data.mimetype ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!SUPPORTED_AUDIO_MIMETYPES.has(mime)) {
      // Discard the unread stream so the connection stays reusable.
      data.file.resume();
      return reply.status(415).send({
        error: `Unsupported audio type "${mime || 'unknown'}". Send one of: ${[...SUPPORTED_AUDIO_MIMETYPES].sort().join(', ')}`,
        code: 'VOICE_UNSUPPORTED_AUDIO_TYPE',
      });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err) {
      // @fastify/multipart truncates over-limit files and throws
      // FST_REQ_FILE_TOO_LARGE when the buffer is consumed.
      if ((err as { code?: string } | null)?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({
          error: `Audio file too large (max ${VOICE_MAX_AUDIO_BYTES / (1024 * 1024)} MB)`,
          code: 'VOICE_AUDIO_TOO_LARGE',
        });
      }
      throw err;
    }
    if (buffer.length === 0) {
      return reply.status(400).send({
        error: 'Uploaded audio file is empty',
        code: 'VOICE_EMPTY_AUDIO',
      });
    }

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
