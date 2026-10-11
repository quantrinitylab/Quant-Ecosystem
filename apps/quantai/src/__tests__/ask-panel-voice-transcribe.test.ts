// ============================================================================
// transcribeVoiceAudio — honest STT helper for AskQuantPanel (F-044)
// ============================================================================
// Deep unit tests: every failure path must throw an honest, user-facing
// error — never a fabricated transcript, never a silent drop.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

const { apiFetchRaw } = await import('@quant/api-client');
const { transcribeVoiceAudio, MAX_VOICE_UPLOAD_BYTES } = await import(
  '../lib/voice-transcribe'
);

const mockFetch = apiFetchRaw as unknown as ReturnType<typeof vi.fn>;

function wavBlob(size = 1024): Blob {
  return new Blob([new Uint8Array(size)], { type: 'audio/wav' });
}

function okResponse(text: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ text }),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('transcribeVoiceAudio', () => {
  it('returns the trimmed transcript on success', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('  send email to bob  '));
    await expect(transcribeVoiceAudio(wavBlob())).resolves.toBe('send email to bob');
  });

  it('POSTs multipart FormData with the audio as field "file" to /api/voice/stt', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('hello'));
    const audio = wavBlob();
    await transcribeVoiceAudio(audio);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockFetch.mock.calls[0] as [string, { body: unknown; method: string }];
    expect(path).toBe('/api/voice/stt');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const file = (init.body as FormData).get('file') as Blob;
    expect(file).toBeInstanceOf(Blob);
    expect(file.size).toBe(audio.size);
  });

  it('throws an honest error for a null capture (empty recording)', async () => {
    await expect(transcribeVoiceAudio(null)).rejects.toThrow('No audio captured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws an honest error for a zero-byte blob', async () => {
    await expect(transcribeVoiceAudio(new Blob([]))).rejects.toThrow('No audio captured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws an honest error for oversized audio without uploading', async () => {
    const big = new Blob([new Uint8Array(MAX_VOICE_UPLOAD_BYTES + 1)]);
    await expect(transcribeVoiceAudio(big)).rejects.toThrow('too long');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces the server error message when STT is not configured (503)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Voice backend unreachable' }),
    } as unknown as Response);
    await expect(transcribeVoiceAudio(wavBlob())).rejects.toThrow(
      'Transcription failed: Voice backend unreachable',
    );
  });

  it('falls back to the status code when the error body is unreadable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response);
    await expect(transcribeVoiceAudio(wavBlob())).rejects.toThrow(
      'Transcription failed (server returned 500)',
    );
  });

  it('throws when the server returns ok but no transcript text', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(undefined));
    await expect(transcribeVoiceAudio(wavBlob())).rejects.toThrow(
      'Transcription failed (server returned 200)',
    );
  });

  it('throws an honest error when the transcript is blank (nothing heard)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('   '));
    await expect(transcribeVoiceAudio(wavBlob())).rejects.toThrow("Couldn't hear any speech");
  });

  it('wraps network failures in an honest message', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(transcribeVoiceAudio(wavBlob())).rejects.toThrow(
      'Could not reach the transcription service: fetch failed',
    );
  });
});
