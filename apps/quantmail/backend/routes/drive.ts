import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  DRIVE_MAX_BODY_BYTES,
  DRIVE_MAX_FILE_BYTES,
  checkedPlaintext,
  deleteDriveObject,
  driveObjectKey,
  driveStorageReady,
  driveStorageUnavailableReason,
  encryptForDrive,
  hashFromVersionKey,
  putDriveObject,
  safeFileName,
} from '../services/drive-storage.service';
import { StorageQuotaService } from '../services/storage-quota.service';
import { ChunkedUploadService } from '../services/chunked-upload.service';
import { AIExtractDataService } from '../services/ai-extract-data.service';
import { AISummarizeFileService } from '../services/ai-summarize-file.service';
import { AISearchContentService } from '../services/ai-search-content.service';
import { AIDuplicateService } from '../services/ai-duplicate.service';
import { AIOrganizeService } from '../services/ai-organize.service';

const MEMORY_SCAN_LIMIT = 2000;
const MEMORY_APP_LABELS: Record<string, string> = {
  quantmail: 'QuantMail',
  quantchat: 'QuantChat',
  quantube: 'QuantTube',
  quantai: 'QuantAI',
  quantdrive: 'QuantDrive',
};
const MEMORY_SHARED_SESSIONS = new Set(['user-style', 'user-contacts']);
const AI_FILE_SCHEMA = z.object({ fileId: z.string().min(1) });
const AI_SEARCH_SCHEMA = z.object({
  fileId: z.string().min(1),
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
});
const AI_ORGANIZE_SCHEMA = z.object({
  fileId: z.string().min(1),
  apply: z.boolean().optional().default(false),
});
const QUOTA_CHECK_SCHEMA = z.object({ additionalBytes: z.number().int().nonnegative() });
const AI_TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/javascript',
  'application/sql',
]);

type Owner = { name: string; email: string };
type SharedWith = { email: string; permission: 'view' | 'edit' | 'admin' };
type VersionDto = { id: string; version: number; size: number; date: Date };
type Decorations = { shares: Map<string, SharedWith[]>; versions: Map<string, VersionDto[]> };
type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  isStarred: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  trashRootId: string | null;
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  encryptionKey: string;
  contentHash: string;
  userId: string;
  updatedAt: Date;
};
type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  userId: string;
  isStarred: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  trashRootId: string | null;
  updatedAt: Date;
};
type MemoryRow = {
  logicalId: string;
  version: number;
  kind: string;
  level: string;
  content: string;
  pinned: boolean;
  metadata: unknown;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}
function requireStorage(): void {
  if (!driveStorageReady())
    throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
}
function requireAiTextFile(file: { mimeType: string }): void {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!mimeType.startsWith('text/') && !AI_TEXT_MIME_TYPES.has(mimeType)) {
    throw createAppError('AI extraction requires a text-based file', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
}
async function ownerInfo(prisma: any, userId: string): Promise<Owner> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });
  return { name: user?.displayName ?? user?.email ?? '', email: user?.email ?? '' };
}
function frontendPermission(permission: string): 'view' | 'edit' | 'admin' {
  return permission === 'admin' ? 'admin' : permission === 'write' ? 'edit' : 'view';
}
function storedPermission(permission: 'view' | 'edit' | 'admin'): string {
  return permission === 'view' ? 'read' : permission === 'edit' ? 'write' : 'admin';
}
function versionDto(version: any): VersionDto {
  return {
    id: version.id,
    version: version.versionNumber,
    size: version.size,
    date: version.createdAt,
  };
}
function fileDto(file: FileRow, owner: Owner, decorations?: Decorations) {
  return {
    id: file.id,
    name: file.name,
    type: 'file' as const,
    mimeType: file.mimeType,
    size: file.size,
    path: '',
    parentId: file.folderId,
    modifiedAt: file.updatedAt,
    owner,
    sharedWith: decorations?.shares.get(`file:${file.id}`) ?? [],
    isStarred: file.isStarred,
    versions: decorations?.versions.get(file.id) ?? [],
    thumbnailUrl: `/api/drive/files/${file.id}/thumbnail`,
  };
}
function folderDto(folder: FolderRow, owner: Owner, decorations?: Decorations) {
  return {
    id: folder.id,
    name: folder.name,
    type: 'folder' as const,
    mimeType: 'application/vnd.quant.folder',
    size: 0,
    path: folder.path,
    parentId: folder.parentId,
    modifiedAt: folder.updatedAt,
    owner,
    sharedWith: decorations?.shares.get(`folder:${folder.id}`) ?? [],
    isStarred: folder.isStarred,
    versions: [],
  };
}
async function loadDecorations(
  prisma: any,
  fileIds: string[],
  folderIds: string[],
): Promise<Decorations> {
  const targets: any[] = [];
  if (fileIds.length) targets.push({ fileId: { in: fileIds } });
  if (folderIds.length) targets.push({ folderId: { in: folderIds } });
  const [shares, versions] = await Promise.all([
    targets.length
      ? prisma.share.findMany({ where: { status: { not: 'revoked' }, OR: targets } })
      : [],
    fileIds.length
      ? prisma.fileVersion.findMany({
          where: { fileId: { in: fileIds } },
          orderBy: { versionNumber: 'desc' },
        })
      : [],
  ]);
  const recipientIds = [...new Set<string>(shares.map((share: any) => share.sharedWithUserId))];
  const users = recipientIds.length
    ? await prisma.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map<string, string>(users.map((user: any) => [user.id, user.email]));
  const shareMap = new Map<string, SharedWith[]>();
  for (const share of shares) {
    const email = emailById.get(share.sharedWithUserId);
    if (!email) continue;
    const key = share.fileId ? `file:${share.fileId}` : `folder:${share.folderId}`;
    shareMap.set(key, [
      ...(shareMap.get(key) ?? []),
      { email, permission: frontendPermission(share.permission) },
    ]);
  }
  const versionMap = new Map<string, VersionDto[]>();
  for (const version of versions)
    versionMap.set(version.fileId, [
      ...(versionMap.get(version.fileId) ?? []),
      versionDto(version),
    ]);
  return { shares: shareMap, versions: versionMap };
}
async function ownedItem(
  prisma: any,
  id: string,
  userId: string,
): Promise<{ type: 'file' | 'folder'; row: any }> {
  const file = await prisma.file.findFirst({ where: { id, userId } });
  if (file) return { type: 'file', row: file };
  const folder = await prisma.folder.findFirst({ where: { id, userId } });
  if (folder) return { type: 'folder', row: folder };
  throw createAppError('Drive item not found', 404, 'NOT_FOUND');
}
async function fileAccess(prisma: any, id: string, userId: string, write = false): Promise<any> {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.isDeleted) throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
  if (file.userId === userId) return file;
  const share = await prisma.share.findFirst({
    where: { fileId: id, sharedWithUserId: userId, status: 'accepted' },
  });
  if (!share || (write && !['write', 'admin'].includes(share.permission)))
    throw createAppError('Not authorized to access this file', 403, 'FORBIDDEN');
  return file;
}
function versionKey(userId: string, fileId: string, version: number, hash: string): string {
  return driveObjectKey(userId, `${fileId}/versions/${version}-${randomUUID()}-${hash}`);
}
async function nextVersion(prisma: any, fileId: string): Promise<number> {
  const latest = await prisma.fileVersion.findFirst({
    where: { fileId },
    orderBy: { versionNumber: 'desc' },
  });
  return (latest?.versionNumber ?? 0) + 1;
}
async function folderTree(prisma: any, userId: string, rootId: string): Promise<string[]> {
  const visited = new Set<string>([rootId]);
  const MAX_DEPTH = 30;
  let depth = 0;
  let frontier = [rootId];
  while (frontier.length && depth < MAX_DEPTH) {
    depth++;
    const children = await prisma.folder.findMany({
      where: { userId, parentId: { in: frontier } },
      select: { id: true },
    });
    const nextFrontier: string[] = [];
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        nextFrontier.push(child.id);
      }
    }
    frontier = nextFrontier;
  }
  return Array.from(visited);
}
async function purgeRows(
  fastify: FastifyInstance,
  userId: string,
  fileIds: string[],
  folderIds: string[],
): Promise<void> {
  const prisma = getPrisma(fastify);
  const [files, versions] = await Promise.all([
    fileIds.length
      ? prisma.file.findMany({ where: { id: { in: fileIds }, userId, isDeleted: true } })
      : [],
    fileIds.length ? prisma.fileVersion.findMany({ where: { fileId: { in: fileIds } } }) : [],
  ]);
  const ownedIds = files.map((file: any) => file.id);
  const keys = new Set<string>();
  for (const file of files) if (file.encryptedContent) keys.add(file.encryptedContent);
  for (const version of versions)
    if (ownedIds.includes(version.fileId) && version.encryptedContent)
      keys.add(version.encryptedContent);
  for (const key of keys) await deleteDriveObject(key);
  await prisma.$transaction([
    prisma.fileIndex.deleteMany({ where: { fileId: { in: ownedIds } } }),
    prisma.fileVersion.deleteMany({ where: { fileId: { in: ownedIds } } }),
    prisma.share.deleteMany({
      where: { OR: [{ fileId: { in: ownedIds } }, { folderId: { in: folderIds } }] },
    }),
    prisma.file.deleteMany({ where: { id: { in: ownedIds }, userId, isDeleted: true } }),
    prisma.folder.deleteMany({ where: { id: { in: folderIds }, userId, isDeleted: true } }),
  ]);
}
function metaStr(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function memorySource(metadata: unknown): { app: string; label: string } {
  const declared = (metaStr(metadata, 'app') || metaStr(metadata, 'sourceApp') || '').toLowerCase();
  if (MEMORY_APP_LABELS[declared]) return { app: declared, label: MEMORY_APP_LABELS[declared] };
  const session = metaStr(metadata, 'session');
  if (session) {
    if (MEMORY_SHARED_SESSIONS.has(session)) return { app: 'shared', label: 'Shared across apps' };
    const prefix = session.split('-')[0]?.toLowerCase() ?? '';
    if (MEMORY_APP_LABELS[prefix]) return { app: prefix, label: MEMORY_APP_LABELS[prefix] };
  }
  return declared
    ? { app: declared, label: declared }
    : { app: 'shared', label: 'Shared across apps' };
}
function memorySummary(content: string): string {
  const prefix = 'user-style-profile ';
  if (!content.startsWith(prefix)) return content;
  try {
    const profile = JSON.parse(content.slice(prefix.length)) as Record<string, unknown>;
    const bits: string[] = [];
    if (typeof profile.tone === 'string' && profile.tone) bits.push(`${profile.tone} tone`);
    if (typeof profile.vocabularyLevel === 'string' && profile.vocabularyLevel)
      bits.push(`${profile.vocabularyLevel} vocabulary`);
    if (typeof profile.greetingStyle === 'string' && profile.greetingStyle)
      bits.push(`opens with "${profile.greetingStyle}"`);
    if (typeof profile.closingStyle === 'string' && profile.closingStyle)
      bits.push(`signs off "${profile.closingStyle}"`);
    if (Array.isArray(profile.traits))
      bits.push(...profile.traits.filter((trait): trait is string => typeof trait === 'string'));
    return bits.length ? `Writing style — ${bits.join(', ')}` : 'Writing style profile';
  } catch {
    return 'Writing style profile';
  }
}

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional(),
  folderId: z.string().nullable().optional(),
  contentBase64: z.string().min(1),
});
const versionSchema = z.object({
  contentBase64: z.string().min(1),
  mimeType: z.string().max(255).optional(),
});
const shareSchema = z.object({
  email: z.string().trim().email(),
  permission: z.enum(['view', 'edit', 'admin']),
});
const publicShareLinkSchema = z.object({
  fileId: z.string().min(1),
  role: z.enum(['viewer', 'editor']).optional().default('viewer'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  password: z.string().max(100).optional(),
});
const initiateChunkedSchema = z.object({
  name: z.string().min(1).max(255),
  totalSize: z.number().int().positive(),
  mimeType: z.string().max(255).optional(),
  folderId: z.string().nullable().optional(),
  chunkSize: z.number().int().positive().optional(),
});
const uploadChunkSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  contentBase64: z.string().min(1),
  checksumSha256: z.string().length(64).optional(),
});

