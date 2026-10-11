/**
 * F-055 — POST /voice/stt multipart upload tests.
 *
 * Regression coverage for the root-cause fix: @fastify/multipart was never
 * registered on the QuantAI backend, so `request.file()` was undefined and
 * every real mic→STT upload 500'd. These tests register the plugin exactly
 * like backend/app.ts does (same VOICE_UPLOAD_LIMITS) and exercise the route
 * with REAL multipart bodies — no mocked request.file().
 *
 * Edge cases: empty multipart body, text-fields-only body, non-multipart
 * content-type, malformed boundary, oversized file (>10MB → 413), non-audio
 * MIME (→ 415), zero-byte file (→ 400). All error responses assert the
 * honest { error, code } shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

// ---------------------------------------------------------------------------
// Service-layer mocks. Only the surface used by routes/voice.ts is faked.
// ---------------------------------------------------------------------------
vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, status: number, code: string) => {
    const err = new Error(message) as Error & { statusCode: number; code: string };
    err.statusCode = status;
    err.code = code;
    return err;
  },
}));

const speechToText = vi.fn(async (buffer: Buffer) => `transcribed:${buffer.length}b`);
vi.mock('@quant/agentic', () => ({
  voiceInterface: {
    textToSpeech: vi.fn(),
    speechToText: (buffer: Buffer) => speechToText(buffer),
    isBackendConfigured: () => false,
    processVoiceCommand: vi.fn(),
  },
}));

vi.mock('../services/voiceover-tts.service', () => ({
  listAvailableVoices: vi.fn(() => []),
  synthesizeSpeech: vi.fn(),
  generateSsml: vi.fn(),
}));

const isMetaSTTConfigured = vi.fn(() => false);
const transcribeWithMeta = vi.fn(async (buffer: Buffer) => ({
  text: `meta:${buffer.length}b`,
  provider: 'meta' as const,
  model: 'muse-voice-transcribe-1.0',
  durationMs: 120,
}));
vi.mock('../services/meta-voice.service', () => ({
  isMetaSTTConfigured: () => isMetaSTTConfigured(),
  transcribeWithMeta: (buffer: Buffer) => transcribeWithMeta(buffer),
  MetaVoiceSTTError: class MetaVoiceSTTError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode = 500) {
      super(message);
      this.name = 'MetaVoiceSTTError';
      this.statusCode = statusCode;
    }
  },
}));

import voiceRoutes, {
  VOICE_UPLOAD_LIMITS,
  VOICE_MAX_AUDIO_BYTES,
  SUPPORTED_AUDIO_MIMETYPES,
} from '../routes/voice';

// ---------------------------------------------------------------------------
// Multipart body builder (no new deps — hand-rolled per RFC 7578).
// ---------------------------------------------------------------------------
interface TestPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer | string;
}

function buildMultipart(boundary: string, parts: TestPart[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'));
    let disposition = `Content-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) {
      disposition += `; filename="${part.filename}"`;
    }
    chunks.push(Buffer.from(`${disposition}\r\n`, 'utf8'));
    if (part.contentType) {
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`, 'utf8'));
    }
    chunks.push(Buffer.from('\r\n', 'utf8'));
    chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data, 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

// A minimal valid WAV header + a few samples — the route only checks the MIME
// type and byte length, never decodes the audio, so this is representative.
function fakeWavBytes(length = 1024): Buffer {
  const buf = Buffer.alloc(length);
  buf.write('RIFF', 0);
  buf.write('WAVE', 8);
  return buf;
}

const BOUNDARY = '----quantai-test-boundary-1234';

async function postStt(
  app: FastifyInstance,
  opts: { contentType: string; payload: Buffer | string | Record<string, unknown> },
) {
  return app.inject({
    method: 'POST',
    url: '/voice/stt',
    headers: { 'content-type': opts.contentType },
    payload: opts.payload,
  });
}

describe('POST /voice/stt — multipart upload (F-055)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    isMetaSTTConfigured.mockReturnValue(false);
    app = Fastify();
    // Same registration as backend/app.ts — the actual fix under test.
    await app.register(multipart, { limits: VOICE_UPLOAD_LIMITS });
    await app.register(voiceRoutes, { prefix: '/voice' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('performs a REAL multipart audio upload and transcribes it (200)', async () => {
    const audio = fakeWavBytes(2048);
    const payload = buildMultipart(BOUNDARY, [
      { name: 'file', filename: 'audio.wav', contentType: 'audio/wav', data: audio },
    ]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.text).toBe('transcribed:2048b');
    expect(body.provider).toBe('openai');
    // The STT backend received the exact bytes the client sent.
    expect(speechToText).toHaveBeenCalledTimes(1);
    const received: Buffer = speechToText.mock.calls[0]![0];
    expect(Buffer.compare(received, audio)).toBe(0);
  });

  it('accepts audio MIME variants browsers actually send (audio/webm;codecs=opus)', async () => {
    const payload = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename: 'recording.webm',
        contentType: 'audio/webm;codecs=opus',
        data: fakeWavBytes(512),
      },
    ]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().text).toBe('transcribed:512b');
  });

  it('prefers Meta STT when configured, passing the raw buffer through', async () => {
    isMetaSTTConfigured.mockReturnValue(true);
    const audio = fakeWavBytes(256);
    const payload = buildMultipart(BOUNDARY, [
      { name: 'file', filename: 'audio.wav', contentType: 'audio/wav', data: audio },
    ]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.text).toBe('meta:256b');
    expect(body.provider).toBe('meta');
    expect(body.model).toBe('muse-voice-transcribe-1.0');
    expect(transcribeWithMeta).toHaveBeenCalledTimes(1);
    expect(speechToText).not.toHaveBeenCalled();
  });

  it('returns 400 VOICE_NO_AUDIO_FILE for an empty multipart body', async () => {
    const payload = buildMultipart(BOUNDARY, []);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('VOICE_NO_AUDIO_FILE');
    expect(typeof body.error).toBe('string');
    expect(speechToText).not.toHaveBeenCalled();
  });

  it('returns 400 VOICE_NO_AUDIO_FILE when only text fields are present', async () => {
    const payload = buildMultipart(BOUNDARY, [{ name: 'note', data: 'hello' }]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VOICE_NO_AUDIO_FILE');
  });

  it('returns 400 (never 500) for a non-multipart content-type', async () => {
    const response = await postStt(app, {
      contentType: 'application/json',
      payload: { file: 'not-really-a-file' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VOICE_NO_AUDIO_FILE');
  });

  it('returns 400 (never 500) for a malformed multipart boundary', async () => {
    const payload = buildMultipart(BOUNDARY, [
      { name: 'file', filename: 'audio.wav', contentType: 'audio/wav', data: fakeWavBytes(128) },
    ]);

    const response = await postStt(app, {
      // The body was framed with BOUNDARY but the header declares another one.
      contentType: 'multipart/form-data; boundary=----wrong-boundary',
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('VOICE_NO_AUDIO_FILE');
    expect(typeof body.error).toBe('string');
  });

  it('rejects oversized audio with 413 VOICE_AUDIO_TOO_LARGE', async () => {
    const oversized = Buffer.alloc(VOICE_MAX_AUDIO_BYTES + 1024, 0x01);
    const payload = buildMultipart(BOUNDARY, [
      { name: 'file', filename: 'audio.wav', contentType: 'audio/wav', data: oversized },
    ]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(413);
    const body = response.json();
    expect(body.code).toBe('VOICE_AUDIO_TOO_LARGE');
    expect(body.error).toContain('10 MB');
    expect(speechToText).not.toHaveBeenCalled();
  }, 30000);

  it('rejects non-audio MIME types with an honest 415', async () => {
    const payload = buildMultipart(BOUNDARY, [
      {
        name: 'file',
        filename: 'evil.pdf',
        contentType: 'application/pdf',
        data: Buffer.from('%PDF-1.4 nope', 'utf8'),
      },
    ]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(415);
    const body = response.json();
    expect(body.code).toBe('VOICE_UNSUPPORTED_AUDIO_TYPE');
    expect(body.error).toContain('application/pdf');
    expect(speechToText).not.toHaveBeenCalled();
    expect(transcribeWithMeta).not.toHaveBeenCalled();
  });

  it('returns 400 VOICE_EMPTY_AUDIO for a zero-byte audio file', async () => {
    const payload = buildMultipart(BOUNDARY, [
      { name: 'file', filename: 'audio.wav', contentType: 'audio/wav', data: Buffer.alloc(0) },
    ]);

    const response = await postStt(app, {
      contentType: `multipart/form-data; boundary=${BOUNDARY}`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VOICE_EMPTY_AUDIO');
    expect(speechToText).not.toHaveBeenCalled();
  });

  it('every upload error shares the honest { error, code } shape', async () => {
    const cases: Array<{ contentType: string; payload: Buffer; status: number }> = [
      {
        contentType: `multipart/form-data; boundary=${BOUNDARY}`,
        payload: buildMultipart(BOUNDARY, []),
        status: 400,
      },
      {
        contentType: 'application/json',
        payload: Buffer.from('{}', 'utf8'),
        status: 400,
      },
      {
        contentType: `multipart/form-data; boundary=${BOUNDARY}`,
        payload: buildMultipart(BOUNDARY, [
          { name: 'file', filename: 'x.bin', contentType: 'application/octet-stream', data: Buffer.from([1, 2, 3]) },
        ]),
        status: 415,
      },
    ];

    for (const c of cases) {
      const response = await postStt(app, { contentType: c.contentType, payload: c.payload });
      expect(response.statusCode).toBe(c.status);
      const body = response.json();
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
      expect(typeof body.code).toBe('string');
      expect(body.code).toMatch(/^VOICE_/);
    }
  });

  it('upload limits stay in sync with the app registration constants', () => {
    // Guards against the route and backend/app.ts drifting apart (F-055).
    expect(VOICE_UPLOAD_LIMITS.fileSize).toBe(VOICE_MAX_AUDIO_BYTES);
    expect(VOICE_UPLOAD_LIMITS.files).toBe(1);
    expect(SUPPORTED_AUDIO_MIMETYPES.has('audio/wav')).toBe(true);
    expect(SUPPORTED_AUDIO_MIMETYPES.has('audio/webm')).toBe(true);
    expect(SUPPORTED_AUDIO_MIMETYPES.has('application/pdf')).toBe(false);
  });
});
