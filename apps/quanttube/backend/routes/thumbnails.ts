import type { FastifyInstance } from 'fastify';

export default async function thumbnailsRoutes(fastify: FastifyInstance) {
  fastify.get('/:videoId', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };
    const timestamp = (request.query as any).t || 5;

    return reply.send({
      thumbnailUrl: `/thumbnails/${videoId}_${timestamp}.jpg`,
      videoId,
      timestamp,
      message: 'Thumbnail generation ready',
    });
  });

  fastify.post('/:videoId/generate', async (request, reply) => {
    const { videoId } = request.params as { videoId: string };
    const { timestamps } = request.body as any;

    return reply.send({
      success: true,
      thumbnails: timestamps.map((t: number) => ({
        timestamp: t,
        url: `/thumbnails/${videoId}_${t}.jpg`,
      })),
    });
  });
}
