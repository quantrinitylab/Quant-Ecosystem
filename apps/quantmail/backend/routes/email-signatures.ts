import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { EmailSignatureService } from '../services/email-signature.service';

const createSignatureSchema = z.object({
  name: z.string().min(1).max(200),
  contentHtml: z.string().min(1),
  isDefault: z.boolean().optional(),
});

const updateSignatureSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contentHtml: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

export default async function emailSignaturesRoutes(fastify: FastifyInstance) {
  // POST /email-signatures
  fastify.post('/', async (request, reply) => {
    const parseResult = createSignatureSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signature = await service.createSignature(userId, parseResult.data);

    return reply.status(201).send({ success: true, data: signature });
  });

  // GET /email-signatures
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signatures = await service.listSignatures(userId);

    return reply.send({ success: true, data: signatures });
  });

  // GET /email-signatures/default
  fastify.get('/default', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signature = await service.getDefaultSignature(userId);

    return reply.send({ success: true, data: signature });
  });

  // GET /email-signatures/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signature = await service.getSignature(request.params.id, userId);

    return reply.send({ success: true, data: signature });
  });

  // PUT /email-signatures/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateSignatureSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signature = await service.updateSignature(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: signature });
  });

  // POST /email-signatures/:id/default
  fastify.post<{ Params: { id: string } }>('/:id/default', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signature = await service.setDefault(request.params.id, userId);

    return reply.send({ success: true, data: signature });
  });

  // DELETE /email-signatures/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailSignatureService(prisma as never);
    const signature = await service.deleteSignature(request.params.id, userId);

    return reply.send({ success: true, data: signature });
  });
}
