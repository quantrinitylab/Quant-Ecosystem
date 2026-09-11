import { createHash, randomUUID } from 'node:crypto';
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
import { AIExtractDataService } from '../services/ai-extract-data.service';
import { AISummarizeFileService } from '../services/ai-summarize-file.service';

const MEMORY_SCAN_LIMIT = 2000;
const MEMORY_APP_LABELS: Record<string, string> = {
  quantmail: 'QuantMail', quantchat: 'QuantChat', quantube: 'QuantTube', quantai: 'QuantAI',
  quantdocs: 'QuantDocs', quantmeet: 'QuantMeet', quantcalendar: 'QuantCalendar', quantdrive: 'QuantDrive',
};
const MEMORY_SHARED_SESSIONS = new Set(['user-style', 'user-contacts']);
const AI_FILE_SCHEMA = z.object({ fileId: z.string().min(1) });
const QUOTA_CHECK_SCHEMA = z.object({ additionalBytes: z.number().int().nonnegative() });
const AI_TEXT_MIME_TYPES = new Set([
  'application/json', 'application/ld+json', 'application/xml', 'application/x-yaml',
  'application/yaml', 'application/javascript', 'application/sql',
]);

type Owner = { name: string; email: string };
type SharedWith = { email: string; permission: 'view' | 'edit' | 'admin' };
type VersionDto = { id: string; version: number; size: number; date: Date };
type Decorations = { shares: Map<string, SharedWith[]>; versions: Map<string, VersionDto[]> };
type FileRow = {
  id: string; name: string; mimeType: string; size: number; folderId: string | null;
  isStarred: boolean; isDeleted: boolean; deletedAt: Date | null; trashRootId: string | null;
  encryptedContent: string; encryptionIV: string; encryptionAuthTag: string;
  encryptionKey: string; contentHash: string; userId: string; updatedAt: Date;
};
type FolderRow = {
  id: string; name: string; parentId: string | null; path: string; userId: string;
  isStarred: boolean; isDeleted: boolean; deletedAt: Date | null; trashRootId: string | null;
  updatedAt: Date;
};
type MemoryRow = {
  logicalId: string; version: number; kind: string; level: string; content: string;
  pinned: boolean; metadata: unknown; expiresAt: Date | null; createdAt: Date; updatedAt: Date;
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
  if (!driveStorageReady()) throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
}
function requireAiTextFile(file: { mimeType: string }): void {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!mimeType.startsWith('text/') && !AI_TEXT_MIME_TYPES.has(mimeType)) {
    throw createAppError('AI extraction requires a text-based file', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
}
async function ownerInfo(prisma: any, userId: string): Promise<Owner> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } });
  return { name: user?.displayName ?? user?.email ?? '', email: user?.email ?? '' };
}
function frontendPermission(permission: string): 'view' | 'edit' | 'admin' {
  return permission === 'admin' ? 'admin' : permission === 'write' ? 'edit' : 'view';
}
function storedPermission(permission: 'view' | 'edit' | 'admin'): string {
  return permission === 'view' ? 'read' : permission === 'edit' ? 'write' : 'admin';
}
function versionDto(version: any): VersionDto {
  return { id: version.id, version: version.versionNumber, size: version.size, date: version.createdAt };
}
function fileDto(file: FileRow, owner: Owner, decorations?: Decorations) {
  return {
    id: file.id, name: file.name, type: 'file' as const, mimeType: file.mimeType, size: file.size,
    path: '', parentId: file.folderId, modifiedAt: file.updatedAt, owner,
    sharedWith: decorations?.shares.get(`file:${file.id}`) ?? [], isStarred: file.isStarred,
    versions: decorations?.versions.get(file.id) ?? [],
  };
}
function folderDto(folder: FolderRow, owner: Owner, decorations?: Decorations) {
  return {
    id: folder.id, name: folder.name, type: 'folder' as const,
    mimeType: 'application/vnd.quant.folder', size: 0, path: folder.path,
    parentId: folder.parentId, modifiedAt: folder.updatedAt, owner,
    sharedWith: decorations?.shares.get(`folder:${folder.id}`) ?? [], isStarred: folder.isStarred, versions: [],
  };
}
async function loadDecorations(prisma: any, fileIds: string[], folderIds: string[]): Promise<Decorations> {
  const targets: any[] = [];
  if (fileIds.length) targets.push({ fileId: { in: fileIds } });
  if (folderIds.length) targets.push({ folderId: { in: folderIds } });
  const [shares, versions] = await Promise.all([
    targets.length ? prisma.share.findMany({ where: { status: { not: 'revoked' }, OR: targets } }) : [],
    fileIds.length ? prisma.fileVersion.findMany({ where: { fileId: { in: fileIds } }, orderBy: { versionNumber: 'desc' } }) : [],
  ]);
  const recipientIds = [...new Set<string>(shares.map((share: any) => share.sharedWithUserId))];
  const users = recipientIds.length ? await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, email: true } }) : [];
  const emailById = new Map<string, string>(users.map((user: any) => [user.id, user.email]));
  const shareMap = new Map<string, SharedWith[]>();
  for (const share of shares) {
    const email = emailById.get(share.sharedWithUserId); if (!email) continue;
    const key = share.fileId ? `file:${share.fileId}` : `folder:${share.folderId}`;
    shareMap.set(key, [...(shareMap.get(key) ?? []), { email, permission: frontendPermission(share.permission) }]);
  }
  const versionMap = new Map<string, VersionDto[]>();
  for (const version of versions) versionMap.set(version.fileId, [...(versionMap.get(version.fileId) ?? []), versionDto(version)]);
  return { shares: shareMap, versions: versionMap };
}
async function ownedItem(prisma: any, id: string, userId: string): Promise<{ type: 'file' | 'folder'; row: any }> {
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
  const share = await prisma.share.findFirst({ where: { fileId: id, sharedWithUserId: userId, status: 'accepted' } });
  if (!share || (write && !['write', 'admin'].includes(share.permission))) throw createAppError('Not authorized to access this file', 403, 'FORBIDDEN');
  return file;
}
function versionKey(userId: string, fileId: string, version: number, hash: string): string {
  return driveObjectKey(userId, `${fileId}/versions/${version}-${randomUUID()}-${hash}`);
}
async function nextVersion(prisma: any, fileId: string): Promise<number> {
  const latest = await prisma.fileVersion.findFirst({ where: { fileId }, orderBy: { versionNumber: 'desc' } });
  return (latest?.versionNumber ?? 0) + 1;
}
async function folderTree(prisma: any, userId: string, rootId: string): Promise<string[]> {
  const ids = [rootId]; let frontier = [rootId];
  while (frontier.length) {
    const children = await prisma.folder.findMany({ where: { userId, parentId: { in: frontier } }, select: { id: true } });
    frontier = children.map((child: any) => child.id); ids.push(...frontier);
  }
  return [...new Set(ids)];
}
async function purgeRows(fastify: FastifyInstance, userId: string, fileIds: string[], folderIds: string[]): Promise<void> {
  const prisma = getPrisma(fastify);
  const [files, versions] = await Promise.all([
    fileIds.length ? prisma.file.findMany({ where: { id: { in: fileIds }, userId, isDeleted: true } }) : [],
    fileIds.length ? prisma.fileVersion.findMany({ where: { fileId: { in: fileIds } } }) : [],
  ]);
  const ownedIds = files.map((file: any) => file.id); const keys = new Set<string>();
  for (const file of files) if (file.encryptedContent) keys.add(file.encryptedContent);
  for (const version of versions) if (ownedIds.includes(version.fileId) && version.encryptedContent) keys.add(version.encryptedContent);
  for (const key of keys) await deleteDriveObject(key);
  await prisma.$transaction([
    prisma.fileVersion.deleteMany({ where: { fileId: { in: ownedIds } } }),
    prisma.share.deleteMany({ where: { OR: [{ fileId: { in: ownedIds } }, { folderId: { in: folderIds } }] } }),
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
  return declared ? { app: declared, label: declared } : { app: 'shared', label: 'Shared across apps' };
}
function memorySummary(content: string): string {
  const prefix = 'user-style-profile '; if (!content.startsWith(prefix)) return content;
  try {
    const profile = JSON.parse(content.slice(prefix.length)) as Record<string, unknown>; const bits: string[] = [];
    if (typeof profile.tone === 'string' && profile.tone) bits.push(`${profile.tone} tone`);
    if (typeof profile.vocabularyLevel === 'string' && profile.vocabularyLevel) bits.push(`${profile.vocabularyLevel} vocabulary`);
    if (typeof profile.greetingStyle === 'string' && profile.greetingStyle) bits.push(`opens with "${profile.greetingStyle}"`);
    if (typeof profile.closingStyle === 'string' && profile.closingStyle) bits.push(`signs off "${profile.closingStyle}"`);
    if (Array.isArray(profile.traits)) bits.push(...profile.traits.filter((trait): trait is string => typeof trait === 'string'));
    return bits.length ? `Writing style — ${bits.join(', ')}` : 'Writing style profile';
  } catch { return 'Writing style profile'; }
}

const uploadSchema = z.object({ name: z.string().min(1).max(255), mimeType: z.string().max(255).optional(), folderId: z.string().nullable().optional(), contentBase64: z.string().min(1) });
const versionSchema = z.object({ contentBase64: z.string().min(1), mimeType: z.string().max(255).optional() });
const shareSchema = z.object({ email: z.string().trim().email(), permission: z.enum(['view', 'edit', 'admin']) });

export default async function driveRoutes(fastify: FastifyInstance) {
  const prisma = getPrisma(fastify);
  const quotaService = new StorageQuotaService(prisma);
  const aiEngine = new AIEngine();
  const extractService = new AIExtractDataService(aiEngine);
  const summarizeService = new AISummarizeFileService(aiEngine);

  fastify.get('/drive/quota', async (request, reply) => {
    const userId = requireUserId(request); const quota = await quotaService.getQuota(userId);
    return reply.send({ used: quota.usedBytes, total: quota.limitBytes, tier: quota.tier, percentUsed: quota.percentUsed });
  });
  fastify.post('/drive/quota/check', async (request, reply) => {
    const userId = requireUserId(request); const parsed = QUOTA_CHECK_SCHEMA.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    await quotaService.checkQuota(userId, parsed.data.additionalBytes);
    const quota = await quotaService.getQuota(userId);
    return reply.send({ allowed: true, used: quota.usedBytes, total: quota.limitBytes, remaining: Math.max(0, quota.limitBytes - quota.usedBytes) });
  });

  async function aiFile(request: unknown, body: unknown): Promise<{ userId: string; file: any; content: string }> {
    const userId = requireUserId(request); const parsed = AI_FILE_SCHEMA.safeParse(body);
    if (!parsed.success) throw parsed.error;
    const file = await fileAccess(prisma, parsed.data.fileId, userId);
    if (file.userId !== userId) throw createAppError('Only the owner can use Drive AI for this file', 403, 'FORBIDDEN');
    requireAiTextFile(file); requireStorage();
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
    return reply.send(await summarizeService.summarizeFile({ fileId: file.id, content, mimeType: file.mimeType, fileName: file.name }, userId));
  });

  fastify.get<{ Querystring: { folderId?: string } }>('/drive/files', async (request, reply) => {
    const userId = requireUserId(request); const folderId = request.query.folderId || null; const owner = await ownerInfo(prisma, userId);
    const [folders, files, quota] = await Promise.all([
      prisma.folder.findMany({ where: { userId, parentId: folderId, isDeleted: false }, orderBy: { name: 'asc' } }),
      prisma.file.findMany({ where: { userId, folderId, isDeleted: false }, orderBy: { updatedAt: 'desc' } }),
      quotaService.getQuota(userId),
    ]);
    const decorations = await loadDecorations(prisma, files.map((file: any) => file.id), folders.map((folder: any) => folder.id));
    return reply.send({ files: [...folders.map((folder: FolderRow) => folderDto(folder, owner, decorations)), ...files.map((file: FileRow) => fileDto(file, owner, decorations))], quota: { used: quota.usedBytes, total: quota.limitBytes } });
  });
  fastify.get<{ Querystring: { q?: string } }>('/drive/search', async (request, reply) => {
    const userId = requireUserId(request); const q = (request.query.q || '').trim(); if (!q) return reply.send({ files: [] });
    const owner = await ownerInfo(prisma, userId);
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({ where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } }, take: 50 }),
      prisma.file.findMany({ where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } }, take: 50 }),
    ]);
    const decorations = await loadDecorations(prisma, files.map((file: any) => file.id), folders.map((folder: any) => folder.id));
    return reply.send({ files: [...folders.map((folder: FolderRow) => folderDto(folder, owner, decorations)), ...files.map((file: FileRow) => fileDto(file, owner, decorations))] });
  });
  fastify.post('/drive/folders', async (request, reply) => {
    const parsed = z.object({ name: z.string().min(1).max(200), parentId: z.string().nullable().optional() }).safeParse(request.body); if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request); const owner = await ownerInfo(prisma, userId); let path = `/${parsed.data.name}`;
    if (parsed.data.parentId) { const parent = await prisma.folder.findFirst({ where: { id: parsed.data.parentId, userId, isDeleted: false } }); if (!parent) throw createAppError('Parent folder not found', 404, 'NOT_FOUND'); path = `${parent.path}/${parsed.data.name}`; }
    const folder = await prisma.folder.create({ data: { userId, name: parsed.data.name, parentId: parsed.data.parentId ?? null, path } });
    return reply.status(201).send(folderDto(folder, owner));
  });
  fastify.put<{ Params: { id: string }; Body: { name?: string } }>('/drive/files/:id', async (request, reply) => {
    const userId = requireUserId(request); const name = request.body?.name?.trim(); if (!name) throw createAppError('Name required', 400, 'VALIDATION_ERROR');
    const item = await ownedItem(prisma, request.params.id, userId);
    if (item.type === 'file') await prisma.file.update({ where: { id: item.row.id }, data: { name } }); else await prisma.folder.update({ where: { id: item.row.id }, data: { name } });
    return reply.send({ ok: true });
  });
  fastify.put<{ Params: { id: string } }>('/drive/files/:id/star', async (request, reply) => {
    const item = await ownedItem(prisma, request.params.id, requireUserId(request));
    const row = item.type === 'file' ? await prisma.file.update({ where: { id: item.row.id }, data: { isStarred: true } }) : await prisma.folder.update({ where: { id: item.row.id }, data: { isStarred: true } });
    return reply.send({ id: row.id, isStarred: true });
  });
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id/star', async (request, reply) => {
    const item = await ownedItem(prisma, request.params.id, requireUserId(request));
    const row = item.type === 'file' ? await prisma.file.update({ where: { id: item.row.id }, data: { isStarred: false } }) : await prisma.folder.update({ where: { id: item.row.id }, data: { isStarred: false } });
    return reply.send({ id: row.id, isStarred: false });
  });
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/share', async (request, reply) => {
    const userId = requireUserId(request); const file = await fileAccess(prisma, request.params.id, userId); if (file.userId !== userId) throw createAppError('Only the owner can manage sharing', 403, 'FORBIDDEN');
    const shares = await prisma.share.findMany({ where: { fileId: file.id, status: { not: 'revoked' } }, orderBy: { createdAt: 'desc' } });
    const users = shares.length ? await prisma.user.findMany({ where: { id: { in: shares.map((share: any) => share.sharedWithUserId) } }, select: { id: true, email: true } }) : [];
    const emails = new Map(users.map((user: any) => [user.id, user.email]));
    return reply.send({ shares: shares.map((share: any) => ({ id: share.id, email: emails.get(share.sharedWithUserId) ?? '', permission: frontendPermission(share.permission), status: share.status, createdAt: share.createdAt })) });
  });
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/share', async (request, reply) => {
    const parsed = shareSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request); const file = await fileAccess(prisma, request.params.id, userId); if (file.userId !== userId) throw createAppError('Only the owner can share this file', 403, 'FORBIDDEN');
    const recipient = await prisma.user.findFirst({ where: { email: { equals: parsed.data.email, mode: 'insensitive' } }, select: { id: true, email: true } });
    if (!recipient) throw createAppError('Recipient user not found', 404, 'USER_NOT_FOUND'); if (recipient.id === userId) throw createAppError('Cannot share a file with yourself', 400, 'INVALID_RECIPIENT');
    const existing = await prisma.share.findFirst({ where: { fileId: file.id, sharedWithUserId: recipient.id } });
    const data = { encryptedFileKey: file.encryptionKey, permission: storedPermission(parsed.data.permission), status: 'pending' };
    const share = existing ? await prisma.share.update({ where: { id: existing.id }, data }) : await prisma.share.create({ data: { ...data, fileId: file.id, folderId: null, ownerUserId: userId, sharedWithUserId: recipient.id } });
    return reply.status(existing ? 200 : 201).send({ share: { id: share.id, email: recipient.email, permission: parsed.data.permission, status: share.status } });
  });
  fastify.delete<{ Params: { id: string; shareId: string } }>('/drive/files/:id/share/:shareId', async (request, reply) => {
    const userId = requireUserId(request); const file = await fileAccess(prisma, request.params.id, userId); if (file.userId !== userId) throw createAppError('Only the owner can revoke sharing', 403, 'FORBIDDEN');
    const share = await prisma.share.findFirst({ where: { id: request.params.shareId, fileId: file.id, ownerUserId: userId } }); if (!share) throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
    await prisma.share.update({ where: { id: share.id }, data: { status: 'revoked' } }); return reply.send({ ok: true });
  });
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/versions', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request)); const versions = await prisma.fileVersion.findMany({ where: { fileId: file.id }, orderBy: { versionNumber: 'desc' } });
    return reply.send({ versions: versions.map(versionDto) });
  });
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/versions', { bodyLimit: DRIVE_MAX_BODY_BYTES }, async (request, reply) => {
    const parsed = versionSchema.safeParse(request.body); if (!parsed.success) throw createAppError('Invalid version payload', 400, 'VALIDATION_ERROR');
    const userId = requireUserId(request); const file = await fileAccess(prisma, request.params.id, userId, true); requireStorage(); const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
    if (!bytes.length) throw createAppError('Empty file', 400, 'VALIDATION_ERROR'); if (bytes.length > DRIVE_MAX_FILE_BYTES) throw createAppError('File is larger than the upload limit', 413, 'FILE_TOO_LARGE');
    await quotaService.checkQuota(file.userId, bytes.length - file.size);
    const number = await nextVersion(prisma, file.id); const envelope = encryptForDrive(bytes); const key = versionKey(file.userId, file.id, number, envelope.contentHash); await putDriveObject(key, envelope.ciphertext);
    try {
      const version = await prisma.$transaction(async (tx: any) => { const created = await tx.fileVersion.create({ data: { fileId: file.id, versionNumber: number, encryptedContent: key, encryptionIV: envelope.iv, encryptionAuthTag: envelope.authTag, encryptionKey: envelope.wrappedKey, size: bytes.length } }); await tx.file.update({ where: { id: file.id }, data: { encryptedContent: key, encryptionIV: envelope.iv, encryptionAuthTag: envelope.authTag, encryptionKey: envelope.wrappedKey, contentHash: envelope.contentHash, size: bytes.length, mimeType: parsed.data.mimeType ?? file.mimeType } }); return created; });
      return reply.status(201).send({ version: versionDto(version) });
    } catch (error) { await deleteDriveObject(key).catch(() => undefined); throw error; }
  });
  fastify.post<{ Params: { id: string; versionId: string } }>('/drive/files/:id/versions/:versionId/restore', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request), true); requireStorage(); const version = await prisma.fileVersion.findFirst({ where: { id: request.params.versionId, fileId: file.id } });
    if (!version) throw createAppError('Version not found', 404, 'VERSION_NOT_FOUND'); const bytes = await checkedPlaintext(version); const hash = hashFromVersionKey(version.encryptedContent) ?? createHash('sha256').update(bytes).digest('hex');
    await prisma.file.update({ where: { id: file.id }, data: { encryptedContent: version.encryptedContent, encryptionIV: version.encryptionIV, encryptionAuthTag: version.encryptionAuthTag, encryptionKey: version.encryptionKey, contentHash: hash, size: version.size } });
    return reply.send({ ok: true, restoredVersion: versionDto(version) });
  });
  fastify.post<{ Body: { fileIds?: string[] } }>('/drive/files/trash', async (request, reply) => {
    const userId = requireUserId(request); const ids = [...new Set(request.body?.fileIds ?? [])]; const now = new Date();
    for (const id of ids) { const folder = await prisma.folder.findFirst({ where: { id, userId, isDeleted: false } }); if (folder) { const folderIds = await folderTree(prisma, userId, id); await prisma.$transaction([prisma.folder.updateMany({ where: { id: { in: folderIds }, userId, isDeleted: false }, data: { isDeleted: true, deletedAt: now, trashRootId: id } }), prisma.file.updateMany({ where: { folderId: { in: folderIds }, userId, isDeleted: false }, data: { isDeleted: true, deletedAt: now, trashRootId: id } })]); } }
    for (const id of ids) await prisma.file.updateMany({ where: { id, userId, isDeleted: false }, data: { isDeleted: true, deletedAt: now, trashRootId: id } }); return reply.send({ ok: true });
  });
  fastify.get('/drive/trash', async (request, reply) => {
    const userId = requireUserId(request); const owner = await ownerInfo(prisma, userId); const [files, folders] = await Promise.all([prisma.file.findMany({ where: { userId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }), prisma.folder.findMany({ where: { userId, isDeleted: true }, orderBy: { deletedAt: 'desc' } })]);
    const rootsF = files.filter((file: any) => file.trashRootId === file.id); const rootsD = folders.filter((folder: any) => folder.trashRootId === folder.id);
    return reply.send({ files: [...rootsD.map((folder: FolderRow) => ({ ...folderDto(folder, owner), deletedAt: folder.deletedAt })), ...rootsF.map((file: FileRow) => ({ ...fileDto(file, owner), deletedAt: file.deletedAt }))] });
  });
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/restore', async (request, reply) => {
    const userId = requireUserId(request); const id = request.params.id; const count = await Promise.all([prisma.file.count({ where: { userId, isDeleted: true, trashRootId: id } }), prisma.folder.count({ where: { userId, isDeleted: true, trashRootId: id } })]);
    if (count[0] + count[1] === 0) throw createAppError('Trash item not found', 404, 'NOT_FOUND'); await prisma.$transaction([prisma.file.updateMany({ where: { userId, isDeleted: true, trashRootId: id }, data: { isDeleted: false, deletedAt: null, trashRootId: null } }), prisma.folder.updateMany({ where: { userId, isDeleted: true, trashRootId: id }, data: { isDeleted: false, deletedAt: null, trashRootId: null } })]); return reply.send({ ok: true });
  });
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id/purge', async (request, reply) => {
    const userId = requireUserId(request); const id = request.params.id; requireStorage(); const [files, folders] = await Promise.all([prisma.file.findMany({ where: { userId, isDeleted: true, trashRootId: id }, select: { id: true } }), prisma.folder.findMany({ where: { userId, isDeleted: true, trashRootId: id }, select: { id: true } })]);
    if (!files.length && !folders.length) throw createAppError('Trash item not found', 404, 'NOT_FOUND'); await purgeRows(fastify, userId, files.map((file: any) => file.id), folders.map((folder: any) => folder.id)); return reply.send({ ok: true, purged: files.length + folders.length });
  });
  fastify.post('/drive/upload', { bodyLimit: DRIVE_MAX_BODY_BYTES }, async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body); if (!parsed.success) throw createAppError('Invalid upload payload', 400, 'VALIDATION_ERROR'); const userId = requireUserId(request); requireStorage(); const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
    if (!bytes.length) throw createAppError('Empty file', 400, 'VALIDATION_ERROR'); if (bytes.length > DRIVE_MAX_FILE_BYTES) throw createAppError('File is larger than the upload limit', 413, 'FILE_TOO_LARGE'); await quotaService.checkQuota(userId, bytes.length);
    let folderId = parsed.data.folderId ?? null; if (folderId && !(await prisma.folder.findFirst({ where: { id: folderId, userId, isDeleted: false } }))) folderId = null;
    const envelope = encryptForDrive(bytes); const file = await prisma.file.create({ data: { userId, name: safeFileName(parsed.data.name), mimeType: parsed.data.mimeType || 'application/octet-stream', size: bytes.length, folderId, encryptedContent: '', encryptionIV: envelope.iv, encryptionAuthTag: envelope.authTag, encryptionKey: envelope.wrappedKey, contentHash: envelope.contentHash } }); const key = versionKey(userId, file.id, 1, envelope.contentHash);
    try { await putDriveObject(key, envelope.ciphertext); await prisma.$transaction([prisma.file.update({ where: { id: file.id }, data: { encryptedContent: key } }), prisma.fileVersion.create({ data: { fileId: file.id, versionNumber: 1, encryptedContent: key, encryptionIV: envelope.iv, encryptionAuthTag: envelope.authTag, encryptionKey: envelope.wrappedKey, size: bytes.length } })]); }
    catch (error) { await deleteDriveObject(key).catch(() => undefined); await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined); throw error; }
    const quota = await quotaService.getQuota(userId); return reply.status(201).send({ file: fileDto({ ...file, folderId, encryptedContent: key }, await ownerInfo(prisma, userId)), quota: { used: quota.usedBytes, total: quota.limitBytes } });
  });
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/download', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request)); requireStorage(); const plaintext = await checkedPlaintext(file);
    return reply.header('Content-Type', file.mimeType || 'application/octet-stream').header('Content-Length', String(plaintext.length)).header('Content-Disposition', `attachment; filename="${safeFileName(file.name)}"`).header('X-Content-Type-Options', 'nosniff').send(plaintext);
  });
  fastify.post<{ Body: { fileIds?: string[]; targetFolderId?: string | null } }>('/drive/files/move', async (request, reply) => {
    const userId = requireUserId(request); const ids = request.body?.fileIds ?? []; const target = request.body?.targetFolderId ?? null; if (target && !(await prisma.folder.findFirst({ where: { id: target, userId, isDeleted: false } }))) throw createAppError('Target folder not found', 404, 'NOT_FOUND'); await prisma.file.updateMany({ where: { id: { in: ids }, userId, isDeleted: false }, data: { folderId: target } }); return reply.send({ ok: true });
  });
  fastify.post<{ Params: { id: string }; Body: { targetFolderId?: string | null } }>('/drive/files/:id/copy', async (request, reply) => {
    const userId = requireUserId(request); requireStorage(); const source = await fileAccess(prisma, request.params.id, userId); const plaintext = await checkedPlaintext(source); await quotaService.checkQuota(userId, plaintext.length);
    const envelope = encryptForDrive(plaintext); const file = await prisma.file.create({ data: { userId, name: safeFileName(`${source.name} (copy)`), mimeType: source.mimeType, size: plaintext.length, folderId: request.body?.targetFolderId ?? source.folderId ?? null, encryptedContent: '', encryptionIV: envelope.iv, encryptionAuthTag: envelope.authTag, encryptionKey: envelope.wrappedKey, contentHash: envelope.contentHash } }); const key = versionKey(userId, file.id, 1, envelope.contentHash);
    try { await putDriveObject(key, envelope.ciphertext); await prisma.$transaction([prisma.file.update({ where: { id: file.id }, data: { encryptedContent: key } }), prisma.fileVersion.create({ data: { fileId: file.id, versionNumber: 1, encryptedContent: key, encryptionIV: envelope.iv, encryptionAuthTag: envelope.authTag, encryptionKey: envelope.wrappedKey, size: plaintext.length } })]); }
    catch (error) { await deleteDriveObject(key).catch(() => undefined); await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined); throw error; }
    return reply.status(201).send(fileDto({ ...file, encryptedContent: key }, await ownerInfo(prisma, userId)));
  });
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id', async (request, reply) => {
    const userId = requireUserId(request); const file = await prisma.file.findFirst({ where: { id: request.params.id, userId, isDeleted: true } }); if (!file) throw createAppError('Move the file to trash before permanently deleting it', 409, 'NOT_TRASHED'); requireStorage(); await purgeRows(fastify, userId, [file.id], []); return reply.send({ ok: true });
  });
  fastify.get('/drive/memory', async (request, reply) => {
    const userId = requireUserId(request); const rows = await prisma.memoryRecord.findMany({ where: { ownerType: 'user', ownerId: userId, deletedAt: null, archivedAt: null }, orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }], take: MEMORY_SCAN_LIMIT, select: { logicalId: true, version: true, kind: true, level: true, content: true, pinned: true, metadata: true, expiresAt: true, createdAt: true, updatedAt: true } }) as MemoryRow[];
    const heads = new Map<string, MemoryRow>(); for (const row of rows) if (!heads.has(row.logicalId)) heads.set(row.logicalId, row); const now = Date.now();
    const memories = [...heads.values()].filter((row) => !row.expiresAt || row.expiresAt.getTime() > now).map((row) => { const source = memorySource(row.metadata); return { id: row.logicalId, version: row.version, kind: row.kind, level: row.level, content: row.content, summary: memorySummary(row.content), sourceApp: source.app, sourceLabel: source.label, pinned: row.pinned, createdAt: row.createdAt, updatedAt: row.updatedAt }; });
    return reply.send({ memories, total: memories.length, truncated: rows.length >= MEMORY_SCAN_LIMIT });
  });
  fastify.delete<{ Params: { logicalId: string } }>('/drive/memory/:logicalId', async (request, reply) => {
    const userId = requireUserId(request); const logicalId = request.params.logicalId; const owned = await prisma.memoryRecord.findFirst({ where: { logicalId, ownerType: 'user', ownerId: userId, deletedAt: null }, select: { id: true } }); if (!owned) throw createAppError('Not found', 404, 'NOT_FOUND'); const result = await prisma.memoryRecord.updateMany({ where: { logicalId, ownerType: 'user', ownerId: userId, archivedAt: null, deletedAt: null }, data: { archivedAt: new Date() } }); return reply.send({ ok: true, archived: result.count ?? 0 });
  });
}
