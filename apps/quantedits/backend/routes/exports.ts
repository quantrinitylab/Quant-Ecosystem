import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ExportService } from '../services/export.service';

const queueExportSchema = z.object({
  projectId: z.string(),
  format: z.enum(['mp4', 'webm', 'mov', 'gif', 'png', 'jpg']),
  resolution: z.enum(['720p', '1080p', '4k', 'original']),
  quality: z.enum(['low', 'medium', 'high', 'lossless']),
});

// Singleton export service (in-memory)
const exportService = new ExportService();

export default async function exportsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = queueExportSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const exportJob = await exportService.queueExport(parseResult.data);

    return reply.status(201).send({ success: true, data: exportJob });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const exportJob = await exportService.getExportStatus(request.params.id);

    return reply.send({ success: true, data: exportJob });
  });

  fastify.get('/project/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const exports = await exportService.listExports(projectId);

    return reply.send({ success: true, data: exports });
  });

  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    const exportJob = await exportService.cancelExport(request.params.id);

    return reply.send({ success: true, data: exportJob });
  });
}
