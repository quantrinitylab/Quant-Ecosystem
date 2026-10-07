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
  transcribe(audioBuffer: Buffer): Promise<{
    text: string;
    duration: number;
    confidence: number;
  }>;
}

export interface TranscriptSegmentRow {
  id: string;
  roomId: string;
  participantId: string;
  text: string;
  duration: number;
  confidence: number;
  timestamp: Date;
}

export interface TranscriptPrisma {
  meetingTranscriptSegment: {
    create(args: { data: Record<string, unknown> }): Promise<TranscriptSegmentRow>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<TranscriptSegmentRow[]>;
    deleteMany(args: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export class TranscriptService {
  constructor(
    private readonly prisma: TranscriptPrisma,
    private readonly transcriber: Transcriber,
  ) {}

  async processAudioChunk(
    roomId: string,
    participantId: string,
    audioBuffer: Buffer,
  ): Promise<TranscriptSegment> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw createAppError('Audio buffer is empty', 400, 'EMPTY_AUDIO_BUFFER');
    }

    const result = await this.transcriber.transcribe(audioBuffer);

    const row = await this.prisma.meetingTranscriptSegment.create({
      data: {
        roomId,
        participantId,
        text: result.text,
        duration: result.duration,
        confidence: result.confidence,
        timestamp: new Date(),
      },
    });

    return this.toSegment(row);
  }

  startTranscription(_roomId: string): void {
    // Segments are created lazily as audio chunks arrive.
  }

  async addSegment(
    roomId: string,
    segment: Omit<TranscriptSegment, 'id'>,
  ): Promise<TranscriptSegment> {
    const row = await this.prisma.meetingTranscriptSegment.create({
      data: {
        roomId,
        participantId: segment.participantId,
        text: segment.text,
        duration: segment.duration,
        confidence: segment.confidence,
        timestamp: segment.timestamp,
      },
    });

    return this.toSegment(row);
  }

  async getFullTranscript(roomId: string): Promise<string> {
    const segments = await this.getTranscript(roomId);
    return segments.map((segment) => `[${segment.participantId}]: ${segment.text}`).join('\n');
  }

  async getTranscript(roomId: string): Promise<TranscriptSegment[]> {
    const rows = await this.prisma.meetingTranscriptSegment.findMany({
      where: { roomId },
      orderBy: { timestamp: 'asc' },
    });
    return rows.map((row) => this.toSegment(row));
  }

  async clearTranscript(roomId: string): Promise<void> {
    await this.prisma.meetingTranscriptSegment.deleteMany({ where: { roomId } });
  }

  private toSegment(row: TranscriptSegmentRow): TranscriptSegment {
    return {
      id: row.id,
      roomId: row.roomId,
      participantId: row.participantId,
      text: row.text,
      timestamp: row.timestamp,
      duration: row.duration,
      confidence: row.confidence,
    };
  }
}
