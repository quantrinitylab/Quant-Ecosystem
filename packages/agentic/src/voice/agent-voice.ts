// ============================================================================
// Agentic - Voice Interface
// ============================================================================
//
// Dual-mode voice service:
//   - When a voice backend is configured (OPENAI_API_KEY, optionally overriding
//     the endpoints with AGENT_TTS_URL / AGENT_STT_URL) real text-to-speech and
//     speech-to-text are performed against the provider over HTTP.
//   - Otherwise (or on backend error) the service degrades to a safe, functional
//     fallback (empty audio buffer / placeholder transcription) so local
//     development and tests keep working. Errors falling back are logged as
//     warnings (never silently swallowed). Voice is not a money path, so graceful
//     degradation is acceptable here.

import { logger } from '@quant/common';

export interface VoiceConfig {
  language: string;
  voice: string;
  speed: number;
}

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  language: 'en',
  voice: 'alloy',
  speed: 1.0,
};

/**
 * Pluggable voice backend. A real implementation talks to an external TTS/STT
 * provider; tests can supply a fake to exercise the real-mode path without
 * touching the network.
 */
export interface VoiceBackend {
  /** Synthesize speech audio for the given text. */
  synthesize(text: string, config: VoiceConfig): Promise<Buffer>;
  /** Transcribe an audio buffer into text. */
  transcribe(audio: Buffer): Promise<string>;
}

/**
 * Real OpenAI-compatible voice backend.
 *
 * - Text-to-speech POSTs JSON to the audio/speech endpoint and reads the binary
 *   audio response.
 * - Speech-to-text POSTs multipart form-data to the audio/transcriptions
 *   (Whisper) endpoint and reads the `text` field of the JSON response.
 *
 * Enabled by OPENAI_API_KEY. The endpoints may be overridden via AGENT_TTS_URL
 * and AGENT_STT_URL (useful for self-hosted / proxy deployments).
 */
export class OpenAIVoiceBackend implements VoiceBackend {
  private readonly apiKey: string;
  private readonly ttsUrl: string;
  private readonly sttUrl: string;
  private readonly ttsModel: string;
  private readonly sttModel: string;

  constructor(
    apiKey: string,
    options?: { ttsUrl?: string; sttUrl?: string; ttsModel?: string; sttModel?: string },
  ) {
    this.apiKey = apiKey;
    this.ttsUrl = options?.ttsUrl ?? 'https://api.openai.com/v1/audio/speech';
    this.sttUrl = options?.sttUrl ?? 'https://api.openai.com/v1/audio/transcriptions';
    this.ttsModel = options?.ttsModel ?? 'tts-1';
    this.sttModel = options?.sttModel ?? 'whisper-1';
  }

  async synthesize(text: string, config: VoiceConfig): Promise<Buffer> {
    const res = await fetch(this.ttsUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.ttsModel,
        input: text,
        voice: config.voice,
        speed: config.speed,
      }),
    });
    if (!res.ok) {
      throw new Error(`TTS provider error: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async transcribe(audio: Buffer): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([audio]), 'audio');
    form.append('model', this.sttModel);

    const res = await fetch(this.sttUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`STT provider error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { text?: string };
    return data.text ?? '';
  }
}

export class AgentVoiceInterface {
  private readonly config: VoiceConfig;
  private readonly backend: VoiceBackend | null;

  /**
   * @param config Voice configuration (language/voice/speed).
   * @param backend Optional explicit backend (primarily for tests). When
   *   omitted, a real backend is constructed from environment configuration.
   */
  constructor(config: Partial<VoiceConfig> = {}, backend?: VoiceBackend) {
    this.config = { ...DEFAULT_VOICE_CONFIG, ...config };
    this.backend = backend ?? AgentVoiceInterface.createBackendFromEnv();
  }

  private static createBackendFromEnv(): VoiceBackend | null {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      return null;
    }
    const ttsUrl = process.env['AGENT_TTS_URL'];
    const sttUrl = process.env['AGENT_STT_URL'];
    return new OpenAIVoiceBackend(apiKey, {
      ...(ttsUrl ? { ttsUrl } : {}),
      ...(sttUrl ? { sttUrl } : {}),
    });
  }

  /** Whether a real voice backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  async textToSpeech(text: string): Promise<Buffer> {
    if (this.backend) {
      try {
        return await this.backend.synthesize(text, this.config);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`[agent-voice] TTS backend failed, returning empty audio: ${message}`);
      }
    }

    // Fallback: no audio synthesized.
    logger.log(`[Voice] Converting to speech: ${text.substring(0, 50)}...`);
    return Buffer.from([]);
  }

  async speechToText(audioBuffer: Buffer): Promise<string> {
    if (this.backend) {
      try {
        return await this.backend.transcribe(audioBuffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[agent-voice] STT backend failed, returning placeholder transcription: ${message}`,
        );
      }
    }

    // Fallback: placeholder transcription.
    logger.log(`[Voice] Converting speech to text...`);
    return 'This is a placeholder transcription';
  }

  async processVoiceCommand(audioBuffer: Buffer, agentId: string): Promise<any> {
    const text = await this.speechToText(audioBuffer);

    // Send to agent for processing
    return {
      transcription: text,
      response: `Agent ${agentId} processed: ${text}`,
    };
  }
}

export const voiceInterface = new AgentVoiceInterface();
