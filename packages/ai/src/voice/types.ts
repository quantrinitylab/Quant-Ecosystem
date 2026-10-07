// ============================================================================
// Voice Interface - Types and Interfaces
// ============================================================================

/** Configuration for voice services */
export interface VoiceConfig {
  apiKey: string;
  model?: string;
  defaultVoice?: string;
  defaultSpeed?: number;
  language?: string;
}

/** Result of audio transcription */
export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
}

/** A segment within a transcription */
export interface TranscriptionSegment {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

/** Request for text-to-speech synthesis */
export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac';
}

/** Response from text-to-speech synthesis */
export interface TTSResponse {
  audio: Buffer;
  format: string;
  duration: number;
}

/** Voice command input */
export interface VoiceCommand {
  audio: Buffer;
  language?: string;
  context?: Record<string, unknown>;
}
