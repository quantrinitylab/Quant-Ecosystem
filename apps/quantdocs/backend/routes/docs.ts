import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DocService } from '../services/doc.service';
import { CommentService } from '../services/comment.service';
import { ExportService } from '../services/export.service';
import { TemplateService } from '../services/template.service';

const createDocSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const updateDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const restoreVersionSchema = z.object({
  versionId: z.string().min(1),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  selection: z
    .object({
      startOffset: z.number().int().min(0),
      endOffset: z.number().int().min(0),
      selectedText: z.string(),
    })
    .optional(),
});

const replyCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

const exportSchema = z.object({
  format: z.enum(['pdf', 'docx', 'markdown', 'html', 'latex']),
});

const createFromTemplateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function sanitizeFilename(title: string): string {
  return title.replace(/[^\w\s.-]/g, '_').slice(0, 100);
}

export default async function docsRoutes(fastify: FastifyInstance) {
  const templateService = new TemplateService();
  const exportService = new ExportService();

  // POST /docs - Create document
  fastify.post('/', async (request, reply) => {
    const parseResult = createDocSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DocService(prisma as never);
    const doc = await service.createDoc({
      title: parseResult.data.title,
      content: parseResult.data.content,
      userId,
      metadata: parseResult.data.metadata,
    });

    return reply.status(201).send({ success: true, data: doc });
  });

  // GET /docs - List documents
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
    const service = new DocService(prisma as never);
    const result = await service.listDocs(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  // GET /docs/:id - Get document
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DocService(prisma as never);
    const doc = await service.getDoc(request.params.id, userId);

    return reply.send({ success: true, data: doc });
  });

  // PUT /docs/:id - Update document
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateDocSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DocService(prisma as never);
    const doc = await service.updateDoc(
      request.params.id,
      userId,
      parseResult.data.content,
      parseResult.data.title,
    );

    return reply.send({ success: true, data: doc });
  });

  // DELETE /docs/:id - Delete document
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DocService(prisma as never);
    const doc = await service.deleteDoc(request.params.id, userId);

    return reply.send({ success: true, data: doc });
  });

  // GET /docs/:id/versions - Get version history
  fastify.get<{ Params: { id: string } }>('/:id/versions', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DocService(prisma as never);
    const versions = await service.getVersionHistory(request.params.id, userId);

    return reply.send({ success: true, data: versions });
  });

  // POST /docs/:id/restore - Restore a version
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request, reply) => {
    const parseResult = restoreVersionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DocService(prisma as never);
    const doc = await service.restoreVersion(request.params.id, userId, parseResult.data.versionId);

    return reply.send({ success: true, data: doc });
  });

  // GET /docs/:id/comments - List comments
  fastify.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommentService(prisma as never);
    const comments = await service.getComments(request.params.id);

    return reply.send({ success: true, data: comments });
  });

  // POST /docs/:id/comments - Create comment
  fastify.post<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const parseResult = createCommentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommentService(prisma as never);
    const comment = await service.createComment({
      docId: request.params.id,
      userId,
      content: parseResult.data.content,
      selection: parseResult.data.selection,
    });

    return reply.status(201).send({ success: true, data: comment });
  });

  // POST /comments/:id/reply - Reply to comment
  fastify.post<{ Params: { id: string } }>('/comments/:id/reply', async (request, reply) => {
    const parseResult = replyCommentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommentService(prisma as never);
    const comment = await service.replyToComment(
      request.params.id,
      userId,
      parseResult.data.content,
    );

    return reply.status(201).send({ success: true, data: comment });
  });

  // POST /comments/:id/resolve - Resolve comment
  fastify.post<{ Params: { id: string } }>('/comments/:id/resolve', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommentService(prisma as never);
    const comment = await service.resolveComment(request.params.id, userId);

    return reply.send({ success: true, data: comment });
  });

  // POST /docs/:id/export - Export document
  fastify.post<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const parseResult = exportSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const docService = new DocService(prisma as never);
    const doc = await docService.getDoc(request.params.id, userId);

    const docContent = {
      title: doc.title,
      content: doc.content,
      metadata: doc.metadata,
    };

    const { format } = parseResult.data;

    const safeFilename = sanitizeFilename(doc.title);

    switch (format) {
      case 'markdown': {
        const markdown = exportService.exportToMarkdown(docContent);
        return reply
          .header('content-type', 'text/markdown')
          .header('content-disposition', `attachment; filename="${safeFilename}.md"`)
          .send(markdown);
      }
      case 'html': {
        const html = exportService.exportToHtml(docContent);
        return reply
          .header('content-type', 'text/html')
          .header('content-disposition', `attachment; filename="${safeFilename}.html"`)
          .send(html);
      }
      case 'pdf': {
        const pdf = exportService.exportToPdf(docContent);
        return reply
          .header('content-type', 'application/pdf')
          .header('content-disposition', `attachment; filename="${safeFilename}.pdf"`)
          .send(pdf);
      }
      case 'docx': {
        const docx = exportService.exportToDocx(docContent);
        return reply
          .header(
            'content-type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          )
          .header('content-disposition', `attachment; filename="${safeFilename}.docx"`)
          .send(docx);
      }
      case 'latex': {
        const latex = exportService.exportToLatex(docContent);
        return reply
          .header('content-type', 'application/x-latex')
          .header('content-disposition', `attachment; filename="${safeFilename}.tex"`)
          .send(latex);
      }
    }
  });

  // GET /templates - List templates
  fastify.get('/templates', async (_request, reply) => {
    const templates = templateService.getTemplates();
    return reply.send({ success: true, data: templates });
  });

  // POST /templates/:id/create - Create document from template
  fastify.post<{ Params: { id: string } }>('/templates/:id/create', async (request, reply) => {
    const parseResult = createFromTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = templateService.createFromTemplate(request.params.id, userId, parseResult.data);

    return reply.status(201).send({ success: true, data: result });
  });
}
