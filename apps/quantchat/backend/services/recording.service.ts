import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { LiveKitGateway, S3EgressConfig } from './livekit-gateway.service';
import type { MeetingRoomRow } from './room.service';

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
  // QC-F-040: recording authorization lives in this service layer, so the
  // service must be able to load the owning room (host + participants +
  // settings) for every recording operation. Fail-closed: no room row, no
  // recording access.
  meetingRoom: {
    findUnique(args: {
      where: { id: string };
      include?: { participants?: boolean };
    }): Promise<MeetingRoomRow | null>;
  };
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

  // QC-F-040 authorization helpers. Meetings vocabulary is host/participant
  // (NOT_A_MEMBER belongs to conversations/channels — do not reuse here).
  private async loadRoom(roomId: string): Promise<MeetingRoomRow> {
    const row = await this.prisma.meetingRoom.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    if (!row) {
      throw createAppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    return row;
  }

  private isRoomParticipant(room: MeetingRoomRow, userId: string): boolean {
    return (
      room.hostId === userId ||
      (room.participants ?? []).some((participant) => participant.userId === userId)
    );
  }

  private requireRoomHost(room: MeetingRoomRow, userId: string): void {
    if (room.hostId !== userId) {
      throw createAppError('Only the host can manage recordings', 403, 'NOT_MEETING_HOST');
    }
  }

  private requireRoomParticipant(room: MeetingRoomRow, userId: string): void {
    if (!this.isRoomParticipant(room, userId)) {
      throw createAppError('Not a participant of this meeting', 403, 'NOT_A_PARTICIPANT');
    }
  }

  private roomRecordingEnabled(room: MeetingRoomRow): boolean {
    const settings =
      room.settings && typeof room.settings === 'object'
        ? (room.settings as Record<string, unknown>)
        : {};
    // Default is OFF (RoomService DEFAULT_SETTINGS.enableRecording = false):
    // a missing/non-boolean flag must never silently enable recording.
    return settings['enableRecording'] === true;
  }

  async startRecording(roomId: string, userId: string): Promise<Recording> {
    // QC-F-040: recording is a host-sovereign, consent-bearing action.
    // Host-only, and only when the host enabled recording for the room.
    const room = await this.loadRoom(roomId);
    this.requireRoomHost(room, userId);
    if (!this.roomRecordingEnabled(room)) {
      throw createAppError('Recording is disabled for this meeting', 403, 'RECORDING_DISABLED');
    }

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

  async stopRecording(recordingId: string, userId: string): Promise<Recording> {
    const existing = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!existing) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }

    // QC-F-040: only the meeting host or the user who started this recording
    // may stop it. Authorization runs before the active-state check so a
    // denied stop reveals nothing and writes nothing. If the room row is
    // gone, only the recorder remains authorized (fail-closed otherwise).
    const room = await this.prisma.meetingRoom.findUnique({
      where: { id: existing.roomId },
      include: { participants: true },
    });
    if (existing.userId !== userId && room?.hostId !== userId) {
      throw createAppError('Only the host can manage recordings', 403, 'NOT_MEETING_HOST');
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

  async getRecordingUrl(recordingId: string, userId: string): Promise<string> {
    const recording = await this.getRecording(recordingId);
    // QC-F-040: the storageKey is the locator for the recorded media — only
    // meeting participants (host included) may resolve it.
    const room = await this.loadRoom(recording.roomId);
    this.requireRoomParticipant(room, userId);
    if (recording.status !== 'completed') {
      throw createAppError('Recording not yet available', 400, 'RECORDING_NOT_READY');
    }
    return recording.storageKey;
  }

  async listRecordings(roomId: string, userId: string): Promise<Recording[]> {
    // QC-F-040: listing leaks every recording's metadata + storageKey, so it
    // is participant-gated. An unknown room is now 404 (was: empty list).
    const room = await this.loadRoom(roomId);
    this.requireRoomParticipant(room, userId);
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
