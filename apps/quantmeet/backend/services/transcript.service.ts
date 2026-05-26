import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export interface TranscriptSegment {
  id: string;
  roomId: string;
  participantId: string;
  text: string;
  timestamp: Date;
  duration: number;
  confidence: number;
}

export interface Transcriber {
  transcribe(audioBuffer: Buffer): Promise<{ text: string; duration: number; confidence: number }>;
}

export class TranscriptService {
  private readonly transcripts = new Map<string, TranscriptSegment[]>();

  constructor(private readonly transcriber: Transcriber) {}

  async processAudioChunk(
    roomId: string,
    participantId: string,
    audioBuffer: Buffer,
  ): Promise<TranscriptSegment> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw createAppError('Audio buffer is empty', 400, 'EMPTY_AUDIO_BUFFER');
    }

    const result = await this.transcriber.transcribe(audioBuffer);

    const segment: TranscriptSegment = {
      id: randomUUID(),
      roomId,
      participantId,
      text: result.text,
      timestamp: new Date(),
      duration: result.duration,
      confidence: result.confidence,
    };

    const existing = this.transcripts.get(roomId) ?? [];
    existing.push(segment);
    this.transcripts.set(roomId, existing);

    return segment;
  }

  getTranscript(roomId: string): TranscriptSegment[] {
    return this.transcripts.get(roomId) ?? [];
  }

  clearTranscript(roomId: string): void {
    this.transcripts.delete(roomId);
  }
}
