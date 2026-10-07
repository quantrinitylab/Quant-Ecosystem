// ============================================================================
// Voice Interface - Barrel Export
// ============================================================================

export { SpeechToTextService } from './speech-to-text';
export { TextToSpeechService } from './text-to-speech';
export { VoiceCommander } from './voice-commander';
export { VoiceIntentBridge } from './voice-intent-bridge';
export type {
  VoiceIntentResult,
  VoiceBridgeEventType,
  VoiceBridgeEvent,
  VoiceBridgeListener,
} from './voice-intent-bridge';
export type {
  VoiceConfig,
  TranscriptionResult,
  TranscriptionSegment,
  TTSRequest,
  TTSResponse,
  VoiceCommand,
} from './types';
export type { VoiceCommandResult } from './voice-commander';
