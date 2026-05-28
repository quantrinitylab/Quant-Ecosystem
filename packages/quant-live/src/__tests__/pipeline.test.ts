import { describe, it, expect, vi } from 'vitest';
import { LivePipeline } from '../core/pipeline.js';
import { LatencyTracker } from '../core/latency-tracker.js';
import type { ASRProvider, ASRResult, AudioChunk, LiveSession, TTSProvider } from '../types.js';

function createMockSession(): LiveSession {
  return {
    id: 'test-session',
    state: 'listening',
    createdAt: Date.now(),
    config: {
      asrProvider: 'whisper-server',
      vadConfig: { threshold: 0.01, silenceDuration: 500, minSpeechDuration: 100 },
      enableInterruption: true,
      maxSessionDuration: 300000,
      language: 'en',
    },
    transcript: [],
  };
}

function createMockProvider(): ASRProvider & { triggerResult: (r: ASRResult) => void } {
  let resultCb: ((r: ASRResult) => void) | null = null;
  return {
    start: vi.fn(),
    stop: vi.fn(),
    feedAudio: vi.fn(),
    onResult(cb) {
      resultCb = cb;
    },
    onError: vi.fn(),
    triggerResult(r: ASRResult) {
      resultCb?.(r);
    },
  };
}

describe('LivePipeline', () => {
  it('starts and registers with the ASR provider', () => {
    const pipeline = new LivePipeline();
    const provider = createMockProvider();
    const session = createMockSession();

    pipeline.start(session, provider);
    expect(provider.start).toHaveBeenCalled();
    expect(pipeline.isRunning()).toBe(true);
  });

  it('stops the pipeline and provider', () => {
    const pipeline = new LivePipeline();
    const provider = createMockProvider();
    pipeline.start(createMockSession(), provider);
    pipeline.stop();
    expect(provider.stop).toHaveBeenCalled();
    expect(pipeline.isRunning()).toBe(false);
  });

  it('feeds audio to the ASR provider', () => {
    const pipeline = new LivePipeline();
    const provider = createMockProvider();
    pipeline.start(createMockSession(), provider);

    const chunk: AudioChunk = {
      data: new Float32Array([0.1, 0.2]),
      sampleRate: 16000,
      channels: 1,
      timestamp: 0,
      duration: 20,
    };
    pipeline.feedAudio(chunk);
    expect(provider.feedAudio).toHaveBeenCalledWith(chunk);
  });

  it('does not feed audio when not running', () => {
    const pipeline = new LivePipeline();
    const provider = createMockProvider();
    pipeline.start(createMockSession(), provider);
    pipeline.stop();

    const chunk: AudioChunk = {
      data: new Float32Array([0.1]),
      sampleRate: 16000,
      channels: 1,
      timestamp: 0,
      duration: 10,
    };
    (provider.feedAudio as ReturnType<typeof vi.fn>).mockClear();
    pipeline.feedAudio(chunk);
    expect(provider.feedAudio).not.toHaveBeenCalled();
  });

  it('calls transcript callbacks when ASR produces results', () => {
    const pipeline = new LivePipeline();
    const provider = createMockProvider();
    const transcriptCb = vi.fn();
    pipeline.onTranscript(transcriptCb);
    pipeline.start(createMockSession(), provider);

    const result: ASRResult = {
      segments: [
        {
          id: 'seg-1',
          speaker: 'user',
          text: 'hello',
          startTime: 0,
          endTime: 100,
          confidence: 0.95,
          isFinal: true,
        },
      ],
      isFinal: true,
      latencyMs: 50,
    };
    provider.triggerResult(result);
    expect(transcriptCb).toHaveBeenCalledWith(result.segments);
  });

  it('tracks latency when feeding audio and receiving ASR results', () => {
    const tracker = new LatencyTracker();
    const pipeline = new LivePipeline(tracker);
    const provider = createMockProvider();
    pipeline.start(createMockSession(), provider);

    const chunk: AudioChunk = {
      data: new Float32Array([0.1]),
      sampleRate: 16000,
      channels: 1,
      timestamp: 0,
      duration: 10,
    };
    pipeline.feedAudio(chunk);

    // Trigger ASR result to end the segment measurement
    const result: ASRResult = {
      segments: [
        {
          id: 'seg-1',
          speaker: 'user',
          text: 'test',
          startTime: 0,
          endTime: 10,
          confidence: 0.9,
          isFinal: true,
        },
      ],
      isFinal: true,
      latencyMs: 20,
    };
    provider.triggerResult(result);

    const metrics = tracker.getMetrics('asr');
    expect(metrics).toBeDefined();
    expect(metrics!.samples).toBe(1);
    expect(metrics!.lastValue).toBeGreaterThanOrEqual(0);
  });

  it('groups multiple chunks into a single segment measurement', () => {
    const tracker = new LatencyTracker();
    const pipeline = new LivePipeline(tracker);
    const provider = createMockProvider();
    pipeline.start(createMockSession(), provider);

    // Feed multiple chunks (all part of one segment)
    for (let i = 0; i < 5; i++) {
      const chunk: AudioChunk = {
        data: new Float32Array([0.1]),
        sampleRate: 16000,
        channels: 1,
        timestamp: i * 20,
        duration: 20,
      };
      pipeline.feedAudio(chunk);
    }

    // One result ends the segment
    const result: ASRResult = {
      segments: [
        {
          id: 'seg-1',
          speaker: 'user',
          text: 'hello world',
          startTime: 0,
          endTime: 100,
          confidence: 0.95,
          isFinal: true,
        },
      ],
      isFinal: true,
      latencyMs: 50,
    };
    provider.triggerResult(result);

    const metrics = tracker.getMetrics('asr');
    expect(metrics).toBeDefined();
    // Only 1 measurement even though 5 chunks were fed
    expect(metrics!.samples).toBe(1);
  });

  it('synthesizeResponse tracks TTS latency and emits audio chunks', async () => {
    const tracker = new LatencyTracker();
    const pipeline = new LivePipeline(tracker);
    const provider = createMockProvider();
    pipeline.start(createMockSession(), provider);

    const chunks: AudioChunk[] = [
      { data: new Float32Array([0.1]), sampleRate: 16000, channels: 1, timestamp: 0, duration: 20 },
      {
        data: new Float32Array([0.2]),
        sampleRate: 16000,
        channels: 1,
        timestamp: 20,
        duration: 20,
      },
      {
        data: new Float32Array([0.3]),
        sampleRate: 16000,
        channels: 1,
        timestamp: 40,
        duration: 20,
      },
    ];

    const mockTTSProvider: TTSProvider = {
      isStreaming: true,
      synthesize: vi.fn().mockReturnValue(
        (async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        })(),
      ),
      stop: vi.fn(),
    };

    pipeline.setTTSProvider(mockTTSProvider);

    const receivedChunks: AudioChunk[] = [];
    pipeline.onAudioOut((chunk) => receivedChunks.push(chunk));

    await pipeline.synthesizeResponse('Hello world');

    // All chunks were emitted
    expect(receivedChunks).toHaveLength(3);
    expect(receivedChunks[0]).toBe(chunks[0]);
    expect(receivedChunks[1]).toBe(chunks[1]);
    expect(receivedChunks[2]).toBe(chunks[2]);

    // TTS latency was tracked (endMeasure called exactly once)
    const metrics = tracker.getMetrics('tts');
    expect(metrics).toBeDefined();
    expect(metrics!.samples).toBe(1);
    expect(metrics!.lastValue).toBeGreaterThanOrEqual(0);

    // Pipeline is no longer speaking
    expect(pipeline.isSpeaking()).toBe(false);
  });
});
