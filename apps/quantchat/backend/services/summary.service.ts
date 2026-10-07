import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { TranscriptSegment, TranscriptService } from './transcript.service';

export interface MeetingSummary {
  id: string;
  roomId: string | null;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  generatedAt: Date;
}

export interface AIInference {
  generateText(prompt: string): Promise<string>;
}

export interface MeetingSummaryRow {
  id: string;
  roomId: string;
  summary: string;
  keyPoints: unknown;
  decisions: unknown;
  generatedAt: Date;
}

export interface SummaryPrisma {
  meetingSummary: {
    upsert(args: {
      where: { roomId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<MeetingSummaryRow>;
    findUnique(args: { where: { roomId: string } }): Promise<MeetingSummaryRow | null>;
  };
}

export class SummaryService {
  constructor(
    private readonly prisma: SummaryPrisma,
    private readonly ai: AIInference,
  ) {}

  async generateSummary(transcript: TranscriptSegment[]): Promise<MeetingSummary> {
    if (transcript.length === 0) {
      throw createAppError('Transcript is empty', 400, 'EMPTY_TRANSCRIPT');
    }

    const transcriptText = transcript.map((segment) => `[${segment.participantId}]: ${segment.text}`).join('\n');
    const prompt = `Summarize the following meeting transcript. Provide a summary, key points, and decisions made.\n\nTranscript:\n${transcriptText}`;
    const result = await this.ai.generateText(prompt);

    const lines = result.split('\n').filter((line) => line.trim().length > 0);
    const summary = lines[0] ?? 'No summary available';
    const keyPoints = lines.slice(1, 4);
    const decisions = lines.slice(4, 7);
    const roomId = transcript[0]?.roomId ?? null;

    if (roomId) {
      const generatedAt = new Date();
      const row = await this.prisma.meetingSummary.upsert({
        where: { roomId },
        create: { roomId, summary, keyPoints, decisions, generatedAt },
        update: { summary, keyPoints, decisions, generatedAt },
      });
      return this.toSummary(row);
    }

    return {
      id: randomUUID(),
      roomId: null,
      summary,
      keyPoints,
      decisions,
      generatedAt: new Date(),
    };
  }

  async getSummary(roomId: string): Promise<MeetingSummary | null> {
    const row = await this.prisma.meetingSummary.findUnique({ where: { roomId } });
    return row ? this.toSummary(row) : null;
  }

  async generateFromRoomId(
    roomId: string,
    transcriptService: TranscriptService,
  ): Promise<MeetingSummary> {
    const transcript = await transcriptService.getTranscript(roomId);
    if (transcript.length === 0) {
      throw createAppError('No transcript found for room', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    const meetingSummary = await this.generateSummary(transcript);
    return { ...meetingSummary, roomId };
  }

  private toSummary(row: MeetingSummaryRow): MeetingSummary {
    return {
      id: row.id,
      roomId: row.roomId,
      summary: row.summary,
      keyPoints: this.toStringArray(row.keyPoints),
      decisions: this.toStringArray(row.decisions),
      generatedAt: row.generatedAt,
    };
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }
}
