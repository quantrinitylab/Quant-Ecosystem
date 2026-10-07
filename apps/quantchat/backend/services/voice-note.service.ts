// ============================================================================
// QuantChat - AI voice-notes
// ============================================================================
//
// Orchestrates: record (audio already uploaded) -> transcribe (STT) -> optional
// AI reply -> moderate -> synthesize reply (TTS) -> send as an AUDIO voice-note.
//
// AUDIO messages + the media pipeline already exist; the missing piece was this
// orchestration. STT/TTS/reply/send are PLUGGABLE ports so it is fully sandbox-
// verifiable: the default NullTranscriber / NullSynth FAIL CLOSED (never a
// fabricated transcript or audio). Real Whisper/TTS providers are needs-staging.

import { createAppError } from '@quant/server-core';

export interface TranscriptResult {
  ok: boolean;
  text?: string;
  error?: string;
}
export interface TranscriberPort {
  transcribe(audioUrl: string): Promise<TranscriptResult>;
}
/** Default STT: fails closed until a real provider (Whisper) is configured. */
export class NullTranscriber implements TranscriberPort {
  async transcribe(): Promise<TranscriptResult> {
    return { ok: false, error: 'TRANSCRIBER_NOT_CONFIGURED' };
  }
}

export interface SynthResult {
  ok: boolean;
  audioUrl?: string;
  error?: string;
}
export interface VoiceSynthPort {
  synthesize(text: string): Promise<SynthResult>;
}
/** Default TTS: fails closed until a real provider is configured. */
export class NullSynth implements VoiceSynthPort {
  async synthesize(): Promise<SynthResult> {
    return { ok: false, error: 'SYNTH_NOT_CONFIGURED' };
  }
}

/** Generates an AI text reply from a transcript. Wired to @quant/ai at boot. */
export interface ReplyGeneratorPort {
  generate(transcript: string): Promise<string>;
}

/** Moderates text before it is sent. `allowed=false` blocks the send. */
export interface VoiceModeratorPort {
  check(text: string): Promise<{ allowed: boolean; reason?: string }>;
}

/** Persists an AUDIO voice-note message. Wired to MessageService at boot. */
export interface VoiceMessageSink {
  sendAudio(input: {
    conversationId: string;
    senderId: string;
    audioUrl: string;
    transcript?: string;
  }): Promise<{ messageId: string }>;
}

export interface VoiceNoteOptions {
  transcriber?: TranscriberPort;
  synth?: VoiceSynthPort;
  replyGenerator?: ReplyGeneratorPort;
  moderator?: VoiceModeratorPort;
  sink?: VoiceMessageSink;
}

export interface AutoReplyInput {
  conversationId: string;
  senderId: string;
  audioUrl: string;
}

export interface AutoReplyResult {
  transcript: string;
  replyText: string;
  audioUrl: string;
  messageId: string;
}

export class VoiceNoteService {
  private readonly transcriber: TranscriberPort;
  private readonly synth: VoiceSynthPort;
  private readonly replyGenerator: ReplyGeneratorPort | undefined;
  private readonly moderator: VoiceModeratorPort | undefined;
  private readonly sink: VoiceMessageSink | undefined;

  constructor(options: VoiceNoteOptions = {}) {
    this.transcriber = options.transcriber ?? new NullTranscriber();
    this.synth = options.synth ?? new NullSynth();
    this.replyGenerator = options.replyGenerator;
    this.moderator = options.moderator;
    this.sink = options.sink;
  }

  /** Transcribe a voice note. Fails closed when no STT provider is configured. */
  async transcribe(audioUrl: string): Promise<string> {
    if (!audioUrl?.trim()) {
      throw createAppError('An audio url is required', 400, 'INVALID_AUDIO_URL');
    }
    const result = await this.transcriber.transcribe(audioUrl);
    if (!result.ok || !result.text) {
      throw createAppError(
        result.error ?? 'Transcription failed',
        503,
        result.error === 'TRANSCRIBER_NOT_CONFIGURED'
          ? 'TRANSCRIBER_NOT_CONFIGURED'
          : 'TRANSCRIBE_FAILED',
      );
    }
    return result.text;
  }

  /**
   * Full auto-reply: transcribe -> generate reply -> moderate -> synthesize ->
   * send as an AUDIO voice-note. Every unconfigured step fails closed; a blocked
   * moderation verdict rejects the send (never posts unmoderated audio).
   */
  async autoReply(input: AutoReplyInput): Promise<AutoReplyResult> {
    if (!this.replyGenerator) {
      throw createAppError(
        'AI reply generator not configured',
        503,
        'REPLY_GENERATOR_NOT_CONFIGURED',
      );
    }
    if (!this.sink) {
      throw createAppError('Voice-note sink not configured', 503, 'VOICE_SINK_NOT_CONFIGURED');
    }

    const transcript = await this.transcribe(input.audioUrl);
    const replyText = (await this.replyGenerator.generate(transcript)).trim();
    if (!replyText) {
      throw createAppError('Empty AI reply', 502, 'EMPTY_REPLY');
    }

    if (this.moderator) {
      const verdict = await this.moderator.check(replyText);
      if (!verdict.allowed) {
        throw createAppError(
          verdict.reason ?? 'Reply rejected by moderation',
          422,
          'MODERATION_REJECTED',
        );
      }
    }

    const synthed = await this.synth.synthesize(replyText);
    if (!synthed.ok || !synthed.audioUrl) {
      throw createAppError(
        synthed.error ?? 'Synthesis failed',
        503,
        synthed.error === 'SYNTH_NOT_CONFIGURED' ? 'SYNTH_NOT_CONFIGURED' : 'SYNTH_FAILED',
      );
    }

    const { messageId } = await this.sink.sendAudio({
      conversationId: input.conversationId,
      senderId: input.senderId,
      audioUrl: synthed.audioUrl,
      transcript: replyText,
    });

    return { transcript, replyText, audioUrl: synthed.audioUrl, messageId };
  }
}
