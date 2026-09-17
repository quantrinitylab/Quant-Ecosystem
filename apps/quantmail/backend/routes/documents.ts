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
  parentId: z.string().nullable().optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
});

const listDocumentsQuerySchema = z.object({
  search: z.string().optional(),
  q: z.string().optional(),
  sortBy: z.enum(['updatedAt', 'createdAt', 'title']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  sort: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  parentId: z.string().nullable().optional(),
});

const exportQuerySchema = z.object({
  format: z.enum(['md', 'markdown', 'html', 'json', 'txt']).default('md'),
});

const documentParamsSchema = z.object({
  id: z.string().min(1),
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n')
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n')
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownToHtml(md: string): string {
  if (/<(p|h[1-6]|ul|ol|li|blockquote|div|table|pre)[^>]*>/i.test(md)) {
    return md;
  }
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        if (inList) {
          htmlLines.push('</ul>');
          inList = false;
        }
        htmlLines.push('<pre><code>');
        inCodeBlock = true;
      } else {
        htmlLines.push('</code></pre>');
        inCodeBlock = false;
      }
      continue;
    }
    if (inCodeBlock) {
      htmlLines.push(escapeHtml(rawLine));
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<h3>${formatInline(line.slice(4))}</h3>`);
    } else if (line.startsWith('> ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        htmlLines.push('<ul>');
        inList = true;
      }
      htmlLines.push(`<li>${formatInline(line.slice(2))}</li>`);
    } else if (line === '---') {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push('<hr />');
    } else if (line.trim().length === 0) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<p>${formatInline(line)}</p>`);
    }
  }
  if (inList) htmlLines.push('</ul>');
  if (inCodeBlock) htmlLines.push('</code></pre>');

  return htmlLines.join('\n');
}

function extractTextFromTipTap(node: any): string {
  if (!node) return '';
  if (node.text) return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join('\n');
  }
  return '';
}

function parseContentIfJson(content: string): { isJson: boolean; text?: string; json?: any } {
  const trimmed = content.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.type === 'doc' && Array.isArray(parsed?.content)) {
        const extractedText = extractTextFromTipTap(parsed);
        return { isJson: true, text: extractedText, json: parsed };
      }
      return { isJson: true, json: parsed };
    } catch {
      return { isJson: false };
    }
  }
  return { isJson: false };
}

