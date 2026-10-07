// ============================================================================
// QuantMax - Live Streaming Service
// ============================================================================
//
// Backs the (previously dead) /live surface: go-live, list active streams, join
// (distinct-viewer count), and end. The media stream itself is delivered by the
// client/CDN (WebRTC/HLS); this service owns the stream record + lifecycle +
// viewer accounting. DI'd narrow prisma for testability.

import { createAppError } from '@quant/server-core';

export const LIVE_TYPES = ['solo', 'dating-event', 'speed-dating', 'group-video', 'party'] as const;
export type LiveType = (typeof LIVE_TYPES)[number];

const TYPE_TO_DB: Record<LiveType, string> = {
  solo: 'SOLO',
  'dating-event': 'DATING_EVENT',
  'speed-dating': 'SPEED_DATING',
  'group-video': 'GROUP_VIDEO',
  party: 'PARTY',
};
const DB_TO_TYPE: Record<string, LiveType> = {
  SOLO: 'solo',
  DATING_EVENT: 'dating-event',
  SPEED_DATING: 'speed-dating',
  GROUP_VIDEO: 'group-video',
  PARTY: 'party',
};

export interface LiveStreamView {
  id: string;
  hostId: string;
  title: string;
  type: LiveType;
  thumbnailUrl: string;
  viewerCount: number;
  maxParticipants: number;
  isLive: boolean;
  startedAt: string;
  tags: string[];
}

export interface StartLiveInput {
  title: string;
  type?: string;
  thumbnailUrl?: string;
  maxParticipants?: number;
  tags?: string[];
}

export interface LivePrisma {
  liveStream: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  liveStreamViewer: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}

export class LiveService {
  constructor(private readonly prisma: LivePrisma) {}

  async startLive(hostId: string, input: StartLiveInput): Promise<LiveStreamView> {
    const title = input.title?.trim();
    if (!title) {
      throw createAppError('Stream title is required', 400, 'INVALID_TITLE');
    }
    const dbType = input.type ? TYPE_TO_DB[input.type as LiveType] : 'SOLO';
    if (!dbType) {
      throw createAppError(`Invalid stream type: ${input.type}`, 400, 'INVALID_TYPE');
    }
    const maxParticipants = Math.max(0, Math.floor(input.maxParticipants ?? 0));

    const row = await this.prisma.liveStream.create({
      data: {
        hostId,
        title,
        type: dbType,
        thumbnailUrl: input.thumbnailUrl ?? null,
        viewerCount: 0,
        maxParticipants,
        isLive: true,
        tags: input.tags ?? [],
      },
    });
    return this.toView(row);
  }

  async listLive(): Promise<LiveStreamView[]> {
    const rows = await this.prisma.liveStream.findMany({
      where: { isLive: true },
      orderBy: { viewerCount: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  /** Join a live stream. Idempotent per user; viewerCount is the distinct count. */
  async join(streamId: string, userId: string): Promise<{ joined: boolean; viewerCount: number }> {
    const stream = await this.prisma.liveStream.findUnique({ where: { id: streamId } });
    if (!stream || !stream.isLive) {
      throw createAppError('Live stream not found', 404, 'STREAM_NOT_FOUND');
    }

    const existing = await this.prisma.liveStreamViewer.findUnique({
      where: { streamId_userId: { streamId, userId } },
    });

    if (!existing) {
      // Enforce capacity (0 = unlimited).
      if (stream.maxParticipants > 0) {
        const current = await this.prisma.liveStreamViewer.count({ where: { streamId } });
        if (current >= stream.maxParticipants) {
          throw createAppError('Live stream is full', 409, 'STREAM_FULL');
        }
      }
      await this.prisma.liveStreamViewer.create({ data: { streamId, userId } });
    }

    const viewerCount = await this.prisma.liveStreamViewer.count({ where: { streamId } });
    await this.prisma.liveStream.update({ where: { id: streamId }, data: { viewerCount } });
    return { joined: true, viewerCount };
  }

  /**
   * Leave a live stream. Idempotent: removing a viewer that isn't present is a
   * no-op. The caller's LiveStreamViewer row is deleted (by the (streamId,userId)
   * unique key) and viewerCount is recomputed from the real remaining viewer
   * rows — exactly like {@link join} — and persisted on the LiveStream.
   */
  async leave(streamId: string, userId: string): Promise<{ left: boolean; viewerCount: number }> {
    const stream = await this.prisma.liveStream.findUnique({ where: { id: streamId } });
    if (!stream || !stream.isLive) {
      throw createAppError('Live stream not found', 404, 'STREAM_NOT_FOUND');
    }

    // deleteMany on the unique (streamId,userId) is naturally idempotent:
    // it removes the caller's row if present and is a no-op otherwise.
    await this.prisma.liveStreamViewer.deleteMany({ where: { streamId, userId } });

    const viewerCount = await this.prisma.liveStreamViewer.count({ where: { streamId } });
    await this.prisma.liveStream.update({ where: { id: streamId }, data: { viewerCount } });
    return { left: true, viewerCount };
  }

  async end(streamId: string, hostId: string): Promise<{ ended: boolean }> {
    const stream = await this.prisma.liveStream.findUnique({ where: { id: streamId } });
    if (!stream) {
      throw createAppError('Live stream not found', 404, 'STREAM_NOT_FOUND');
    }
    if (stream.hostId !== hostId) {
      throw createAppError('Only the host can end this stream', 403, 'NOT_STREAM_HOST');
    }
    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { isLive: false, endedAt: new Date() },
    });
    return { ended: true };
  }

  private toView(row: Record<string, unknown>): LiveStreamView {
    const started = row['startedAt'];
    return {
      id: String(row['id']),
      hostId: String(row['hostId']),
      title: String(row['title']),
      type: DB_TO_TYPE[String(row['type'])] ?? 'solo',
      thumbnailUrl: row['thumbnailUrl'] ? String(row['thumbnailUrl']) : '',
      viewerCount: Number(row['viewerCount'] ?? 0),
      maxParticipants: Number(row['maxParticipants'] ?? 0),
      isLive: Boolean(row['isLive']),
      startedAt: started instanceof Date ? started.toISOString() : String(started ?? ''),
      tags: Array.isArray(row['tags']) ? (row['tags'] as string[]) : [],
    };
  }
}