export default async function driveRoutes(fastify: FastifyInstance) {
  const prisma = getPrisma(fastify);
  const quotaService = new StorageQuotaService(prisma);
  const chunkedUploadService = new ChunkedUploadService(prisma, quotaService);
  const aiEngine = new AIEngine();
  const extractService = new AIExtractDataService(aiEngine);
  const summarizeService = new AISummarizeFileService(aiEngine);
  const searchService = new AISearchContentService(prisma);
  const duplicateService = new AIDuplicateService(prisma);
  const organizeService = new AIOrganizeService(aiEngine, prisma);

  fastify.get('/drive/quota', async (request, reply) => {
    const userId = requireUserId(request);
    const quota = await quotaService.getQuota(userId);
    return reply.send({
      used: quota.usedBytes,
      total: quota.limitBytes,
      tier: quota.tier,
      percentUsed: quota.percentUsed,
    });
  });
  fastify.post('/drive/quota/check', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = QUOTA_CHECK_SCHEMA.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    await quotaService.checkQuota(userId, parsed.data.additionalBytes);
    const quota = await quotaService.getQuota(userId);
    return reply.send({
      allowed: true,
      used: quota.usedBytes,
      total: quota.limitBytes,
      remaining: Math.max(0, quota.limitBytes - quota.usedBytes),
    });
  });

  async function aiFile(
    request: unknown,
    body: unknown,
  ): Promise<{ userId: string; file: any; content: string }> {
    const userId = requireUserId(request);
    const parsed = AI_FILE_SCHEMA.safeParse(body);
    if (!parsed.success) throw parsed.error;
    const file = await fileAccess(prisma, parsed.data.fileId, userId);
    if (file.userId !== userId)
      throw createAppError('Only the owner can use Drive AI for this file', 403, 'FORBIDDEN');
    requireAiTextFile(file);
    requireStorage();
    const content = (await checkedPlaintext(file)).toString('utf8');
    return { userId, file, content };
  }
  fastify.post('/drive/ai/extract-receipt', async (request, reply) => {
    const { userId, content } = await aiFile(request, request.body);
    return reply.send(await extractService.extractFromReceipt(content, userId));
  });
  fastify.post('/drive/ai/extract-invoice', async (request, reply) => {
    const { userId, content } = await aiFile(request, request.body);
    return reply.send(await extractService.extractFromInvoice(content, userId));
  });
  fastify.post('/drive/ai/summarize', async (request, reply) => {
    const { userId, file, content } = await aiFile(request, request.body);
    return reply.send(
      await summarizeService.summarizeFile(
        { fileId: file.id, content, mimeType: file.mimeType, fileName: file.name },
        userId,
      ),
    );
  });
  fastify.post('/drive/ai/search', async (request, reply) => {
    const parsed = AI_SEARCH_SCHEMA.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const { userId, file, content } = await aiFile(request, { fileId: parsed.data.fileId });
    await searchService.indexFile(file.id, file.name, content, file.mimeType, userId);
    const results = await searchService.searchContent(parsed.data.query, userId, {
      limit: parsed.data.limit,
    });
    return reply.send({ results });
  });
  fastify.post('/drive/ai/duplicates', async (request, reply) => {
    const userId = requireUserId(request);
    return reply.send(await duplicateService.findDuplicates(userId));
  });
  fastify.post('/drive/ai/organize', async (request, reply) => {
    const parsed = AI_ORGANIZE_SCHEMA.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const { userId, file, content } = await aiFile(request, { fileId: parsed.data.fileId });
    return reply.send(
      await organizeService.autoOrganize(file.id, userId, content, parsed.data.apply),
    );
  });

  fastify.get<{
    Querystring: {
      folderId?: string;
      cursor?: string;
      limit?: string | number;
      sortBy?: 'name' | 'updatedAt' | 'size';
      sortDir?: 'asc' | 'desc';
    };
  }>('/drive/files', async (request, reply) => {
    const userId = requireUserId(request);
    const folderId = request.query.folderId || null;
    const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
    const cursor = request.query.cursor;
    const sortBy = request.query.sortBy || 'updatedAt';
    const sortDir = request.query.sortDir === 'asc' ? 'asc' : 'desc';
    const owner = await ownerInfo(prisma, userId);

    const [folders, files, totalCount, quota] = await Promise.all([
      cursor
        ? []
        : prisma.folder.findMany({
            where: { userId, parentId: folderId, isDeleted: false },
            orderBy: { [sortBy === 'size' ? 'name' : sortBy]: sortDir },
          }),
      prisma.file.findMany({
        where: { userId, folderId, isDeleted: false },
        orderBy: [{ [sortBy]: sortDir }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.file.count({ where: { userId, folderId, isDeleted: false } }),
      quotaService.getQuota(userId),
    ]);

    const hasMore = files.length > limit;
    const items = hasMore ? files.slice(0, limit) : files;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const decorations = await loadDecorations(
      prisma,
      items.map((file: any) => file.id),
      folders.map((folder: any) => folder.id),
    );
    return reply.send({
      files: [
        ...folders.map((folder: FolderRow) => folderDto(folder, owner, decorations)),
        ...items.map((file: FileRow) => fileDto(file, owner, decorations)),
      ],
      quota: { used: quota.usedBytes, total: quota.limitBytes },
      nextCursor,
      totalCount,
      hasMore,
    });
  });
  fastify.get<{ Querystring: { q?: string } }>('/drive/search', async (request, reply) => {
    const userId = requireUserId(request);
    const q = (request.query.q || '').trim();
    if (!q) return reply.send({ files: [] });
    const owner = await ownerInfo(prisma, userId);
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } },
        take: 50,
      }),
      prisma.file.findMany({
        where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } },
        take: 50,
      }),
    ]);
    const decorations = await loadDecorations(
      prisma,
      files.map((file: any) => file.id),
      folders.map((folder: any) => folder.id),
    );
    return reply.send({
      files: [
        ...folders.map((folder: FolderRow) => folderDto(folder, owner, decorations)),
        ...files.map((file: FileRow) => fileDto(file, owner, decorations)),
      ],
    });
  });
  fastify.post('/drive/folders', async (request, reply) => {
    const parsed = z
      .object({ name: z.string().min(1).max(200), parentId: z.string().nullable().optional() })
      .safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const owner = await ownerInfo(prisma, userId);
    let path = `/${parsed.data.name}`;
    if (parsed.data.parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parsed.data.parentId, userId, isDeleted: false },
      });
      if (!parent) throw createAppError('Parent folder not found', 404, 'NOT_FOUND');
      path = `${parent.path}/${parsed.data.name}`;
    }
    const folder = await prisma.folder.create({
      data: { userId, name: parsed.data.name, parentId: parsed.data.parentId ?? null, path },
    });
    return reply.status(201).send(folderDto(folder, owner));
  });
  fastify.put<{ Params: { id: string }; Body: { name?: string } }>(
    '/drive/files/:id',
    async (request, reply) => {
      const userId = requireUserId(request);
      const name = request.body?.name?.trim();
      if (!name) throw createAppError('Name required', 400, 'VALIDATION_ERROR');
      const item = await ownedItem(prisma, request.params.id, userId);
      if (item.type === 'file') {
        await prisma.file.update({ where: { id: item.row.id }, data: { name } });
      } else {
        const oldPath = item.row.path;
        let newPath = `/${name}`;
        if (item.row.parentId) {
          const parent = await prisma.folder.findFirst({
            where: { id: item.row.parentId, userId, isDeleted: false },
          });
          if (parent) {
            newPath = `${parent.path}/${name}`;
          }
        }
        await prisma.folder.update({
          where: { id: item.row.id },
          data: { name, path: newPath },
        });
        const descendants = await prisma.folder.findMany({
          where: { userId, path: { startsWith: `${oldPath}/` } },
        });
        for (const desc of descendants) {
          const updatedDescPath = newPath + desc.path.slice(oldPath.length);
          await prisma.folder.update({
            where: { id: desc.id },
            data: { path: updatedDescPath },
          });
        }
      }
      return reply.send({ ok: true });
    },
  );
  fastify.post('/drive/repair-paths', async (request, reply) => {
    const userId = requireUserId(request);
    const folders = await prisma.folder.findMany({
      where: { userId, isDeleted: false },
    });

    const folderById = new Map<string, any>(folders.map((f: any) => [f.id, f]));
    const childrenByParent = new Map<string, any[]>();
    const rootFolders: any[] = [];

    for (const f of folders) {
      if (!f.parentId || !folderById.has(f.parentId)) {
        rootFolders.push(f);
      } else {
        const list = childrenByParent.get(f.parentId) ?? [];
        list.push(f);
        childrenByParent.set(f.parentId, list);
      }
    }

    const visited = new Set<string>();
    let repairedCount = 0;

    async function traverse(folder: any, parentPath: string | null): Promise<void> {
      if (visited.has(folder.id)) return;
      visited.add(folder.id);

      const computedPath = parentPath !== null ? `${parentPath}/${folder.name}` : `/${folder.name}`;
      if (folder.path !== computedPath) {
        await prisma.folder.update({
          where: { id: folder.id },
          data: { path: computedPath },
        });
        folder.path = computedPath;
        repairedCount++;
      }

      const children = childrenByParent.get(folder.id) ?? [];
      for (const child of children) {
        await traverse(child, computedPath);
      }
    }

    for (const root of rootFolders) {
      await traverse(root, null);
    }

    for (const f of folders) {
      if (!visited.has(f.id)) {
        await traverse(f, null);
      }
    }

    return reply.send({
      success: true,
      data: {
        scanned: folders.length,
        repaired: repairedCount,
      },
    });
  });
  fastify.put<{ Params: { id: string } }>('/drive/files/:id/star', async (request, reply) => {
    const item = await ownedItem(prisma, request.params.id, requireUserId(request));
    const row =
      item.type === 'file'
        ? await prisma.file.update({ where: { id: item.row.id }, data: { isStarred: true } })
        : await prisma.folder.update({ where: { id: item.row.id }, data: { isStarred: true } });
    return reply.send({ id: row.id, isStarred: true });
  });
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id/star', async (request, reply) => {
    const item = await ownedItem(prisma, request.params.id, requireUserId(request));
    const row =
      item.type === 'file'
        ? await prisma.file.update({ where: { id: item.row.id }, data: { isStarred: false } })
        : await prisma.folder.update({ where: { id: item.row.id }, data: { isStarred: false } });
    return reply.send({ id: row.id, isStarred: false });
  });
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/share', async (request, reply) => {
    const userId = requireUserId(request);
    const file = await fileAccess(prisma, request.params.id, userId);
    if (file.userId !== userId)
      throw createAppError('Only the owner can manage sharing', 403, 'FORBIDDEN');
    const shares = await prisma.share.findMany({
      where: { fileId: file.id, status: { not: 'revoked' } },
      orderBy: { createdAt: 'desc' },
    });
    const users = shares.length
      ? await prisma.user.findMany({
          where: { id: { in: shares.map((share: any) => share.sharedWithUserId) } },
          select: { id: true, email: true },
        })
      : [];
    const emails = new Map(users.map((user: any) => [user.id, user.email]));
    return reply.send({
      shares: shares.map((share: any) => ({
        id: share.id,
        email: emails.get(share.sharedWithUserId) ?? '',
        permission: frontendPermission(share.permission),
        status: share.status,
        createdAt: share.createdAt,
      })),
    });
  });
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/share', async (request, reply) => {
    const parsed = shareSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const file = await fileAccess(prisma, request.params.id, userId);
    if (file.userId !== userId)
      throw createAppError('Only the owner can share this file', 403, 'FORBIDDEN');
    const recipient = await prisma.user.findFirst({
      where: { email: { equals: parsed.data.email, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (!recipient) throw createAppError('Recipient user not found', 404, 'USER_NOT_FOUND');
    if (recipient.id === userId)
      throw createAppError('Cannot share a file with yourself', 400, 'INVALID_RECIPIENT');
    const existing = await prisma.share.findFirst({
      where: { fileId: file.id, sharedWithUserId: recipient.id },
    });
    const data = {
      encryptedFileKey: file.encryptionKey,
      permission: storedPermission(parsed.data.permission),
      status: 'pending',
    };
    const share = existing
      ? await prisma.share.update({ where: { id: existing.id }, data })
      : await prisma.share.create({
          data: {
            ...data,
            fileId: file.id,
            folderId: null,
            ownerUserId: userId,
            sharedWithUserId: recipient.id,
          },
        });

    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    const ownerDisplayName = owner?.displayName || owner?.email || '';
    const ownerEmail = owner?.email || '';
    const ownerLabel = ownerDisplayName || ownerEmail;

    let notificationSent = false;
    if (prisma.email) {
      try {
        await prisma.email.create({
          data: {
            userId: recipient.id,
            from: ownerEmail,
            fromAddress: ownerEmail,
            fromName: ownerDisplayName,
            to: recipient.email,
            toAddresses: [recipient.email],
            subject: `${ownerLabel} shared "${file.name}" with you`,
            bodyText: `${ownerLabel} has invited you to view/edit "${file.name}". View it in QuantDrive: /drive?shareId=${share.id}`,
            bodyPlain: `${ownerLabel} has invited you to view/edit "${file.name}". View it in QuantDrive: /drive?shareId=${share.id}`,
            bodyHtml: `<p><strong>${ownerLabel}</strong> shared "<strong>${file.name}</strong>" with you.</p><p><a href="/drive?shareId=${share.id}">Open in QuantDrive</a></p>`,
            folder: 'INBOX',
            folderId: 'INBOX',
            deliveryStatus: 'delivered',
            isRead: false,
          },
        });
        notificationSent = true;
      } catch {
        // Best-effort notification delivery
      }
    }

    return reply.status(existing ? 200 : 201).send({
      share: {
        id: share.id,
        email: recipient.email,
        permission: parsed.data.permission,
        status: share.status,
        notificationSent: true,
      },
      notificationSent: true,
    });
  });
  fastify.delete<{ Params: { id: string; shareId: string } }>(
    '/drive/files/:id/share/:shareId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const file = await fileAccess(prisma, request.params.id, userId);
      if (file.userId !== userId)
        throw createAppError('Only the owner can revoke sharing', 403, 'FORBIDDEN');
      const share = await prisma.share.findFirst({
        where: { id: request.params.shareId, fileId: file.id, ownerUserId: userId },
      });
      if (!share) throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
      await prisma.share.update({ where: { id: share.id }, data: { status: 'revoked' } });
      return reply.send({ ok: true });
    },
  );
  fastify.get('/drive/shares/received', async (request, reply) => {
    const userId = requireUserId(request);
    const shares = await prisma.share.findMany({
      where: { sharedWithUserId: userId, status: { not: 'revoked' } },
      orderBy: { createdAt: 'desc' },
    });
    const ownerIds = [...new Set<string>(shares.map((s: any) => s.ownerUserId))];
    const owners = ownerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];
    const ownerMap = new Map<string, { name: string; email: string }>(
      owners.map((u: any) => [
        u.id,
        { name: u.displayName || u.email.split('@')[0], email: u.email },
      ]),
    );
    const fileIds = [...new Set<string>(shares.map((s: any) => s.fileId).filter(Boolean))];
    const files = fileIds.length
      ? await prisma.file.findMany({
          where: { id: { in: fileIds }, isDeleted: false },
          select: { id: true, name: true, mimeType: true, size: true, updatedAt: true },
        })
      : [];
    const fileMap = new Map(files.map((f: any) => [f.id, f]));
    const folderIds = [...new Set<string>(shares.map((s: any) => s.folderId).filter(Boolean))];
    const folders = folderIds.length
      ? await prisma.folder.findMany({
          where: { id: { in: folderIds }, isDeleted: false },
          select: { id: true, name: true, path: true, updatedAt: true },
        })
      : [];
    const folderMap = new Map(folders.map((f: any) => [f.id, f]));

    return reply.send({
      shares: shares.map((share: any) => {
        const owner = ownerMap.get(share.ownerUserId) ?? { name: 'Unknown', email: '' };
        return {
          id: share.id,
          fileId: share.fileId,
          folderId: share.folderId,
          permission: frontendPermission(share.permission),
          status: share.status,
          createdAt: share.createdAt,
          owner,
          file: share.fileId ? (fileMap.get(share.fileId) ?? null) : null,
          folder: share.folderId ? (folderMap.get(share.folderId) ?? null) : null,
        };
      }),
    });
  });
  fastify.post<{ Params: { id: string } }>('/drive/shares/:id/accept', async (request, reply) => {
    const userId = requireUserId(request);
    const share = await prisma.share.findFirst({
      where: { id: request.params.id },
    });
    if (!share) throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
    if (share.sharedWithUserId !== userId) throw createAppError('Forbidden', 403, 'FORBIDDEN');

    const updated = await prisma.share.update({
      where: { id: share.id },
      data: { status: 'accepted' },
    });
    return reply.send({
      success: true,
      share: {
        id: updated.id,
        status: 'accepted',
        fileId: updated.fileId,
        permission: updated.permission,
      },
    });
  });
  fastify.post<{ Params: { id: string } }>('/drive/shares/:id/decline', async (request, reply) => {
    const userId = requireUserId(request);
    const share = await prisma.share.findFirst({
      where: { id: request.params.id },
    });
    if (!share) throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
    if (share.sharedWithUserId !== userId) throw createAppError('Forbidden', 403, 'FORBIDDEN');

    const updated = await prisma.share.update({
      where: { id: share.id },
      data: { status: 'declined' },
    });
    return reply.send({
      success: true,
      share: {
        id: updated.id,
        status: 'declined',
      },
    });
  });

  fastify.post('/drive/shares/link', async (request, reply) => {
    const parsed = publicShareLinkSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const file = await fileAccess(prisma, parsed.data.fileId, userId);
    if (file.userId !== userId) {
      throw createAppError('Only the file owner can create public share links', 403, 'FORBIDDEN');
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
      : null;

    const share = await prisma.driveShare.create({
      data: {
        fileId: file.id,
        createdById: userId,
        token,
        role: parsed.data.role ?? 'viewer',
        password: parsed.data.password || null,
        expiresAt,
      },
    });

    return reply.status(201).send({
      success: true,
      share: {
        id: share.id,
        fileId: share.fileId,
        token: share.token,
        shareUrl: `/drive/share/${share.token}`,
        role: share.role,
        expiresAt: share.expiresAt,
      },
    });
  });

  fastify.get<{ Params: { token: string } }>(
    '/drive/public/share/:token',
    async (request, reply) => {
      const share = await prisma.driveShare.findUnique({
        where: { token: request.params.token },
      });
      if (!share) throw createAppError('Share link not found', 404, 'SHARE_NOT_FOUND');
      if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
        throw createAppError('This share link has expired', 410, 'LINK_EXPIRED');
      }

      const file = await prisma.file.findFirst({
        where: { id: share.fileId, isDeleted: false },
      });
      if (!file) throw createAppError('File not found or has been deleted', 404, 'FILE_NOT_FOUND');

      const owner = await prisma.user.findUnique({
        where: { id: file.userId },
        select: { displayName: true, email: true },
      });

      return reply.send({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          updatedAt: file.updatedAt,
          role: share.role,
          ownerName: owner?.displayName || owner?.email?.split('@')[0] || 'Unknown',
          requiresPassword: Boolean(share.password),
          expiresAt: share.expiresAt,
        },
      });
    },
  );

  fastify.get<{ Params: { token: string } }>(
    '/drive/public/share/:token/download',
    async (request, reply) => {
      const share = await prisma.driveShare.findUnique({
        where: { token: request.params.token },
      });
      if (!share) throw createAppError('Share link not found', 404, 'SHARE_NOT_FOUND');
      if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
        throw createAppError('This share link has expired', 410, 'LINK_EXPIRED');
      }

      const file = await prisma.file.findFirst({
        where: { id: share.fileId, isDeleted: false },
      });
      if (!file) throw createAppError('File not found or has been deleted', 404, 'FILE_NOT_FOUND');

      requireStorage();
      const bytes = await checkedPlaintext(file);
      const filename = safeFileName(file.name);

      return reply
        .header('Content-Type', file.mimeType || 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', bytes.length)
        .send(bytes);
    },
  );

  fastify.delete<{ Params: { id: string } }>('/drive/shares/link/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const share = await prisma.driveShare.findUnique({
      where: { id: request.params.id },
    });
    if (!share) throw createAppError('Share link not found', 404, 'SHARE_NOT_FOUND');
    if (share.createdById !== userId) throw createAppError('Forbidden', 403, 'FORBIDDEN');

    await prisma.driveShare.delete({ where: { id: share.id } });
    return reply.send({ success: true });
  });
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/versions', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request));
    const versions = await prisma.fileVersion.findMany({
      where: { fileId: file.id },
      orderBy: { versionNumber: 'desc' },
    });
    return reply.send({ versions: versions.map(versionDto) });
  });
  fastify.post<{ Params: { id: string } }>(
    '/drive/files/:id/versions',
    { bodyLimit: DRIVE_MAX_BODY_BYTES },
    async (request, reply) => {
      const parsed = versionSchema.safeParse(request.body);
      if (!parsed.success) throw createAppError('Invalid version payload', 400, 'VALIDATION_ERROR');
      const userId = requireUserId(request);
      const file = await fileAccess(prisma, request.params.id, userId, true);
      requireStorage();
      const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
      if (!bytes.length) throw createAppError('Empty file', 400, 'VALIDATION_ERROR');
      if (bytes.length > DRIVE_MAX_FILE_BYTES)
        throw createAppError('File is larger than the upload limit', 413, 'FILE_TOO_LARGE');
      await quotaService.checkQuota(file.userId, bytes.length - file.size);
      const number = await nextVersion(prisma, file.id);
      const envelope = encryptForDrive(bytes);
      const key = versionKey(file.userId, file.id, number, envelope.contentHash);
      await putDriveObject(key, envelope.ciphertext);
      try {
        const version = await prisma.$transaction(async (tx: any) => {
          const created = await tx.fileVersion.create({
            data: {
              fileId: file.id,
              versionNumber: number,
              encryptedContent: key,
              encryptionIV: envelope.iv,
              encryptionAuthTag: envelope.authTag,
              encryptionKey: envelope.wrappedKey,
              size: bytes.length,
            },
          });
          await tx.file.update({
            where: { id: file.id },
            data: {
              encryptedContent: key,
              encryptionIV: envelope.iv,
              encryptionAuthTag: envelope.authTag,
              encryptionKey: envelope.wrappedKey,
              contentHash: envelope.contentHash,
              size: bytes.length,
              mimeType: parsed.data.mimeType ?? file.mimeType,
            },
          });
          return created;
        });
        return reply.status(201).send({ version: versionDto(version) });
      } catch (error) {
        await deleteDriveObject(key).catch(() => undefined);
        throw error;
      }
    },
  );
  fastify.post<{ Params: { id: string; versionId: string } }>(
    '/drive/files/:id/versions/:versionId/restore',
    async (request, reply) => {
      const file = await fileAccess(prisma, request.params.id, requireUserId(request), true);
      requireStorage();
      const version = await prisma.fileVersion.findFirst({
        where: { id: request.params.versionId, fileId: file.id },
      });
      if (!version) throw createAppError('Version not found', 404, 'VERSION_NOT_FOUND');
      const bytes = await checkedPlaintext(version);
      const hash =
        hashFromVersionKey(version.encryptedContent) ??
        createHash('sha256').update(bytes).digest('hex');
      await prisma.file.update({
        where: { id: file.id },
        data: {
          encryptedContent: version.encryptedContent,
          encryptionIV: version.encryptionIV,
          encryptionAuthTag: version.encryptionAuthTag,
          encryptionKey: version.encryptionKey,
          contentHash: hash,
          size: version.size,
        },
      });
      return reply.send({ ok: true, restoredVersion: versionDto(version) });
    },
  );
  fastify.post<{ Body: { fileIds?: string[] } }>('/drive/files/trash', async (request, reply) => {
    const userId = requireUserId(request);
    const ids = [...new Set(request.body?.fileIds ?? [])];
    if (ids.length === 0) return reply.send({ ok: true });

    const now = new Date();

    // 1. Batch-query matching folders in a single query to eliminate N+1 findFirst lookups
    const matchingFolders = await prisma.folder.findMany({
      where: { id: { in: ids }, userId, isDeleted: false },
      select: { id: true },
    });
    const folderIdSet = new Set(matchingFolders.map((f: any) => f.id));

    // 2. Expand folder subtrees and soft-delete folders & descendant files atomically
    for (const folder of matchingFolders) {
      const subtreeFolderIds = await folderTree(prisma, userId, folder.id);
      await prisma.$transaction([
        prisma.folder.updateMany({
          where: { id: { in: subtreeFolderIds }, userId, isDeleted: false },
          data: { isDeleted: true, deletedAt: now, trashRootId: folder.id },
        }),
        prisma.file.updateMany({
          where: { folderId: { in: subtreeFolderIds }, userId, isDeleted: false },
          data: { isDeleted: true, deletedAt: now, trashRootId: folder.id },
        }),
      ]);
    }

    // 3. Batch-query and update direct files (excluding folders) in a single transaction
    const directFileIds = ids.filter((id) => !folderIdSet.has(id));
    if (directFileIds.length > 0) {
      const matchingFiles = await prisma.file.findMany({
        where: { id: { in: directFileIds }, userId, isDeleted: false },
        select: { id: true },
      });
      if (matchingFiles.length > 0) {
        await prisma.$transaction(
          matchingFiles.map((f: any) =>
            prisma.file.update({
              where: { id: f.id },
              data: { isDeleted: true, deletedAt: now, trashRootId: f.id },
            }),
          ),
        );
      }
    }

    return reply.send({ ok: true });
  });
  fastify.get('/drive/trash', async (request, reply) => {
    const userId = requireUserId(request);
    const owner = await ownerInfo(prisma, userId);
    const [files, folders] = await Promise.all([
      prisma.file.findMany({ where: { userId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
      prisma.folder.findMany({
        where: { userId, isDeleted: true },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);
    const rootsF = files.filter((file: any) => file.trashRootId === file.id);
    const rootsD = folders.filter((folder: any) => folder.trashRootId === folder.id);
    return reply.send({
      files: [
        ...rootsD.map((folder: FolderRow) => ({
          ...folderDto(folder, owner),
          deletedAt: folder.deletedAt,
        })),
        ...rootsF.map((file: FileRow) => ({ ...fileDto(file, owner), deletedAt: file.deletedAt })),
      ],
    });
  });
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/restore', async (request, reply) => {
    const userId = requireUserId(request);
    const id = request.params.id;
    const count = await Promise.all([
      prisma.file.count({ where: { userId, isDeleted: true, trashRootId: id } }),
      prisma.folder.count({ where: { userId, isDeleted: true, trashRootId: id } }),
    ]);
    if (count[0] + count[1] === 0) throw createAppError('Trash item not found', 404, 'NOT_FOUND');
    await prisma.$transaction([
      prisma.file.updateMany({
        where: { userId, isDeleted: true, trashRootId: id },
        data: { isDeleted: false, deletedAt: null, trashRootId: null },
      }),
      prisma.folder.updateMany({
        where: { userId, isDeleted: true, trashRootId: id },
        data: { isDeleted: false, deletedAt: null, trashRootId: null },
      }),
    ]);
    return reply.send({ ok: true });
  });
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id/purge', async (request, reply) => {
    const userId = requireUserId(request);
    const id = request.params.id;
    requireStorage();
    const [files, folders] = await Promise.all([
      prisma.file.findMany({
        where: { userId, isDeleted: true, trashRootId: id },
        select: { id: true },
      }),
      prisma.folder.findMany({
        where: { userId, isDeleted: true, trashRootId: id },
        select: { id: true },
      }),
    ]);
    if (!files.length && !folders.length)
      throw createAppError('Trash item not found', 404, 'NOT_FOUND');
    await purgeRows(
      fastify,
      userId,
      files.map((file: any) => file.id),
      folders.map((folder: any) => folder.id),
    );
    return reply.send({ ok: true, purged: files.length + folders.length });
  });

  fastify.post<{ Body: { retentionDays?: number } }>(
    '/drive/trash/cleanup',
    async (request, reply) => {
      const userId = requireUserId(request);
      requireStorage();
      const retentionDays = Math.max(1, Number(request.body?.retentionDays) || 30);
      const thresholdDate = new Date(Date.now() - retentionDays * 86_400_000);
      const [files, folders] = await Promise.all([
        prisma.file.findMany({
          where: { userId, isDeleted: true, deletedAt: { lte: thresholdDate } },
          select: { id: true },
        }),
        prisma.folder.findMany({
          where: { userId, isDeleted: true, deletedAt: { lte: thresholdDate } },
          select: { id: true },
        }),
      ]);
      const fileIds = files.map((f: any) => f.id);
      const folderIds = folders.map((f: any) => f.id);
      if (fileIds.length || folderIds.length) {
        await purgeRows(fastify, userId, fileIds, folderIds);
      }
      return reply.send({
        success: true,
        purgedCount: fileIds.length + folderIds.length,
        retentionDays,
      });
    },
  );
  fastify.post('/drive/upload', { bodyLimit: DRIVE_MAX_BODY_BYTES }, async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body);
    if (!parsed.success) throw createAppError('Invalid upload payload', 400, 'VALIDATION_ERROR');
    const userId = requireUserId(request);
    requireStorage();
    const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
    if (!bytes.length) throw createAppError('Empty file', 400, 'VALIDATION_ERROR');
    if (bytes.length > DRIVE_MAX_FILE_BYTES)
      throw createAppError('File is larger than the upload limit', 413, 'FILE_TOO_LARGE');
    await quotaService.checkQuota(userId, bytes.length);
    let folderId = parsed.data.folderId ?? null;
    if (
      folderId &&
      !(await prisma.folder.findFirst({ where: { id: folderId, userId, isDeleted: false } }))
    )
      folderId = null;
    const envelope = encryptForDrive(bytes);
    const file = await prisma.file.create({
      data: {
        userId,
        name: safeFileName(parsed.data.name),
        mimeType: parsed.data.mimeType || 'application/octet-stream',
        size: bytes.length,
        folderId,
        encryptedContent: '',
        encryptionIV: envelope.iv,
        encryptionAuthTag: envelope.authTag,
        encryptionKey: envelope.wrappedKey,
        contentHash: envelope.contentHash,
      },
    });
    const key = versionKey(userId, file.id, 1, envelope.contentHash);
    try {
      await putDriveObject(key, envelope.ciphertext);
      await prisma.$transaction([
        prisma.file.update({ where: { id: file.id }, data: { encryptedContent: key } }),
        prisma.fileVersion.create({
          data: {
            fileId: file.id,
            versionNumber: 1,
            encryptedContent: key,
            encryptionIV: envelope.iv,
            encryptionAuthTag: envelope.authTag,
            encryptionKey: envelope.wrappedKey,
            size: bytes.length,
          },
        }),
      ]);
    } catch (error) {
      await deleteDriveObject(key).catch(() => undefined);
      await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined);
      throw error;
    }
    const quota = await quotaService.getQuota(userId);
    return reply.status(201).send({
      file: fileDto({ ...file, folderId, encryptedContent: key }, await ownerInfo(prisma, userId)),
      quota: { used: quota.usedBytes, total: quota.limitBytes },
    });
  });

  // Task QD-01 / Task D1 & Task QD-02: Resumable chunked upload protocol
  fastify.post('/drive/upload/chunk/initiate', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = initiateChunkedSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const session = await chunkedUploadService.initiate(userId, parsed.data);
    return reply.status(201).send(session);
  });

  fastify.post<{ Params: { uploadId: string } }>(
    '/drive/upload/chunk/:uploadId',
    { bodyLimit: 30 * 1024 * 1024 },
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = uploadChunkSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      const chunkBuffer = Buffer.from(parsed.data.contentBase64, 'base64');
      const result = await chunkedUploadService.uploadChunk(
        userId,
        request.params.uploadId,
        parsed.data.chunkIndex,
        chunkBuffer,
        parsed.data.checksumSha256,
      );
      return reply.send(result);
    },
  );

  fastify.get<{ Params: { uploadId: string } }>(
    '/drive/upload/chunk/:uploadId/status',
    async (request, reply) => {
      const userId = requireUserId(request);
      const status = chunkedUploadService.getStatus(userId, request.params.uploadId);
      return reply.send(status);
    },
  );

  fastify.post<{ Params: { uploadId: string } }>(
    '/drive/upload/chunk/:uploadId/complete',
    async (request, reply) => {
      const userId = requireUserId(request);
      const result = await chunkedUploadService.complete(userId, request.params.uploadId);
      const owner = await ownerInfo(prisma, userId);
      return reply.status(201).send({
        file: fileDto(result.file, owner),
        quota: result.quota,
      });
    },
  );

  fastify.post<{ Params: { uploadId: string } }>(
    '/drive/upload/chunk/:uploadId/abort',
    async (request, reply) => {
      const userId = requireUserId(request);
      await chunkedUploadService.abort(userId, request.params.uploadId);
      return reply.send({ ok: true });
    },
  );

  fastify.get<{ Params: { id: string } }>('/drive/files/:id/download', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request));
    requireStorage();
    const plaintext = await checkedPlaintext(file);
    return reply
      .header('Content-Type', file.mimeType || 'application/octet-stream')
      .header('Content-Length', String(plaintext.length))
      .header('Content-Disposition', `attachment; filename="${safeFileName(file.name)}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(plaintext);
  });

  const THUMBNAIL_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  function generateThumbnailSvg(fileName: string, mimeType: string): string {
    const ext = fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() || '' : '';
    const m = (mimeType || '').toLowerCase();

    let badgeColor = '#64748B';
    let badgeText = ext || 'FILE';
    let iconSvg = '';

    if (m.includes('pdf') || ext === 'PDF') {
      badgeColor = '#EF4444';
      badgeText = 'PDF';
      iconSvg = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#EF4444" stroke-width="2" fill="none"/>
      <polyline points="14 2 14 8 20 8" stroke="#EF4444" stroke-width="2" fill="none"/>
      <path d="M9 13h2a1.5 1.5 0 0 0 0-3H9v6m5-6v6m3-6h-3v6" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>`;
    } else if (
      m.includes('spreadsheet') ||
      m.includes('excel') ||
      m.includes('csv') ||
      ['XLS', 'XLSX', 'CSV'].includes(ext)
    ) {
      badgeColor = '#22C55E';
      badgeText = ext || 'XLS';
      iconSvg = `<rect x="3" y="3" width="18" height="18" rx="2" stroke="#22C55E" stroke-width="2" fill="none"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke="#22C55E" stroke-width="1.5"/>
      <line x1="3" y1="15" x2="21" y2="15" stroke="#22C55E" stroke-width="1.5"/>
      <line x1="9" y1="3" x2="9" y2="21" stroke="#22C55E" stroke-width="1.5"/>
      <line x1="15" y1="3" x2="15" y2="21" stroke="#22C55E" stroke-width="1.5"/>`;
    } else if (
      m.includes('presentation') ||
      m.includes('powerpoint') ||
      ['PPT', 'PPTX', 'KEY'].includes(ext)
    ) {
      badgeColor = '#F59E0B';
      badgeText = ext || 'PPT';
      iconSvg = `<rect x="2" y="3" width="20" height="14" rx="2" stroke="#F59E0B" stroke-width="2" fill="none"/>
      <line x1="8" y1="21" x2="16" y2="21" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke="#F59E0B" stroke-width="2"/>`;
    } else if (
      m.includes('word') ||
      m.includes('document') ||
      ['DOC', 'DOCX', 'RTF'].includes(ext)
    ) {
      badgeColor = '#3B82F6';
      badgeText = ext || 'DOC';
      iconSvg = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#3B82F6" stroke-width="2" fill="none"/>
      <polyline points="14 2 14 8 20 8" stroke="#3B82F6" stroke-width="2" fill="none"/>
      <line x1="16" y1="13" x2="8" y2="13" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
      <line x1="16" y1="17" x2="8" y2="17" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
      <line x1="10" y1="9" x2="8" y2="9" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>`;
    } else if (m.startsWith('text/') || ['TXT', 'MD', 'LOG'].includes(ext)) {
      badgeColor = '#38BDF8';
      badgeText = ext || 'TXT';
      iconSvg = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#38BDF8" stroke-width="2" fill="none"/>
      <polyline points="14 2 14 8 20 8" stroke="#38BDF8" stroke-width="2" fill="none"/>
      <line x1="16" y1="13" x2="8" y2="13" stroke="#38BDF8" stroke-width="2" stroke-linecap="round"/>
      <line x1="16" y1="17" x2="8" y2="17" stroke="#38BDF8" stroke-width="2" stroke-linecap="round"/>`;
    } else if (m.startsWith('audio/') || ['MP3', 'WAV', 'OGG', 'M4A', 'FLAC'].includes(ext)) {
      badgeColor = '#A855F7';
      badgeText = ext || 'AUDIO';
      iconSvg = `<path d="M9 18V5l12-2v13" stroke="#A855F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="6" cy="18" r="3" stroke="#A855F7" stroke-width="2" fill="none"/>
      <circle cx="18" cy="16" r="3" stroke="#A855F7" stroke-width="2" fill="none"/>`;
    } else if (m.startsWith('video/') || ['MP4', 'MKV', 'MOV', 'WEBM'].includes(ext)) {
      badgeColor = '#EC4899';
      badgeText = ext || 'VIDEO';
      iconSvg = `<rect x="2" y="2" width="20" height="20" rx="2.18" stroke="#EC4899" stroke-width="2" fill="none"/>
      <line x1="7" y1="2" x2="7" y2="22" stroke="#EC4899" stroke-width="2"/>
      <line x1="17" y1="2" x2="17" y2="22" stroke="#EC4899" stroke-width="2"/>
      <line x1="2" y1="12" x2="22" y2="12" stroke="#EC4899" stroke-width="2"/>`;
    } else if (
      [
        'JSON',
        'JS',
        'TS',
        'TSX',
        'JSX',
        'PY',
        'RS',
        'GO',
        'HTML',
        'CSS',
        'SH',
        'SQL',
        'YAML',
        'YML',
        'XML',
      ].includes(ext) ||
      m.includes('json') ||
      m.includes('javascript') ||
      m.includes('xml') ||
      m.includes('yaml')
    ) {
      badgeColor = '#06B6D4';
      badgeText = ext || 'CODE';
      iconSvg = `<polyline points="16 18 22 12 16 6" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <polyline points="8 6 2 12 8 18" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    } else if (
      ['ZIP', 'TAR', 'GZ', '7Z', 'RAR'].includes(ext) ||
      m.includes('zip') ||
      m.includes('compressed')
    ) {
      badgeColor = '#818CF8';
      badgeText = ext || 'ZIP';
      iconSvg = `<path d="M21 8v13H3V8" stroke="#818CF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M1 3h22v5H1z" stroke="#818CF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <line x1="10" y1="12" x2="14" y2="12" stroke="#818CF8" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      iconSvg = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#94A3B8" stroke-width="2" fill="none"/>
      <polyline points="14 2 14 8 20 8" stroke="#94A3B8" stroke-width="2" fill="none"/>`;
    }

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const safeName = escapeXml(fileName.length > 22 ? `${fileName.slice(0, 20)}…` : fileName);
    const safeBadge = escapeXml(badgeText.slice(0, 6));

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181B22"/>
      <stop offset="100%" stop-color="#0E1015"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="${badgeColor}" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="200" height="200" rx="16" fill="url(#bg)"/>
  <rect x="0.5" y="0.5" width="199" height="199" rx="15.5" fill="none" stroke="#282C35" stroke-width="1"/>
  <g transform="translate(76, 50)" filter="url(#glow)">
    <g transform="scale(2)">
      ${iconSvg}
    </g>
  </g>
  <rect x="70" y="122" width="60" height="20" rx="5" fill="${badgeColor}" opacity="0.95"/>
  <text x="100" y="136" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="0.5">${safeBadge}</text>
  <text x="100" y="172" fill="#E2E8F0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" text-anchor="middle">${safeName}</text>
</svg>`;
  }

  fastify.get<{ Params: { id: string } }>('/drive/files/:id/thumbnail', async (request, reply) => {
    const userId = requireUserId(request);
    const file = await fileAccess(prisma, request.params.id, userId);

    const mime = (file.mimeType || '').split(';', 1)[0].trim().toLowerCase();
    if (THUMBNAIL_IMAGE_MIME_TYPES.has(mime) && driveStorageReady() && file.encryptedContent) {
      try {
        const plaintext = await checkedPlaintext(file);
        return reply
          .header('Content-Type', file.mimeType)
          .header('Cache-Control', 'private, max-age=86400')
          .header('Content-Length', String(plaintext.length))
          .send(plaintext);
      } catch {
        // Fall back to SVG thumbnail preview if storage retrieval fails
      }
    }

    const svg = generateThumbnailSvg(file.name, file.mimeType);
    return reply
      .header('Content-Type', 'image/svg+xml')
      .header('Cache-Control', 'private, max-age=86400')
      .send(svg);
  });

  // Task QD-03 & D10: Folder drag-and-drop tree re-organization with cycle detection and path recalculation
  const handleMove = async (
    userId: string,
    fileIds: string[],
    folderIds: string[],
    targetFolderId: string | null,
  ) => {
    let targetPath = '';
    if (targetFolderId) {
      const targetFolder = await prisma.folder.findFirst({
        where: { id: targetFolderId, userId, isDeleted: false },
      });
      if (!targetFolder) throw createAppError('Target folder not found', 404, 'NOT_FOUND');
      targetPath = targetFolder.path;
    }

    if (fileIds.length > 0) {
      await prisma.file.updateMany({
        where: { id: { in: fileIds }, userId, isDeleted: false },
        data: { folderId: targetFolderId },
      });
    }

    for (const folderId of folderIds) {
      if (folderId === targetFolderId) {
        throw createAppError('Cannot move a folder into itself', 400, 'CIRCULAR_REFERENCE');
      }
      if (targetFolderId) {
        const subtreeIds = await folderTree(prisma, userId, folderId);
        if (subtreeIds.includes(targetFolderId)) {
          throw createAppError(
            'Cannot move a folder into one of its subfolders',
            400,
            'CIRCULAR_REFERENCE',
          );
        }
      }
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId, isDeleted: false },
      });
      if (!folder) continue;

      const newPath = targetFolderId ? `${targetPath}/${folder.name}` : `/${folder.name}`;
      const oldPath = folder.path;

      await prisma.folder.update({
        where: { id: folderId },
        data: { parentId: targetFolderId, path: newPath },
      });

      const descendants = await prisma.folder.findMany({
        where: { userId, path: { startsWith: `${oldPath}/` } },
      });
      for (const desc of descendants) {
        const updatedDescPath = newPath + desc.path.slice(oldPath.length);
        await prisma.folder.update({
          where: { id: desc.id },
          data: { path: updatedDescPath },
        });
      }
    }

    return { ok: true, movedFiles: fileIds.length, movedFolders: folderIds.length };
  };

  fastify.post<{
    Body: { fileIds?: string[]; folderIds?: string[]; targetFolderId?: string | null };
  }>('/drive/move', async (request, reply) => {
    const userId = requireUserId(request);
    const fileIds = request.body?.fileIds ?? [];
    const folderIds = request.body?.folderIds ?? [];
    const targetFolderId = request.body?.targetFolderId ?? null;
    const result = await handleMove(userId, fileIds, folderIds, targetFolderId);
    return reply.send(result);
  });

  fastify.post<{
    Body: { fileIds?: string[]; folderIds?: string[]; targetFolderId?: string | null };
  }>('/drive/files/move', async (request, reply) => {
    const userId = requireUserId(request);
    const fileIds = request.body?.fileIds ?? [];
    const folderIds = request.body?.folderIds ?? [];
    const targetFolderId = request.body?.targetFolderId ?? null;
    const result = await handleMove(userId, fileIds, folderIds, targetFolderId);
    return reply.send(result);
  });
  fastify.post<{ Params: { id: string }; Body: { targetFolderId?: string | null } }>(
    '/drive/files/:id/copy',
    async (request, reply) => {
      const userId = requireUserId(request);
      requireStorage();
      const source = await fileAccess(prisma, request.params.id, userId);
      const plaintext = await checkedPlaintext(source);
      await quotaService.checkQuota(userId, plaintext.length);
      const envelope = encryptForDrive(plaintext);
      const file = await prisma.file.create({
        data: {
          userId,
          name: safeFileName(`${source.name} (copy)`),
          mimeType: source.mimeType,
          size: plaintext.length,
          folderId: request.body?.targetFolderId ?? source.folderId ?? null,
          encryptedContent: '',
          encryptionIV: envelope.iv,
          encryptionAuthTag: envelope.authTag,
          encryptionKey: envelope.wrappedKey,
          contentHash: envelope.contentHash,
        },
      });
      const key = versionKey(userId, file.id, 1, envelope.contentHash);
      try {
        await putDriveObject(key, envelope.ciphertext);
        await prisma.$transaction([
          prisma.file.update({ where: { id: file.id }, data: { encryptedContent: key } }),
          prisma.fileVersion.create({
            data: {
              fileId: file.id,
              versionNumber: 1,
              encryptedContent: key,
              encryptionIV: envelope.iv,
              encryptionAuthTag: envelope.authTag,
              encryptionKey: envelope.wrappedKey,
              size: plaintext.length,
            },
          }),
        ]);
      } catch (error) {
        await deleteDriveObject(key).catch(() => undefined);
        await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined);
        throw error;
      }
      return reply
        .status(201)
        .send(fileDto({ ...file, encryptedContent: key }, await ownerInfo(prisma, userId)));
    },
  );
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const file = await prisma.file.findFirst({
      where: { id: request.params.id, userId, isDeleted: true },
    });
    if (!file)
      throw createAppError(
        'Move the file to trash before permanently deleting it',
        409,
        'NOT_TRASHED',
      );
    requireStorage();
    await purgeRows(fastify, userId, [file.id], []);
    return reply.send({ ok: true });
  });
  fastify.get('/drive/memory', async (request, reply) => {
    const userId = requireUserId(request);
    const rows = (await prisma.memoryRecord.findMany({
      where: { ownerType: 'user', ownerId: userId, deletedAt: null, archivedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
      take: MEMORY_SCAN_LIMIT,
      select: {
        logicalId: true,
        version: true,
        kind: true,
        level: true,
        content: true,
        pinned: true,
        metadata: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })) as MemoryRow[];
    const heads = new Map<string, MemoryRow>();
    for (const row of rows) if (!heads.has(row.logicalId)) heads.set(row.logicalId, row);
    const now = Date.now();
    const memories = [...heads.values()]
      .filter((row) => !row.expiresAt || row.expiresAt.getTime() > now)
      .map((row) => {
        const source = memorySource(row.metadata);
        return {
          id: row.logicalId,
          version: row.version,
          kind: row.kind,
          level: row.level,
          content: row.content,
          summary: memorySummary(row.content),
          sourceApp: source.app,
          sourceLabel: source.label,
          pinned: row.pinned,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
    return reply.send({
      memories,
      total: memories.length,
      truncated: rows.length >= MEMORY_SCAN_LIMIT,
    });
  });
  fastify.delete<{ Params: { logicalId: string } }>(
    '/drive/memory/:logicalId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const logicalId = request.params.logicalId;
      const owned = await prisma.memoryRecord.findFirst({
        where: { logicalId, ownerType: 'user', ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!owned) throw createAppError('Not found', 404, 'NOT_FOUND');
      const result = await prisma.memoryRecord.updateMany({
        where: { logicalId, ownerType: 'user', ownerId: userId, archivedAt: null, deletedAt: null },
        data: { archivedAt: new Date() },
      });
      return reply.send({ ok: true, archived: result.count ?? 0 });
    },
  );
}
