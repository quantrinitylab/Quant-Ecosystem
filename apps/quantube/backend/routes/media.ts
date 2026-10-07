import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  UploadManager,
  SharedMediaPickerService,
  VideoTranscoder,
  ImageProcessor,
  AudioProcessor,
  MetadataExtractor,
} from '@quant/media';
import type { MediaItem, MediaType } from '@quant/media';

// ============================================================================
// media seam — decorator service + routes (quantube, per-app lane Stage 4/5)
// ============================================================================
//
// Task 13.1 (Req 3.1, 3.2). Wires `@quant/media` into quantube AS-SHIPPED (no
// rewrite — Req 9.1). The engine is composed once at boot into a decorated
// singleton (`fastify.media`, never per-request) bundling the real engine
// exports: resumable chunked `UploadManager`, the cross-app
// `SharedMediaPickerService`, the ffmpeg-backed `VideoTranscoder`, plus
// `ImageProcessor` / `AudioProcessor` / `MetadataExtractor`. Persistence is the
// engine's own in-memory state (no new schema — Req 9.5); `app.prisma` stays
// available for collaborators but these services do not require it.
//
// Routes sit behind the global `onRequest` auth hook from `createApp()` (401
// unauthenticated); mutating routes additionally declare a `media:write` scope
// via `requireAuth({ scopes })` (Req 7.4). The `/media` prefix does NOT collide
// with any PUBLIC_PATHS entry. Inputs are Zod-validated; responses use the
// canonical `{ success, data }` envelope.

/**
 * The composite media engine service decorated onto the Fastify instance. Pure
 * composition of `@quant/media`'s as-shipped exports.
 */
export interface MediaService {
  uploads: UploadManager;
  picker: SharedMediaPickerService;
  transcoder: VideoTranscoder;
  image: ImageProcessor;
  audio: AudioProcessor;
  metadata: MetadataExtractor;
}

// Layer 2 type augmentation (mirrors prisma.ts): expose the decorated media
// engine on the Fastify instance so routes are typed everywhere.
declare module 'fastify' {
  interface FastifyInstance {
    media: MediaService;
  }
}

/**
 * Construct the media engine service bundle once at boot (decorated singleton).
 * Called from quantube's `buildApp()` via `app.decorate('media', ...)`.
 */
export function createMediaService(): MediaService {
  return {
    uploads: new UploadManager(),
    picker: new SharedMediaPickerService(),
    transcoder: new VideoTranscoder(),
    image: new ImageProcessor(),
    audio: new AudioProcessor(),
    metadata: new MetadataExtractor(),
  };
}

const initUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
  chunkSize: z.number().int().positive().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const uploadParamsSchema = z.object({ id: z.string().min(1) });

const addMediaSchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'document']),
  url: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  sourceApp: z.string().min(1).default('quantube'),
});

const pickQuerySchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'document']).optional(),
  maxItems: z.coerce.number().int().min(1).max(200).optional(),
  sourceApp: z.string().optional(),
});

export default async function mediaRoutes(fastify: FastifyInstance) {
  // --- chunked upload (UploadManager) ---------------------------------------

  // POST /media/uploads — initialize a resumable chunked upload session.
  // Mutating → scoped.
  fastify.post(
    '/uploads',
    { preHandler: fastify.requireAuth({ scopes: ['media:write'] }) },
    async (request, reply) => {
      const parsed = initUploadSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const session = fastify.media.uploads.initChunkedUpload(
        parsed.data.fileName,
        parsed.data.fileSize,
        parsed.data.mimeType,
        {
          chunkSize: parsed.data.chunkSize,
          checksum: parsed.data.checksum,
          metadata: parsed.data.metadata,
        },
      );
      return reply.status(201).send({ success: true, data: { session } });
    },
  );

  // GET /media/uploads/:id — upload progress for a session. Read; global auth.
  fastify.get('/uploads/:id', async (request, reply) => {
    const parsed = uploadParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }
    const progress = fastify.media.uploads.getProgress(parsed.data.id);
    return reply.send({ success: true, data: { progress } });
  });

  // POST /media/uploads/:id/complete — assemble + finalize the upload.
  // Mutating → scoped.
  fastify.post(
    '/uploads/:id/complete',
    { preHandler: fastify.requireAuth({ scopes: ['media:write'] }) },
    async (request, reply) => {
      const parsed = uploadParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      const session = fastify.media.uploads.completeUpload(parsed.data.id);
      return reply.send({ success: true, data: { session } });
    },
  );

  // --- shared media library (SharedMediaPickerService) ----------------------

  // GET /media/library — pick recent cross-app media items. Read; global auth.
  fastify.get('/library', async (request, reply) => {
    const parsed = pickQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const items = fastify.media.picker.pick({
      types: parsed.data.type ? [parsed.data.type as MediaType] : undefined,
      maxItems: parsed.data.maxItems,
      sourceApps: parsed.data.sourceApp ? [parsed.data.sourceApp] : undefined,
    });
    return reply.send({
      success: true,
      data: { items, storage: fastify.media.picker.getTotalStorage() },
    });
  });

  // POST /media/library — register a media item in the shared picker.
  // Mutating → scoped.
  fastify.post(
    '/library',
    { preHandler: fastify.requireAuth({ scopes: ['media:write'] }) },
    async (request, reply) => {
      const parsed = addMediaSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const item: MediaItem = fastify.media.picker.addMedia({
        type: parsed.data.type as MediaType,
        url: parsed.data.url,
        name: parsed.data.name,
        size: parsed.data.size,
        mimeType: parsed.data.mimeType,
        thumbnailUrl: parsed.data.thumbnailUrl,
        sourceApp: parsed.data.sourceApp,
      });
      return reply.status(201).send({ success: true, data: { item } });
    },
  );
}
