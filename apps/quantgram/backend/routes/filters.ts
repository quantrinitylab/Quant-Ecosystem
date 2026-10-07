import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FilterService } from '../services/filter.service';

const applyFilterSchema = z.object({
  photoId: z.string(),
  filterId: z.string(),
});

const filterService = new FilterService();

export default async function filtersRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const filters = await filterService.listFilters();

    return reply.send({ success: true, data: filters });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const filter = await filterService.getFilter(request.params.id);

    if (!filter) {
      throw createAppError('Filter not found', 404, 'FILTER_NOT_FOUND');
    }

    return reply.send({ success: true, data: filter });
  });

  fastify.post('/apply', async (request, reply) => {
    const parseResult = applyFilterSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await filterService.applyFilter(
      parseResult.data.photoId,
      parseResult.data.filterId,
    );

    return reply.send({ success: true, data: result });
  });
}
