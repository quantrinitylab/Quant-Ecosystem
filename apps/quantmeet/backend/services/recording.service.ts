import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { StorageClient } from '@quant/storage';

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
}

export class RecordingService {
  private readonly recordings = new Map<string, Recording>();

  constructor(private readonly storage: StorageClient) {}

  startRecording(roomId: string, userId: string): Recording {
    const id = randomUUID();
    const storageKey = `recordings/${roomId}/${id}.webm`;

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
    };

    this.recordings.set(id, recording);
    return recording;
  }

  stopRecording(recordingId: string): Recording {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw createAppError('Recording not found', 404, 'RECORDING_NOT_FOUND');
    }

    if (recording.status !== 'recording') {
      throw createAppError('Recording is not active', 400, 'RECORDING_NOT_ACTIVE');
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
