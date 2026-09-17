// ============================================================================
// QuantDocs — Document REST API Routes (Wave 9 Phase N / Task N04)
// ============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma?: unknown }).prisma;
}

function requireUserId(request: FastifyRequest): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const createDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Document title is required').default('Untitled'),
  content: z.string().optional().default(''),
  metadata: z.record(z.unknown()).optional().default({}),
  isPublic: z.boolean().optional().default(false),
});

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

const listDocumentsQuerySchema = z.object({
  search: z.string().optional(),
  q: z.string().optional(),
  sortBy: z.enum(['updatedAt', 'createdAt', 'title']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  sort: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const documentParamsSchema = z.object({
  id: z.string().min(1),
});

export default async function documentRoutes(fastify: FastifyInstance) {
  // GET /documents — Lists documents owned by user (where: { userId, isDeleted: false }) with sorting and search
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const query = listDocumentsQuerySchema.parse(request.query ?? {});

    const search = query.search ?? query.q;
    const where: Record<string, unknown> = {
      userId,
      isDeleted: false,
    };

    if (search && search.trim()) {
      where.title = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    let orderByField = query.sortBy ?? 'updatedAt';
    let orderByDirection: 'asc' | 'desc' = query.sortOrder ?? 'desc';
    if (query.sort) {
      const parts = query.sort.split(':');
      if (['updatedAt', 'createdAt', 'title'].includes(parts[0])) {
        orderByField = parts[0] as 'updatedAt' | 'createdAt' | 'title';
      }
      if (parts[1] === 'asc' || parts[1] === 'desc') {
        orderByDirection = parts[1] as 'asc' | 'desc';
      }
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { [orderByField]: orderByDirection },
      take: query.limit,
      skip: query.offset,
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        collaborators: true,
      },
    });

    return reply.send({ success: true, data: documents });
  });

  // POST /documents — Creates new document (title, content: "", userId, metadata: {}). Returns 201.
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const parsed = createDocumentSchema.parse(request.body ?? {});

    const document = await prisma.document.create({
      data: {
        title: parsed.title,
        content: parsed.content ?? '',
        userId,
        metadata: parsed.metadata ?? {},
        isPublic: parsed.isPublic ?? false,
        isDeleted: false,
      },
      include: {
        versions: true,
        collaborators: true,
      },
    });

    return reply.status(201).send({ success: true, data: document });
  });

  // GET /documents/:id — Fetches document metadata, version history, and collaborator permissions
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const { id } = documentParamsSchema.parse(request.params);

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
        },
        collaborators: true,
      },
    });

    if (!document || document.isDeleted) {
      throw createAppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.userId !== userId) {
      const isCollaborator = document.collaborators?.some(
        (c: { userId: string; role?: string }) => c.userId === userId,
      );
      if (!isCollaborator && !document.isPublic) {
        throw createAppError('Forbidden: not authorized to access this document', 403, 'FORBIDDEN');
      }
    }

    return reply.send({ success: true, data: document });
  });

  // Reusable updater for PATCH and PUT
  async function updateDocument(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const { id } = documentParamsSchema.parse(request.params);
    const parsed = updateDocumentSchema.parse(request.body ?? {});

    const existing = await prisma.document.findUnique({
      where: { id },
      include: { collaborators: true },
    });

    if (!existing || existing.isDeleted) {
      throw createAppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (existing.userId !== userId) {
      const canEdit = existing.collaborators?.some(
        (c: { userId: string; role?: string }) =>
          c.userId === userId && (c.role === 'editor' || c.role === 'admin'),
      );
      if (!canEdit) {
        throw createAppError('Forbidden: not authorized to update this document', 403, 'FORBIDDEN');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.title !== undefined) updateData.title = parsed.title;
    if (parsed.content !== undefined) updateData.content = parsed.content;
    if (parsed.isPublic !== undefined) updateData.isPublic = parsed.isPublic;

    let metadataObj = (existing.metadata as Record<string, unknown>) ?? {};
    let metadataChanged = false;
    if (parsed.metadata !== undefined) {
      metadataObj = { ...metadataObj, ...parsed.metadata };
      metadataChanged = true;
    }
    if (parsed.tags !== undefined) {
      metadataObj = { ...metadataObj, tags: parsed.tags };
      metadataChanged = true;
    }
    if (metadataChanged) {
      updateData.metadata = metadataObj;
    }

    // If content changed, snapshot version history if versioning model is present
    if (
      parsed.content !== undefined &&
      parsed.content !== existing.content &&
      prisma.documentVersion?.create
    ) {
      await prisma.documentVersion
        .create({
          data: {
            docId: existing.id,
            title: parsed.title ?? existing.title,
            content: existing.content,
          },
        })
        .catch(() => {});
    }

    const updated = await prisma.document.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
        },
        collaborators: true,
      },
    });

    return reply.send({ success: true, data: updated });
  }

  // PATCH /documents/:id — Renames document (title), updates metadata or tags
  fastify.patch<{ Params: { id: string } }>('/:id', updateDocument);
  fastify.put<{ Params: { id: string } }>('/:id', updateDocument);

  // DELETE /documents/:id — Soft-deletes document (isDeleted: true)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const { id } = documentParamsSchema.parse(request.params);

    const existing = await prisma.document.findUnique({
      where: { id },
    });

    if (!existing || existing.isDeleted) {
      throw createAppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (existing.userId !== userId) {
      throw createAppError('Forbidden: not authorized to delete this document', 403, 'FORBIDDEN');
    }

    await prisma.document.update({
      where: { id: existing.id },
      data: { isDeleted: true },
    });

    return reply.send({
      success: true,
      data: { id: existing.id, isDeleted: true },
    });
  });
}
