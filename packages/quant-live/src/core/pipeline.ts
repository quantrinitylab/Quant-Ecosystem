import type {
  ASRProvider,
  ASRResult,
  AudioChunk,
  LiveSession,
  TTSProvider,
  TranscriptSegment,
} from '../types.js';
import { LatencyTracker } from './latency-tracker.js';
import { PrefetchBuffer } from '../tts/prefetch-buffer.js';

type TranscriptCallback = (segments: TranscriptSegment[]) => void;
type ResponseCallback = (text: string) => void;
type AudioOutCallback = (chunk: AudioChunk) => void;

/**
 * Orchestrates audio input through ASR and tracks per-segment latency.
 *
 * Latency is measured per speech segment rather than per chunk. A measurement
 * starts when the first audio chunk arrives (or when a new segment begins after
 * a previous result) and ends when the ASR provider emits a result. This avoids
 * orphaned measurements that would accumulate if tracked per-chunk, since
 * streaming ASR aggregates multiple chunks into single results.
 */
export class LivePipeline {
  private asrProvider: ASRProvider | null = null;
  private ttsProvider: TTSProvider | null = null;
  private transcriptCallbacks: TranscriptCallback[] = [];
  private responseCallbacks: ResponseCallback[] = [];
  private audioOutCallbacks: AudioOutCallback[] = [];
  private running = false;
  private segmentId = 0;
  private ttsSegmentId = 0;
  private segmentMeasureActive = false;
  private speaking = false;
  private prefetchBuffer: PrefetchBuffer | null = null;
  readonly latencyTracker: LatencyTracker;

  constructor(latencyTracker?: LatencyTracker) {
    this.latencyTracker = latencyTracker ?? new LatencyTracker();
  }

  start(_session: LiveSession, provider: ASRProvider): void {
    this.asrProvider = provider;
    this.running = true;

    this.asrProvider.onResult((result: ASRResult) => {
      this.handleASRResult(result);
    });

    this.asrProvider.start();
  }

  stop(): void {
    if (this.asrProvider) {
      this.asrProvider.stop();
    }
    this.handleInterruption();
    this.running = false;
    this.asrProvider = null;
    this.segmentMeasureActive = false;
  }

  setTTSProvider(provider: TTSProvider): void {
    this.ttsProvider = provider;
  }

  async synthesizeResponse(text: string): Promise<void> {
    if (!this.ttsProvider) return;

    const measureId = `tts-segment-${this.ttsSegmentId++}`;
    this.latencyTracker.startMeasure('tts', measureId);
    this.speaking = true;

    const stream = this.ttsProvider.synthesize(text);
    this.prefetchBuffer = new PrefetchBuffer(stream);

    let firstChunk = true;
    try {
      for await (const chunk of this.prefetchBuffer) {
        if (!this.speaking) break;
        if (firstChunk) {
          this.latencyTracker.endMeasure('tts', measureId);
          firstChunk = false;
        }
        for (const cb of this.audioOutCallbacks) {
          cb(chunk);
        }
      }
    } finally {
      this.speaking = false;
      this.prefetchBuffer = null;
      // End measure if no chunks arrived
      if (firstChunk) {
        try {
          this.latencyTracker.endMeasure('tts', measureId);
        } catch {
          // Already ended or no pending measurement
        }
      }
    }
  }

  handleInterruption(): void {
    if (this.prefetchBuffer) {
      this.prefetchBuffer.cancel();
    }
    if (this.ttsProvider) {
      this.ttsProvider.stop();
    }
    this.speaking = false;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  feedAudio(chunk: AudioChunk): void {
    if (!this.running || !this.asrProvider) {
      return;
    }

    // Start a measurement for the current segment if one is not already active.
    // The measurement ends when the ASR provider delivers a result.
    if (!this.segmentMeasureActive) {
      this.latencyTracker.startMeasure('asr', `segment-${this.segmentId}`);
      this.segmentMeasureActive = true;
    }

    this.asrProvider.feedAudio(chunk);
  }

  onTranscript(cb: TranscriptCallback): void {
    this.transcriptCallbacks.push(cb);
  }

  onResponse(cb: ResponseCallback): void {
    this.responseCallbacks.push(cb);
  }

  onAudioOut(cb: AudioOutCallback): void {
    this.audioOutCallbacks.push(cb);
  }

  isRunning(): boolean {
    return this.running;
  }

  getResponseCallbacks(): ResponseCallback[] {
    return this.responseCallbacks;
  }

  getAudioOutCallbacks(): AudioOutCallback[] {
    return this.audioOutCallbacks;
  }

  private handleASRResult(result: ASRResult): void {
    // End the per-segment latency measurement
    if (this.segmentMeasureActive) {
      this.latencyTracker.endMeasure('asr', `segment-${this.segmentId}`);
      this.segmentMeasureActive = false;
      this.segmentId++;
    }

    for (const cb of this.transcriptCallbacks) {
      cb(result.segments);
    }
  }
}
