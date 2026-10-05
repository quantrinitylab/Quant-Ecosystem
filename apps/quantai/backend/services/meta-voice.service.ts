// ============================================================================
// QuantAI Backend — Meta Voice STT Service
// ============================================================================
// Real speech-to-text via Meta Muse Voice Transcribe (muse-voice-transcribe-1.0)
// on the same META_API_KEY used for chat (muse-spark-1.3).
//
// Endpoint: POST https://api.meta.ai/v1/asr/transcribe
// Auth:     Authorization: Bearer <META_API_KEY>
// Audio:    mono 16-bit PCM WAV @ 16 or 24 kHz (32 MB / 10 min caps)
//

export const META_STT_URL = 'https://api.meta.ai/v1/asr/transcribe';
export const META_STT_MODEL = 'muse-voice-transcribe-1.0';
export const META_STT_MAX_BYTES = 32 * 1024 * 1024; // 32 MB

export interface MetaSTTResult {
  text: string;
  provider: 'meta';
  model: string;
  durationMs: number;
}

export class MetaVoiceSTTError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'MetaVoiceSTTError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, MetaVoiceSTTError.prototype);
  }
}

function getApiKey(): string {
  const key = process.env['META_API_KEY'] ?? process.env['META_AI_API_KEY'];
  if (!key) {
    throw new MetaVoiceSTTError(
      'META_API_KEY not configured. Set the environment variable to use Meta voice STT.',
      503,
    );
  }
  return key;
}

/** Whether Meta STT is configured (key present). */
export function isMetaSTTConfigured(): boolean {
  return Boolean(process.env['META_API_KEY'] ?? process.env['META_AI_API_KEY']);
}

/**
 * Transcribe a mono 16-bit PCM WAV buffer via Meta Muse Voice Transcribe.
 * The caller is responsible for providing WAV @ 16/24 kHz (see frontend
 * useVoiceCapture hook, which records PCM and encodes WAV in-browser).
 */
export async function transcribeWithMeta(wavBuffer: Buffer): Promise<MetaSTTResult> {
  const started = Date.now();
  if (!wavBuffer || wavBuffer.length === 0) {
    throw new MetaVoiceSTTError('Empty audio buffer', 400);
  }
  if (wavBuffer.length > META_STT_MAX_BYTES) {
    throw new MetaVoiceSTTError(
      `Audio too large (${wavBuffer.length} bytes, max ${META_STT_MAX_BYTES})`,
      400,
    );
  }
  // Basic WAV sanity check (RIFF....WAVE)
  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new MetaVoiceSTTError('Audio must be a WAV file (RIFF/WAVE)', 400);
  }

  const apiKey = getApiKey();
  const model = process.env['META_VOICE_MODEL'] ?? META_STT_MODEL;

  // Meta requires a JSON `request` part + binary `audio` part.
  const form = new FormData();
  form.append(
    'request',
    new Blob([JSON.stringify({ model, audioEncoding: 'WAV' })], {
      type: 'application/json',
    }),
  );
  form.append('audio', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'audio.wav');

  let res: Response;
  try {
    res = await fetch(META_STT_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (err) {
    throw new MetaVoiceSTTError(
      `Meta STT network error: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new MetaVoiceSTTError(
      `Meta STT error ${res.status}: ${detail.slice(0, 300) || res.statusText}`,
      res.status >= 500 ? 502 : res.status,
    );
  }

  // Response shape (verified live): { transcript, audioDurationMs, turns[], sessionId }
  const data = (await res.json().catch(() => ({}))) as {
    transcript?: unknown;
    text?: unknown;
  };
  const text =
    (typeof data.transcript === 'string' && data.transcript) ||
    (typeof data.text === 'string' && data.text) ||
    '';

  return {
    text: text.trim(),
    provider: 'meta',
    model,
    durationMs: Date.now() - started,
  };
}
