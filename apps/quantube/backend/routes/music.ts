import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MusicService, MusicNotFoundError, MusicValidationError } from '../services/music.service';

// ============================================================================
// QuantTube Music routes (mounted at /music).
//
//   GET  /music                      -> overview (recent tracks + albums)
//   GET  /music/tracks               -> list tracks (paginated, filterable)
//   GET  /music/tracks/:id           -> a track
//   GET  /music/tracks/:id/stream    -> stream info (+ counts a play)
//   GET  /music/albums               -> list albums
//   GET  /music/albums/:id           -> an album with its tracks
//   POST /music/tracks               -> create a track (catalog ingestion)
//   POST /music/albums               -> create an album
// ============================================================================

function getService(fastify: FastifyInstance): MusicService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new MusicService(prisma as never);
}

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  genre: z.string().max(64).optional(),
  albumId: z.string().max(64).optional(),
});

const createTrackSchema = z.object({
  title: z.string().min(1).max(300),
  artistName: z.string().min(1).max(200),
  audioUrl: z.string().min(1).max(2048),
  albumId: z.string().max(64).optional(),
  artworkUrl: z.string().max(2048).optional(),
  durationSec: z.coerce.number().int().min(0).max(86400).optional(),
  genre: z.string().max(64).optional(),
});

const createAlbumSchema = z.object({
  title: z.string().min(1).max(300),
  artistName: z.string().min(1).max(200),
  artworkUrl: z.string().max(2048).optional(),
  releaseDate: z.coerce.date().optional(),
});

function mapError(err: unknown): never {
  if (err instanceof MusicNotFoundError) throw createAppError(err.message, 404, 'NOT_FOUND');
  if (err instanceof MusicValidationError)
    throw createAppError(err.message, 422, 'VALIDATION_ERROR');
  throw err;
}

export default async function musicRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const data = await getService(fastify).overview();
    return reply.send({ success: true, data });
  });

  fastify.get('/tracks', async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await getService(fastify).listTracks(parsed.data);
    return reply.send({ success: true, data });
  });

  fastify.get<{ Params: { id: string } }>('/tracks/:id', async (request, reply) => {
    try {
      const track = await getService(fastify).getTrack(request.params.id);
      return reply.send({ success: true, data: { track } });
    } catch (err) {
      mapError(err);
    }
  });

  fastify.get<{ Params: { id: string } }>('/tracks/:id/stream', async (request, reply) => {
    try {
      const stream = await getService(fastify).getStreamInfo(request.params.id);
      return reply.send({ success: true, data: stream });
    } catch (err) {
      mapError(err);
    }
  });

  fastify.get('/albums', async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await getService(fastify).listAlbums(parsed.data);
    return reply.send({ success: true, data });
  });

  fastify.get<{ Params: { id: string } }>('/albums/:id', async (request, reply) => {
    try {
      const album = await getService(fastify).getAlbum(request.params.id);
      return reply.send({ success: true, data: { album } });
    } catch (err) {
      mapError(err);
    }
  });

  fastify.post('/tracks', async (request, reply) => {
    const parsed = createTrackSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    try {
      const track = await getService(fastify).createTrack(parsed.data);
      return reply.status(201).send({ success: true, data: { track } });
    } catch (err) {
      mapError(err);
    }
  });

  fastify.post('/albums', async (request, reply) => {
    const parsed = createAlbumSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    try {
      const album = await getService(fastify).createAlbum(parsed.data);
      return reply.status(201).send({ success: true, data: { album } });
    } catch (err) {
      mapError(err);
    }
  });
}
