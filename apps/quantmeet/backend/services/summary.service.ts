import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { TranscriptSegment } from './transcript.service';
import type { TranscriptService } from './transcript.service';

export interface MeetingSummary {
  id: string;
  roomId: string | null;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  generatedAt: Date;
}

/**
 * Local AIInference interface for scaffold purposes.
 * This interface mirrors the patterns in @quant/ai and should be aligned
 * with the actual @quant/ai package types in a future integration pass.
 */
export interface AIInference {
  generateText(prompt: string): Promise<string>;
}

export class SummaryService {
  constructor(private readonly ai: AIInference) {}

  async generateSummary(transcript: TranscriptSegment[]): Promise<MeetingSummary> {
    if (transcript.length === 0) {
      throw createAppError('Transcript is empty', 400, 'EMPTY_TRANSCRIPT');
    }

    const transcriptText = transcript.map((s) => `[${s.participantId}]: ${s.text}`).join('\n');

    const prompt = `Summarize the following meeting transcript. Provide a summary, key points, and decisions made.\n\nTranscript:\n${transcriptText}`;
    const result = await this.ai.generateText(prompt);

    const lines = result.split('\n').filter((l) => l.trim().length > 0);
    const summary = lines[0] ?? 'No summary available';
    const keyPoints = lines.slice(1, 4);
    const decisions = lines.slice(4, 7);

    const roomId = transcript[0]?.roomId ?? null;

    return {
      id: randomUUID(),
      roomId,
      summary,
      keyPoints,
      decisions,
      generatedAt: new Date(),
    };
  }

  async generateFromRoomId(
    roomId: string,
    transcriptService: TranscriptService,
  ): Promise<MeetingSummary> {
    const transcript = transcriptService.getTranscript(roomId);
    if (transcript.length === 0) {
      throw createAppError('No transcript found for room', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    const meetingSummary = await this.generateSummary(transcript);
    return { ...meetingSummary, roomId };
  }
}
