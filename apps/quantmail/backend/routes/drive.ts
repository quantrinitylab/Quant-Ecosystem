// ============================================================================
// QuantMail — Drive routes (/drive/*) for the Drive page.
// The page called /drive/files etc. which did not exist ("Failed to fetch
// files"). Backed by the File + Folder Prisma models. NOTE: the Drive hook uses
// raw fetch and expects UN-enveloped shapes ({ files, quota } / the object
// itself), so these routes intentionally do NOT use { success, data }.
// Global auth hook → req.auth. (Encrypted upload/download needs object storage
// and is a follow-up; listing/folders/rename/trash work today.)
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const TOTAL_QUOTA = 15 * 1024 * 1024 * 1024; // 15 GB

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  updatedAt: Date;
};
type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  updatedAt: Date;
};

async function ownerInfo(prisma: any, userId: string): Promise<{ name: string; email: string }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });
  return { name: u?.displayName ?? u?.email ?? '', email: u?.email ?? '' };
}

function fileDto(f: FileRow, owner: { name: string; email: string }) {
  return {
    id: f.id,
    name: f.name,
    type: 'file' as const,
    mimeType: f.mimeType,
    size: f.size,
    path: '',
    parentId: f.folderId,
    modifiedAt: f.updatedAt,
    owner,
    sharedWith: [] as unknown[],
    isStarred: false,
    versions: [] as unknown[],
  };
}
function folderDto(f: FolderRow, owner: { name: string; email: string }) {
  return {
    id: f.id,
    name: f.name,
    type: 'folder' as const,
    mimeType: 'application/vnd.quant.folder',
    size: 0,
    path: f.path,
    parentId: f.parentId,
    modifiedAt: f.updatedAt,
    owner,
    sharedWith: [] as unknown[],
    isStarred: false,
    versions: [] as unknown[],
  };
}

export default async function driveRoutes(fastify: FastifyInstance) {
  // GET /drive/files?folderId= — folders + files in the current folder.
  fastify.get<{ Querystring: { folderId?: string } }>('/drive/files', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const folderId = request.query.folderId || null;
    const owner = await ownerInfo(prisma, userId);

    const [folders, files, allFiles] = await Promise.all([
      prisma.folder.findMany({ where: { userId, parentId: folderId }, orderBy: { name: 'asc' } }),
      prisma.file.findMany({
        where: { userId, folderId, isDeleted: false },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.file.findMany({ where: { userId, isDeleted: false }, select: { size: true } }),
    ]);

    const used = (allFiles as Array<{ size: number }>).reduce((s, f) => s + (f.size || 0), 0);
    return reply.send({
      files: [
        ...(folders as FolderRow[]).map((f) => folderDto(f, owner)),
        ...(files as FileRow[]).map((f) => fileDto(f, owner)),
      ],
      quota: { used, total: TOTAL_QUOTA },
    });
  });

  // GET /drive/search?q= — name search across the user's files & folders.
  fastify.get<{ Querystring: { q?: string } }>('/drive/search', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const q = (request.query.q || '').trim();
    if (!q) return reply.send({ files: [] });
    const owner = await ownerInfo(prisma, userId);
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, name: { contains: q, mode: 'insensitive' } },
        take: 50,
      }),
      prisma.file.findMany({
        where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } },
        take: 50,
      }),
    ]);
    return reply.send({
      files: [
        ...(folders as FolderRow[]).map((f) => folderDto(f, owner)),
        ...(files as FileRow[]).map((f) => fileDto(f, owner)),
      ],
    });
  });

  // POST /drive/folders — create a folder; returns the folder object directly.
  fastify.post('/drive/folders', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(200),
      parentId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const owner = await ownerInfo(prisma, userId);

    let path = `/${parsed.data.name}`;
    if (parsed.data.parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: parsed.data.parentId } });
      if (parent && parent.userId === userId) path = `${parent.path}/${parsed.data.name}`;
    }
    const created = (await prisma.folder.create({
      data: { userId, name: parsed.data.name, parentId: parsed.data.parentId ?? null, path },
    })) as FolderRow;
    return reply.status(201).send(folderDto(created, owner));
  });

  // PUT /drive/files/:id — rename a file or folder.
  fastify.put<{ Params: { id: string }; Body: { name?: string } }>(
    '/drive/files/:id',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      const name = (request.body?.name || '').trim();
      if (!name) throw createAppError('Name required', 400, 'VALIDATION_ERROR');
      const file = await prisma.file.findUnique({ where: { id: request.params.id } });
      if (file && file.userId === userId) {
        await prisma.file.update({ where: { id: request.params.id }, data: { name } });
        return reply.send({ ok: true });
      }
      const folder = await prisma.folder.findUnique({ where: { id: request.params.id } });
      if (folder && folder.userId === userId) {
        await prisma.folder.update({ where: { id: request.params.id }, data: { name } });
        return reply.send({ ok: true });
      }
      throw createAppError('Not found', 404, 'NOT_FOUND');
    },
  );

  // POST /drive/files/trash — soft-delete files by id.
  fastify.post<{ Body: { fileIds?: string[] } }>('/drive/files/trash', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const ids = Array.isArray(request.body?.fileIds) ? request.body!.fileIds! : [];
    if (ids.length > 0) {
      await prisma.file.updateMany({
        where: { id: { in: ids }, userId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await prisma.folder.deleteMany({ where: { id: { in: ids }, userId } });
    }
    return reply.send({ ok: true });
  });
}
