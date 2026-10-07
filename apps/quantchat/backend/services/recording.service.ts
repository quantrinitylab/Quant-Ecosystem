import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { LiveKitGateway, S3EgressConfig } from './livekit-gateway.service';

export interface StorageClient {
  getSignedUrl?(key: string, options?: { expiresIn?: number }): Promise<string>;
  [key: string]: unknown;
}

export interface Recording {
  id: string;
  roomId: string;
  userId: string;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  startedAt: Date;
  stoppedAt: Date | null;
  storageKey: string;
  duration: number | null;
  fileSize: number | null;
  egressId: string | null;
}

export interface RecordingRow {
  id: string;
  roomId: string;
  userId: string;
  status: string;
  startedAt: Date;
  stoppedAt: Date | null;
  storageKey: string;
  duration: number | null;
  fileSize: number | null;
  egressId: string | null;
  createdAt: Date;
}

export interface RecordingPrisma {
  recording: {
    create(args: { data: Record<string, unknown> }): Promise<RecordingRow>;
    findUnique(args: { where: { id: string } }): Promise<RecordingRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<RecordingRow>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<RecordingRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
}

export class RecordingService {
  constructor(
    private readonly prisma: RecordingPrisma,
    private readonly storage: StorageClient,
    private readonly livekitGateway?: LiveKitGateway,
    private readonly s3Config?: S3EgressConfig,
  ) {}

  async startRecording(roomId: string, userId: string): Promise<Recording> {
    const activeCount = await this.prisma.recording.count({
      where: { roomId, status: 'recording' },
    });
    if (activeCount > 0) {
      throw createAppError(
        'Room already has an active recording',
        409,
        'RECORDING_ALREADY_ACTIVE',
      );
    }

    const id = randomUUID();
    const storageKey = `recordings/${roomId}/${id}.webm`;
    let egressId: string | null = null;

    if (this.livekitGateway && this.s3Config) {
      try {
        const egress = await this.livekitGateway.startRecordingEgress(roomId, this.s3Config);
        egressId = egress.egressId;
      } catch {
        throw createAppError(
          'Failed to start egress for recording',
          502,
          'RECORDING_EGRESS_FAILED',
        );
      }
    }

    const row = await this.prisma.recording.create({
      data: {
        id,
        roomId,
        userId,
        status: 'recording',
        startedAt: new Date(),
        stoppedAt: null,
        storageKey,
        duration: null,
        fileSize: null,
        egressId,
      },
    });

    return this.toRecording(row);
  }

  async stopRecording(recordingId: string): Promise<Recording> {
    const existing = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!existing) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }

    if (existing.status !== 'recording') {
      throw createAppError('Recording is not active', 400, 'RECORDING_NOT_ACTIVE');
    }

    if (this.livekitGateway && existing.egressId) {
      try {
        await this.livekitGateway.stopEgress(existing.egressId);
      } catch {
        await this.prisma.recording.update({
          where: { id: recordingId },
          data: { status: 'failed' },
        });
        throw createAppError('Failed to stop egress', 502, 'RECORDING_EGRESS_STOP_FAILED');
      }
    }

    const stoppedAt = new Date();
    const duration = Math.floor((stoppedAt.getTime() - existing.startedAt.getTime()) / 1000);

    const updated = await this.prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'completed',
        stoppedAt,
        duration,
      },
    });

    return this.toRecording(updated);
  }

  async getRecording(recordingId: string): Promise<Recording> {
    const row = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!row) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }
    return this.toRecording(row);
  }

  async getRecordingUrl(recordingId: string): Promise<string> {
    const recording = await this.getRecording(recordingId);
    if (recording.status !== 'completed') {
      throw createAppError('Recording not yet available', 400, 'RECORDING_NOT_READY');
    }
    return recording.storageKey;
  }

  async listRecordings(roomId: string): Promise<Recording[]> {
    const rows = await this.prisma.recording.findMany({
      where: { roomId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((row) => this.toRecording(row));
  }

  getStorage(): StorageClient {
    return this.storage;
  }

  private toRecording(row: RecordingRow): Recording {
    return {
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      status: this.parseStatus(row.status),
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt,
      storageKey: row.storageKey,
      duration: row.duration,
      fileSize: row.fileSize,
      egressId: row.egressId,
    };
  }

  private parseStatus(value: string): Recording['status'] {
    switch (value) {
      case 'recording':
      case 'processing':
      case 'completed':
      case 'failed':
        return value;
      default:
        return 'failed';
    }
  }
}
