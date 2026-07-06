import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ContactService } from '../services/contact.service';

const addContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  avatar: z.string().url().optional(),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  avatar: z.string().url().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const searchSchema = z.object({
  q: z.string().min(1),
});

const frequentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function contactsRoutes(fastify: FastifyInstance) {
  // POST /contacts
  fastify.post('/', async (request, reply) => {
    const parseResult = addContactSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.addContact({ userId, ...parseResult.data });

    return reply.status(201).send({ success: true, data: contact });
  });

  // GET /contacts
  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const result = await service.getContacts(userId, queryResult.data);

    // The frontend contract (ApiResponse<Contact[]>) expects `data` to be the
    // array itself, with pagination carried in `metadata`. Returning the raw
    // PaginatedResult object here made `data` an object, so the contacts page
    // crashed with "F.map is not a function". Unwrap it.
    return reply.send({
      success: true,
      data: result.data,
      metadata: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      },
    });
  });

  // GET /contacts/search
  fastify.get('/search', async (request, reply) => {
    const queryResult = searchSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contacts = await service.searchContacts(userId, queryResult.data.q);

    return reply.send({ success: true, data: contacts });
  });

  // GET /contacts/frequent
  fastify.get('/frequent', async (request, reply) => {
    const queryResult = frequentQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contacts = await service.getFrequentContacts(userId, queryResult.data.limit ?? 10);

    return reply.send({ success: true, data: contacts });
  });

  // PUT /contacts/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateContactSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.updateContact(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: contact });
  });

  // DELETE /contacts/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ContactService(prisma as never);
    const contact = await service.deleteContact(request.params.id, userId);

    return reply.send({ success: true, data: contact });
  });
}
