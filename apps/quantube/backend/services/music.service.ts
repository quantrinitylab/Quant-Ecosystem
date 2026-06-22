// ============================================================================
// QuantTube - Music Service (YouTube Music / Spotify)
// ============================================================================
//
// Music catalog (albums + tracks) with streaming metadata and play counts.
// Backed by the MusicAlbum + MusicTrack models. The stream endpoint returns the
// track's audio URL + metadata (the client player fetches the bytes) and counts
// a play; a real signed-URL/transcode pipeline is a follow-up.

import type { PrismaClient } from '../types';

export interface CreateAlbumInput {
  title: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: Date;
}

export interface CreateTrackInput {
  title: string;
  artistName: string;
  audioUrl: string;
  albumId?: string;
  artworkUrl?: string;
  durationSec?: number;
  genre?: string;
}

export interface PublicTrack {
  id: string;
  title: string;
  artistName: string;
  albumId: string | null;
  audioUrl: string;
  artworkUrl: string | null;
  durationSec: number;
  genre: string | null;
  playCount: number;
  createdAt: Date;
}

export interface PublicAlbum {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseDate: Date | null;
  createdAt: Date;
  tracks?: PublicTrack[];
}

export interface StreamInfo {
  trackId: string;
  streamUrl: string;
  mimeType: string;
  durationSec: number;
}

export class MusicNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'MusicNotFoundError';
  }
}

export class MusicValidationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MusicValidationError';
  }
}

function assertUrl(url: string, field: string): void {
  if (!url || (!/^https?:\/\//.test(url) && !url.startsWith('/'))) {
    throw new MusicValidationError(`${field} must be an http(s) or absolute path URL`);
  }
}

export class MusicService {
  constructor(private readonly prisma: PrismaClient) {}

  async createAlbum(input: CreateAlbumInput): Promise<PublicAlbum> {
    if (!input.title?.trim()) throw new MusicValidationError('title is required');
    if (!input.artistName?.trim()) throw new MusicValidationError('artistName is required');
    if (input.artworkUrl) assertUrl(input.artworkUrl, 'artworkUrl');
    const row = await this.prisma.musicAlbum.create({
      data: {
        title: input.title.trim(),
        artistName: input.artistName.trim(),
        artworkUrl: input.artworkUrl ?? null,
        releaseDate: input.releaseDate ?? null,
      },
    });
    return this.toAlbum(row);
  }

  async createTrack(input: CreateTrackInput): Promise<PublicTrack> {
    if (!input.title?.trim()) throw new MusicValidationError('title is required');
    if (!input.artistName?.trim()) throw new MusicValidationError('artistName is required');
    assertUrl(input.audioUrl, 'audioUrl');
    if (input.artworkUrl) assertUrl(input.artworkUrl, 'artworkUrl');
    const duration = input.durationSec ?? 0;
    if (duration < 0 || duration > 24 * 3600) {
      throw new MusicValidationError('durationSec out of range');
    }
    const row = await this.prisma.musicTrack.create({
      data: {
        title: input.title.trim(),
        artistName: input.artistName.trim(),
        albumId: input.albumId ?? null,
        audioUrl: input.audioUrl,
        artworkUrl: input.artworkUrl ?? null,
        durationSec: duration,
        genre: input.genre ?? null,
        playCount: 0,
      },
    });
    return this.toTrack(row);
  }

  async listTracks(
    options: { page?: number; pageSize?: number; genre?: string; albumId?: string } = {},
  ): Promise<{ tracks: PublicTrack[]; page: number; pageSize: number }> {
    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 20, 100);
    const where: Record<string, unknown> = {};
    if (options.genre) where['genre'] = options.genre;
    if (options.albumId) where['albumId'] = options.albumId;
    const rows = await this.prisma.musicTrack.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { tracks: rows.map((r) => this.toTrack(r)), page, pageSize };
  }

  async getTrack(id: string): Promise<PublicTrack> {
    const row = await this.prisma.musicTrack.findUnique({ where: { id } });
    if (!row) throw new MusicNotFoundError('Track');
    return this.toTrack(row);
  }

  async listAlbums(
    options: { page?: number; pageSize?: number } = {},
  ): Promise<{ albums: PublicAlbum[]; page: number; pageSize: number }> {
    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 20, 100);
    const rows = await this.prisma.musicAlbum.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { albums: rows.map((r) => this.toAlbum(r)), page, pageSize };
  }

  async getAlbum(id: string): Promise<PublicAlbum> {
    const row = await this.prisma.musicAlbum.findUnique({
      where: { id },
      include: { tracks: true },
    });
    if (!row) throw new MusicNotFoundError('Album');
    const album = this.toAlbum(row);
    const tracks = Array.isArray(row.tracks) ? row.tracks : [];
    album.tracks = tracks.map((t: Record<string, any>) => this.toTrack(t));
    return album;
  }

  /** Return streaming info and count a play. */
  async getStreamInfo(trackId: string): Promise<StreamInfo> {
    const row = await this.prisma.musicTrack.findUnique({ where: { id: trackId } });
    if (!row) throw new MusicNotFoundError('Track');
    await this.prisma.musicTrack.update({
      where: { id: trackId },
      data: { playCount: (row.playCount ?? 0) + 1 },
    });
    return {
      trackId,
      streamUrl: String(row.audioUrl),
      mimeType: this.mimeFor(String(row.audioUrl)),
      durationSec: Number(row.durationSec ?? 0),
    };
  }

  /** Overview for the music home: recent tracks + albums. */
  async overview(): Promise<{ tracks: PublicTrack[]; albums: PublicAlbum[] }> {
    const [tracks, albums] = await Promise.all([
      this.listTracks({ pageSize: 10 }),
      this.listAlbums({ pageSize: 10 }),
    ]);
    return { tracks: tracks.tracks, albums: albums.albums };
  }

  private mimeFor(url: string): string {
    if (url.endsWith('.mp3')) return 'audio/mpeg';
    if (url.endsWith('.aac') || url.endsWith('.m4a')) return 'audio/mp4';
    if (url.endsWith('.ogg') || url.endsWith('.opus')) return 'audio/ogg';
    if (url.endsWith('.flac')) return 'audio/flac';
    if (url.endsWith('.wav')) return 'audio/wav';
    return 'audio/mpeg';
  }

  private toTrack(row: Record<string, any>): PublicTrack {
    return {
      id: String(row.id),
      title: String(row.title),
      artistName: String(row.artistName),
      albumId: row.albumId ?? null,
      audioUrl: String(row.audioUrl),
      artworkUrl: row.artworkUrl ?? null,
      durationSec: Number(row.durationSec ?? 0),
      genre: row.genre ?? null,
      playCount: Number(row.playCount ?? 0),
      createdAt: (row.createdAt as Date) ?? new Date(),
    };
  }

  private toAlbum(row: Record<string, any>): PublicAlbum {
    return {
      id: String(row.id),
      title: String(row.title),
      artistName: String(row.artistName),
      artworkUrl: row.artworkUrl ?? null,
      releaseDate: (row.releaseDate as Date) ?? null,
      createdAt: (row.createdAt as Date) ?? new Date(),
    };
  }
}
