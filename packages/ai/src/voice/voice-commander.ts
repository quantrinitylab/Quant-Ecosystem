// ============================================================================
// Voice Interface - Voice Commander
// ============================================================================

import type { UniversalAssistant } from '../assistant/assistant';
import type { AssistantContext } from '../assistant/types';
import type { SpeechToTextService } from './speech-to-text';
import type { TextToSpeechService } from './text-to-speech';

/** Voice command processing result */
export interface VoiceCommandResult {
  textResponse: string;
  audioResponse?: Buffer;
}

/**
 * VoiceCommander processes voice commands through the Universal AI Assistant.
 * It transcribes audio, sends to the assistant, and optionally synthesizes a response.
 */
export class VoiceCommander {
  private assistant: UniversalAssistant;
  private stt: SpeechToTextService;
  private tts: TextToSpeechService;

  constructor(assistant: UniversalAssistant, stt: SpeechToTextService, tts: TextToSpeechService) {
    this.assistant = assistant;
    this.stt = stt;
    this.tts = tts;
  }

  /**
   * Process a voice command: transcribe -> assistant -> synthesize response
   */
  async processVoiceCommand(audio: Buffer, context: AssistantContext): Promise<VoiceCommandResult> {
    // Step 1: Transcribe audio to text
    const transcription = await this.stt.transcribe(audio);

    // Step 2: Process through assistant
    const response = await this.assistant.processMessage(transcription.text, context);

    // Step 3: Synthesize response audio
    const audioResponse = await this.tts.synthesize(response.message);

    return {
      textResponse: response.message,
      audioResponse,
    };
  }
}
