import type { FastifyInstance } from 'fastify';
import { VideoStreamService } from '../services/video-stream.service';

export default async function streamRoutes(fastify: FastifyInstance) {
  const streamService = new VideoStreamService();

  fastify.get('/videos/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    const quality = (request.query as any).quality || 'auto';

    try {
      const streamUrl = await streamService.getStreamUrl(id);

      return reply.send({
        streamUrl,
        quality,
        format: 'HLS',
        message: 'Use this URL in any HLS compatible player',
      });
    } catch (error) {
      return reply.code(404).send({ error: 'Stream not found' });
    }
  });

  fastify.get('/videos/:id/thumbnail', async (request, reply) => {
    const { id } = request.params as { id: string };
    const timestamp = (request.query as any).t || 5;

    return reply.send({
      thumbnailUrl: `/thumbnails/${id}_${timestamp}.jpg`,
      message: 'Thumbnail generation endpoint ready',
    });
  });
}
