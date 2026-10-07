// ============================================================================
// QuantChat - Voice Message Service
// Recording, waveform generation, and transcription management
// ============================================================================

export interface VoiceMessage {
  id: string;
  duration: number;
  waveform: number[];
  url: string;
  transcription?: string;
}

export interface RecordingState {
  isRecording: boolean;
  duration: number;
  amplitude: number;
}

export class VoiceMessageService {
  private recordings: Map<string, VoiceMessage> = new Map();
  private currentRecording: RecordingState | null = null;
  private recordingStartTime: number = 0;

  startRecording(): RecordingState {
    this.recordingStartTime = Date.now();
    this.currentRecording = {
      isRecording: true,
      duration: 0,
      amplitude: 0,
    };
    return this.currentRecording;
  }

  stopRecording(): VoiceMessage {
    const duration = this.currentRecording ? (Date.now() - this.recordingStartTime) / 1000 : 0;

    const id = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const voiceMessage: VoiceMessage = {
      id,
      duration: Math.round(duration * 10) / 10,
      waveform: this.generateRandomWaveform(40),
      url: `blob://${id}`,
    };

    this.currentRecording = null;
    this.recordings.set(id, voiceMessage);

    return voiceMessage;
  }

  generateWaveform(audioData: Float32Array, barCount: number): number[] {
    if (audioData.length === 0 || barCount <= 0) {
      return [];
    }

    const samplesPerBar = Math.floor(audioData.length / barCount);
    const waveform: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, audioData.length);
      let sum = 0;

      for (let j = start; j < end; j++) {
        const sample = audioData[j];
        if (sample !== undefined) {
          sum += Math.abs(sample);
        }
      }

      const average = end > start ? sum / (end - start) : 0;
      // Normalize to 0-1 range
      waveform.push(Math.min(1, average));
    }

    return waveform;
  }

  async getTranscription(voiceMessageId: string): Promise<string> {
    const message = this.recordings.get(voiceMessageId);
    if (!message) {
      return '';
    }

    if (message.transcription) {
      return message.transcription;
    }

    // Simulate transcription (in production, this would call an ASR API)
    const transcription = `[Transcription for voice message ${voiceMessageId}]`;
    message.transcription = transcription;
    this.recordings.set(voiceMessageId, message);

    return transcription;
  }

  getDuration(audioData: Float32Array, sampleRate: number): number {
    if (sampleRate <= 0) {
      return 0;
    }
    return audioData.length / sampleRate;
  }

  private generateRandomWaveform(barCount: number): number[] {
    const waveform: number[] = [];
    for (let i = 0; i < barCount; i++) {
      waveform.push(Math.random() * 0.8 + 0.1);
    }
    return waveform;
  }
}
