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

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory state tracking only, no real media capture or transcoding
 * Production path: Use LiveKit Egress or mediasoup recording with FFmpeg pipeline
 */
export class RecordingService {
  private readonly recordings = new Map<string, Recording>();

  constructor(
    private readonly storage: StorageClient,
    private readonly livekitGateway?: LiveKitGateway,
    private readonly s3Config?: S3EgressConfig,
  ) {}

  async startRecording(roomId: string, userId: string): Promise<Recording> {
    const id = randomUUID();
    const storageKey = `recordings/${roomId}/${id}.webm`;
    let egressId: string | null = null;

    if (this.livekitGateway && this.s3Config) {
      const egress = await this.livekitGateway.startRecordingEgress(roomId, this.s3Config);
      egressId = egress.egressId;
    }

    const recording: Recording = {
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
    };

    this.recordings.set(id, recording);
    return recording;
  }

  async stopRecording(recordingId: string): Promise<Recording> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }

    if (recording.status !== 'recording') {
      throw createAppError('Recording is not active', 400, 'RECORDING_NOT_ACTIVE');
    }

    if (this.livekitGateway && recording.egressId) {
      await this.livekitGateway.stopEgress(recording.egressId);
    }

    recording.status = 'completed';
    recording.stoppedAt = new Date();
    recording.duration = Math.floor(
      (recording.stoppedAt.getTime() - recording.startedAt.getTime()) / 1000,
    );

    return recording;
  }

  getRecording(recordingId: string): Recording {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }
    return recording;
  }

  getRecordingUrl(recordingId: string): string {
    const recording = this.getRecording(recordingId);
    return recording.storageKey;
  }

  listRecordings(roomId: string): Recording[] {
    const results: Recording[] = [];
    for (const recording of this.recordings.values()) {
      if (recording.roomId === roomId) {
        results.push(recording);
      }
    }
    return results;
  }

  getStorage(): StorageClient {
    return this.storage;
  }
}
