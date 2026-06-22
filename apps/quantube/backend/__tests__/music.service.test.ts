import { describe, it, expect, vi } from 'vitest';
import { MusicService, MusicNotFoundError, MusicValidationError } from '../services/music.service';
import type { PrismaClient } from '../types';

function mockPrisma() {
  const albums = new Map<string, Record<string, any>>();
  const tracks = new Map<string, Record<string, any>>();
  let seq = 0;
  const prisma = {
    musicAlbum: {
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
        const id = `al${++seq}`;
        const row = { id, createdAt: new Date('2026-06-20'), ...data };
        albums.set(id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: any }) => {
        const row = albums.get(where.id);
        if (!row) return null;
        if (include?.tracks) {
          return { ...row, tracks: [...tracks.values()].filter((t) => t.albumId === where.id) };
        }
        return row;
      }),
      findMany: vi.fn(async () => [...albums.values()]),
      count: vi.fn(async () => albums.size),
    },
    musicTrack: {
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
        const id = `tr${++seq}`;
        const row = { id, createdAt: new Date('2026-06-20'), ...data };
        tracks.set(id, row);
        return row;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => tracks.get(where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where?: Record<string, any> } = {}) => {
        let list = [...tracks.values()];
        if (where?.genre) list = list.filter((t) => t.genre === where.genre);
        if (where?.albumId) list = list.filter((t) => t.albumId === where.albumId);
        return list;
      }),
      count: vi.fn(async () => tracks.size),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
          const row = { ...tracks.get(where.id), ...data };
          tracks.set(where.id, row);
          return row;
        },
      ),
    },
    video: {} as never,
    videoChannel: {} as never,
  } as unknown as PrismaClient;
  return { prisma, albums, tracks };
}

describe('MusicService', () => {
  describe('createAlbum / createTrack', () => {
    it('creates an album', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      const a = await svc.createAlbum({ title: 'Disc', artistName: 'Band' });
      expect(a.title).toBe('Disc');
      expect(a.artistName).toBe('Band');
    });

    it('creates a track with defaults', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      const t = await svc.createTrack({
        title: 'Song',
        artistName: 'Band',
        audioUrl: 'https://cdn/s.mp3',
      });
      expect(t.playCount).toBe(0);
      expect(t.audioUrl).toBe('https://cdn/s.mp3');
    });

    it('rejects an invalid audioUrl', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      await expect(
        svc.createTrack({ title: 'x', artistName: 'y', audioUrl: 'not-a-url' }),
      ).rejects.toBeInstanceOf(MusicValidationError);
    });

    it('rejects a missing title', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      await expect(
        svc.createTrack({ title: '', artistName: 'y', audioUrl: 'https://x.mp3' }),
      ).rejects.toBeInstanceOf(MusicValidationError);
    });
  });

  describe('getTrack / getStreamInfo', () => {
    it('returns a track', async () => {
      const { prisma } = mockPrisma();
      const svc = new MusicService(prisma);
      const created = await svc.createTrack({
        title: 's',
        artistName: 'a',
        audioUrl: 'https://x.mp3',
      });
      const got = await svc.getTrack(created.id);
      expect(got.id).toBe(created.id);
    });

    it('throws for an unknown track', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      await expect(svc.getTrack('missing')).rejects.toBeInstanceOf(MusicNotFoundError);
    });

    it('returns stream info, counts a play, and infers mime type', async () => {
      const { prisma } = mockPrisma();
      const svc = new MusicService(prisma);
      const t = await svc.createTrack({
        title: 's',
        artistName: 'a',
        audioUrl: 'https://x.flac',
        durationSec: 200,
      });
      const info = await svc.getStreamInfo(t.id);
      expect(info.streamUrl).toBe('https://x.flac');
      expect(info.mimeType).toBe('audio/flac');
      expect(info.durationSec).toBe(200);
      // play counted
      const after = await svc.getTrack(t.id);
      expect(after.playCount).toBe(1);
    });

    it('throws streaming an unknown track', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      await expect(svc.getStreamInfo('missing')).rejects.toBeInstanceOf(MusicNotFoundError);
    });
  });

  describe('albums with tracks', () => {
    it('returns an album with its tracks', async () => {
      const { prisma } = mockPrisma();
      const svc = new MusicService(prisma);
      const album = await svc.createAlbum({ title: 'Disc', artistName: 'Band' });
      await svc.createTrack({
        title: 't1',
        artistName: 'Band',
        audioUrl: 'https://a.mp3',
        albumId: album.id,
      });
      await svc.createTrack({
        title: 't2',
        artistName: 'Band',
        audioUrl: 'https://b.mp3',
        albumId: album.id,
      });
      const full = await svc.getAlbum(album.id);
      expect(full.tracks).toHaveLength(2);
    });

    it('throws for an unknown album', async () => {
      const svc = new MusicService(mockPrisma().prisma);
      await expect(svc.getAlbum('missing')).rejects.toBeInstanceOf(MusicNotFoundError);
    });
  });

  describe('listing + filtering', () => {
    it('filters tracks by genre', async () => {
      const { prisma } = mockPrisma();
      const svc = new MusicService(prisma);
      await svc.createTrack({
        title: 'a',
        artistName: 'x',
        audioUrl: 'https://a.mp3',
        genre: 'rock',
      });
      await svc.createTrack({
        title: 'b',
        artistName: 'x',
        audioUrl: 'https://b.mp3',
        genre: 'jazz',
      });
      const rock = await svc.listTracks({ genre: 'rock' });
      expect(rock.tracks).toHaveLength(1);
      expect(rock.tracks[0]!.genre).toBe('rock');
    });

    it('overview returns tracks + albums', async () => {
      const { prisma } = mockPrisma();
      const svc = new MusicService(prisma);
      await svc.createAlbum({ title: 'Disc', artistName: 'Band' });
      await svc.createTrack({ title: 's', artistName: 'a', audioUrl: 'https://x.mp3' });
      const ov = await svc.overview();
      expect(ov.tracks.length).toBe(1);
      expect(ov.albums.length).toBe(1);
    });
  });
});