export default async function documentRoutes(fastify: FastifyInstance) {
  // GET /documents — Lists documents owned by user (where: { userId, isDeleted: false }) with sorting, search across title & content, and parentId filtering
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
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { content: { contains: search.trim(), mode: 'insensitive' } },
      ];
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

    let documents = await prisma.document.findMany({
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

    if (query.parentId !== undefined) {
      if (query.parentId === 'root' || query.parentId === 'null' || query.parentId === null) {
        documents = documents.filter((doc: any) => {
          const pid = (doc.metadata as Record<string, unknown> | null)?.parentId;
          return pid === undefined || pid === null || pid === '';
        });
      } else {
        documents = documents.filter((doc: any) => {
          const pid = (doc.metadata as Record<string, unknown> | null)?.parentId;
          return pid === query.parentId;
        });
      }
    }

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      documents = documents.filter((doc: any) => {
        const titleMatch = (doc.title || '').toLowerCase().includes(term);
        const contentMatch = (doc.content || '').toLowerCase().includes(term);
        return titleMatch || contentMatch;
      });
    }

    return reply.send({ success: true, data: documents });
  });

  // POST /documents — Creates new document (title, content: "", userId, metadata: {}). Returns 201.
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const parsed = createDocumentSchema.parse(request.body ?? {});

    if (parsed.parentId) {
      const parentDoc = await prisma.document.findFirst({
        where: { id: parsed.parentId, userId, isDeleted: false },
      });
      if (!parentDoc) {
        throw createAppError('Parent document not found', 404, 'PARENT_DOCUMENT_NOT_FOUND');
      }
    }

    const document = await prisma.document.create({
      data: {
        title: parsed.title,
        content: parsed.content ?? '',
        userId,
        metadata: {
          ...(parsed.metadata ?? {}),
          parentId:
            parsed.parentId !== undefined
              ? parsed.parentId
              : ((parsed.metadata as any)?.parentId ?? null),
        },
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

  // GET /documents/:id — Fetches document metadata, version history, collaborator permissions, subpages, and breadcrumbs
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

    // Fetch subpages for this document: all user documents whose metadata.parentId === id and isDeleted: false
    let allUserDocs: any[] = [];
    try {
      allUserDocs =
        (await prisma.document.findMany({
          where: {
            userId: document.userId,
            isDeleted: false,
          },
        })) || [];
    } catch {
      allUserDocs = [];
    }

    const subpages = allUserDocs.filter(
      (d: any) => (d.metadata as Record<string, unknown> | null)?.parentId === id,
    );

    // Compute breadcrumbs hierarchy: recursively resolve ancestral chain of parent documents up to root: breadcrumbs: [{ id, title }, ...]
    const docMap = new Map<string, any>(allUserDocs.map((d: any) => [d.id, d]));
    const breadcrumbs: Array<{ id: string; title: string }> = [];
    const visited = new Set<string>([document.id]);
    let currentParentId = (document.metadata as Record<string, unknown> | null)?.parentId as
      | string
      | null
      | undefined;

    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      let parentDoc = docMap.get(currentParentId);
      if (!parentDoc && prisma.document?.findFirst) {
        parentDoc = await prisma.document.findFirst({
          where: { id: currentParentId, userId: document.userId, isDeleted: false },
        });
      }
      if (!parentDoc || parentDoc.isDeleted) break;
      breadcrumbs.unshift({ id: parentDoc.id, title: parentDoc.title });
      currentParentId = (parentDoc.metadata as Record<string, unknown> | null)?.parentId as
        | string
        | null
        | undefined;
    }

    return reply.send({
      success: true,
      data: {
        ...document,
        subpages,
        breadcrumbs,
      },
    });
  });

  // GET /documents/:id/export — Exports document to specified format (md, html, json, txt)
  fastify.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const { id } = documentParamsSchema.parse(request.params);
    const { format } = exportQuerySchema.parse(request.query ?? {});

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
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

    const safeFileName = (document.title || 'Untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
    let ext = 'md';
    let contentType = 'text/markdown; charset=utf-8';
    let exportedContent = '';

    const contentStr = document.content ?? '';
    const jsonInfo = parseContentIfJson(contentStr);

    switch (format) {
      case 'json': {
        ext = 'json';
        contentType = 'application/json; charset=utf-8';
        if (jsonInfo.isJson && jsonInfo.json !== undefined) {
          exportedContent = JSON.stringify(jsonInfo.json, null, 2);
        } else {
          exportedContent = JSON.stringify(
            {
              id: document.id,
              title: document.title,
              content: contentStr,
              metadata: document.metadata ?? {},
            },
            null,
            2,
          );
        }
        break;
      }
      case 'html': {
        ext = 'html';
        contentType = 'text/html; charset=utf-8';
        const bodyContent = jsonInfo.isJson ? (jsonInfo.text ?? '') : contentStr;
        const bodyHtml = markdownToHtml(bodyContent);
        exportedContent = `<!DOCTYPE html><html><head><title>${document.title}</title></head><body><h1>${document.title}</h1>${bodyHtml ? `\n${bodyHtml}\n` : ''}</body></html>`;
        break;
      }
      case 'txt': {
        ext = 'txt';
        contentType = 'text/plain; charset=utf-8';
        const bodyContent = jsonInfo.isJson ? (jsonInfo.text ?? '') : contentStr;
        exportedContent = stripHtml(bodyContent);
        break;
      }
      case 'md':
      case 'markdown':
      default: {
        ext = 'md';
        contentType = 'text/markdown; charset=utf-8';
        const bodyContent = jsonInfo.isJson ? (jsonInfo.text ?? '') : contentStr;
        if (/<[a-z][\s\S]*>/i.test(bodyContent)) {
          exportedContent = htmlToMarkdown(bodyContent);
        } else {
          exportedContent = bodyContent;
        }
        break;
      }
    }

    return reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `attachment; filename="${safeFileName}.${ext}"`)
      .send(exportedContent);
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
    if (parsed.parentId !== undefined) {
      if (parsed.parentId) {
        const parentDoc = await prisma.document.findFirst({
          where: { id: parsed.parentId, userId, isDeleted: false },
        });
        if (!parentDoc) {
          throw createAppError('Parent document not found', 404, 'PARENT_DOCUMENT_NOT_FOUND');
        }
      }
      metadataObj = { ...metadataObj, parentId: parsed.parentId };
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
