// ============================================================================
// Voice Intent Bridge - Connects STT to CrossAppOrchestrator
// ============================================================================

import type { SpeechToTextService } from './speech-to-text';
import type { TranscriptionResult } from './types';
import type { WorkflowResult } from '@quant/quant-tools';

/**
 * Minimal interface for what VoiceIntentBridge uses from the orchestrator.
 * Matches the processNaturalLanguage method on CrossAppOrchestrator.
 */
export interface NaturalLanguageOrchestrator {
  processNaturalLanguage(
    input: string,
    options: { userId: string; sessionId: string },
  ): Promise<WorkflowResult>;
}

export interface VoiceIntentResult {
  transcript: string;
  plan: {
    id: string;
    steps: Array<{ stepId: string; toolId: string; params: Record<string, unknown> }>;
    description: string;
  };
  results: Array<{ success: boolean; data: unknown; toolId: string; error?: string }>;
  totalLatencyMs: number;
}

export type VoiceBridgeEventType = 'transcribing' | 'planning' | 'executing' | 'complete' | 'error';

export interface VoiceBridgeEvent {
  type: VoiceBridgeEventType;
  timestamp: number;
  data?: unknown;
}

export type VoiceBridgeListener = (event: VoiceBridgeEvent) => void;

/**
 * VoiceIntentBridge connects SpeechToTextService to the CrossAppOrchestrator.
 * The orchestrator parameter accepts any object implementing the NaturalLanguageOrchestrator
 * interface (e.g., CrossAppOrchestrator from @quant/quant-tools).
 */
export class VoiceIntentBridge {
  private stt: SpeechToTextService;
  private orchestrator: NaturalLanguageOrchestrator;
  private listeners: VoiceBridgeListener[] = [];

  constructor(stt: SpeechToTextService, orchestrator: NaturalLanguageOrchestrator) {
    this.stt = stt;
    this.orchestrator = orchestrator;
  }

  on(listener: VoiceBridgeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async processVoiceCommand(
    audio: Buffer,
    userId: string,
    sessionId: string,
  ): Promise<VoiceIntentResult> {
    const startTime = performance.now();

    // Transcribe
    this.emit({ type: 'transcribing', timestamp: Date.now() });
    let transcription: TranscriptionResult;
    try {
      transcription = await this.stt.transcribe(audio);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Transcription failed';
      this.emit({ type: 'error', timestamp: Date.now(), data: { error } });
      throw new Error(`Transcription failed: ${error}`);
    }

    const transcript = transcription.text;

    // Plan and execute via orchestrator
    this.emit({ type: 'planning', timestamp: Date.now(), data: { transcript } });

    this.emit({ type: 'executing', timestamp: Date.now() });
    const workflowResult = await this.orchestrator.processNaturalLanguage(transcript, {
      userId,
      sessionId,
    });

    const totalLatencyMs = performance.now() - startTime;

    const result: VoiceIntentResult = {
      transcript,
      plan: {
        id: workflowResult.plan?.id ?? `plan-${Date.now()}`,
        steps: (workflowResult.plan?.steps ?? []).map(
          (s: { stepId: string; toolId: string; params: Record<string, unknown> }) => ({
            stepId: s.stepId,
            toolId: s.toolId,
            params: s.params,
          }),
        ),
        description: workflowResult.plan?.description ?? '',
      },
      results: (workflowResult.results ?? []).map(
        (r: { success: boolean; data: unknown; toolId: string; error?: string }) => ({
          success: r.success,
          data: r.data,
          toolId: r.toolId,
          error: r.error,
        }),
      ),
      totalLatencyMs,
    };

    this.emit({ type: 'complete', timestamp: Date.now(), data: result });
    return result;
  }

  private emit(event: VoiceBridgeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
