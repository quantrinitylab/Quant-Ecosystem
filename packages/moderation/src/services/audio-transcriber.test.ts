import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AudioTranscriber,
  OpenAIWhisperProvider,
  MockWhisperProvider,
  createWhisperProviderFromEnv,
} from './audio-transcriber';

describe('AudioTranscriber', () => {
  it('delegates a URL input straight to the provider', async () => {
    const provider = new MockWhisperProvider({ text: 'hello world' });
    const transcriber = new AudioTranscriber(provider);
    const result = await transcriber.transcribe('https://cdn.example.com/a.mp3');
    expect(result.text).toBe('hello world');
    expect(provider.transcribeCalls).toHaveLength(1);
  });

  it('chunks large buffers and offsets segment timestamps', async () => {
    const provider = new MockWhisperProvider({
      text: 'chunk',
      duration: 10,
      segments: [{ start: 0, end: 5, text: 'chunk', confidence: 0.9 }],
    });
    const transcriber = new AudioTranscriber(provider, { maxChunkSize: 4 });
    const result = await transcriber.transcribe(Buffer.from('abcdefghij')); // 10 bytes -> 3 chunks
    expect(provider.transcribeCalls.length).toBe(3);
    // Second chunk segment should be offset by the first chunk's duration (10)
    expect(result.segments[1]!.start).toBe(10);
    expect(result.duration).toBe(30);
  });
});

describe('OpenAIWhisperProvider (real API shape)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts multipart form data and parses verbose_json segments', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        text: 'flagged content here',
        language: 'en',
        duration: 12.5,
        segments: [{ start: 0, end: 4, text: 'flagged content here', avg_logprob: -0.2 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAIWhisperProvider('sk-test');
    const result = await provider.transcribe(Buffer.from('audio-bytes'));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/audio/transcriptions');
    expect(init.headers.authorization).toBe('Bearer sk-test');
    expect(result.text).toBe('flagged content here');
    expect(result.segments[0]!.confidence).toBeGreaterThan(0);
    expect(result.segments[0]!.confidence).toBeLessThanOrEqual(1);
    expect(result.duration).toBe(12.5);
  });

  it('throws on a non-ok API response (no silent empty transcript)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    );
    const provider = new OpenAIWhisperProvider('sk-test');
    await expect(provider.transcribe(Buffer.from('x'))).rejects.toThrow('Whisper API error');
  });
});

describe('createWhisperProviderFromEnv', () => {
  const original = process.env['OPENAI_API_KEY'];
  afterEach(() => {
    if (original === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = original;
  });

  it('returns null when OPENAI_API_KEY is not set', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(createWhisperProviderFromEnv()).toBeNull();
  });

  it('returns a real provider when OPENAI_API_KEY is set', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    expect(createWhisperProviderFromEnv()).toBeInstanceOf(OpenAIWhisperProvider);
  });
});
