// ============================================================================
// QuantMeet — Durable meeting recordings (Prisma-backed)
//
// Previously RecordingService kept every recording in an in-memory
// `Map<string, Recording>` plus an `activeByRoom` Set, so all recording
// metadata — and the "is a recording already active for this room?" guard —
// were lost on restart/redeploy and never shared across backend instances.
// This rewrite makes recordings DURABLE by persisting them to the Prisma
// `Recording` model while preserving all existing LiveKit egress + storage
// behavior.
//
// The public `Recording` shape and the EXACT createAppError messages / codes /
// statuses are preserved (the route + tests depend on them):
//   'Room already has an active recording' 409 RECORDING_ALREADY_ACTIVE
//   'Failed to start egress for recording' 502 RECORDING_EGRESS_FAILED
//   'Recording not found'                  404 RECORDING_NOT_FOUND
//   'Recording is not active'              400 RECORDING_NOT_ACTIVE
//   'Failed to stop egress'                502 RECORDING_EGRESS_STOP_FAILED
//   'Recording not yet available'          400 RECORDING_NOT_READY
//
// The read methods (getRecording / getRecordingUrl / listRecordings) are now
// ASYNC. The Prisma client is injected through a NARROW interface
// (`RecordingPrisma`) covering only the `recording` delegate operations this
// service issues, mirroring the repo's established DI pattern (see
// RoomService / CallRecordService).
// ============================================================================

import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { StorageClient } from '@quant/storage';
import type { LiveKitGateway, S3EgressConfig } from './livekit-gateway.service';

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

// ---------------------------------------------------------------------------
// Persisted row shape (the subset of columns this service reads/writes).
// ---------------------------------------------------------------------------

/** A persisted `Recording` row. */
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

/**
 * Narrow view of the Prisma client — exactly the `recording` delegate
 * operations {@link RecordingService} issues. Injected via the constructor so
 * the service can run against the real client in production and an in-memory
 * fake in tests.
 */
export interface RecordingPrisma {
  recording: {
    create(args: { data: Record<string, unknown> }): Promise<RecordingRow>;
    findUnique(args: { where: { id: string } }): Promise<RecordingRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<RecordingRow>;
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

  /**
   * Begin recording a room. Persists a durable `Recording` row (status
   * 'recording') and, when a LiveKit gateway + S3 config are wired, starts the
   * egress and records its `egressId`.
   *
   * @throws createAppError('Room already has an active recording', 409,
   *   'RECORDING_ALREADY_ACTIVE') when the room already has a 'recording' row.
   * @throws createAppError('Failed to start egress for recording', 502,
   *   'RECORDING_EGRESS_FAILED') when the egress fails to start.
   */
  async startRecording(roomId: string, userId: string): Promise<Recording> {
    const activeCount = await this.prisma.recording.count({
      where: { roomId, status: 'recording' },
    });
    if (activeCount > 0) {
      throw createAppError('Room already has an active recording', 409, 'RECORDING_ALREADY_ACTIVE');
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

  /**
   * Stop an active recording. Keeps the LiveKit stopEgress behavior: on egress
   * failure the row is marked 'failed' and the error is rethrown; on success
   * the row is marked 'completed' with `stoppedAt` and a computed `duration`.
   *
   * @throws createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND').
   * @throws createAppError('Recording is not active', 400, 'RECORDING_NOT_ACTIVE')
   *   when the current status is not 'recording'.
   * @throws createAppError('Failed to stop egress', 502,
   *   'RECORDING_EGRESS_STOP_FAILED') when the egress fails to stop.
   */
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

  /**
   * Load a single recording.
   * @throws createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND').
   */
  async getRecording(recordingId: string): Promise<Recording> {
    const row = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!row) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }
    return this.toRecording(row);
  }

  /**
   * Resolve the storage key for a completed recording.
   * @throws createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND').
   * @throws createAppError('Recording not yet available', 400,
   *   'RECORDING_NOT_READY') when the recording is not yet 'completed'.
   */
  async getRecordingUrl(recordingId: string): Promise<string> {
    const recording = await this.getRecording(recordingId);
    if (recording.status !== 'completed') {
      throw createAppError('Recording not yet available', 400, 'RECORDING_NOT_READY');
    }
    return recording.storageKey;
  }

  /** List a room's recordings, newest first. */
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

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  /** Map a persisted recording row to the public Recording shape. */
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

  /** Coerce the persisted status string into the Recording status union. */
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
