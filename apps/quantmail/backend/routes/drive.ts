// ============================================================================
// QuantMail — Drive routes (/drive/*) for the Drive page.
// The page called /drive/files etc. which did not exist ("Failed to fetch
// files"). Backed by the File + Folder Prisma models. NOTE: the Drive hook uses
// raw fetch and expects UN-enveloped shapes ({ files, quota } / the object
// itself), so these routes intentionally do NOT use { success, data }.
// Global auth hook → req.auth. Upload/download use envelope encryption on top of
// S3-compatible object storage (see services/drive-storage.service.ts).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  DRIVE_MAX_BODY_BYTES,
  DRIVE_MAX_FILE_BYTES,
  DRIVE_QUOTA_BYTES,
  decryptFromDrive,
  deleteDriveObject,
  driveObjectKey,
  driveStorageReady,
  driveStorageUnavailableReason,
  encryptForDrive,
  getDriveObject,
  putDriveObject,
  safeFileName,
} from '../services/drive-storage.service';

const TOTAL_QUOTA = DRIVE_QUOTA_BYTES;

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

async function usedBytes(prisma: any, userId: string): Promise<number> {
  const rows = (await prisma.file.findMany({
    where: { userId, isDeleted: false },
    select: { size: true },
  })) as Array<{ size: number }>;
  return rows.reduce((sum, r) => sum + (r.size || 0), 0);
}

// ── AI Memory (the /drive/memory surface) ───────────────────────────────────
//
// Drive is where the user's things live, and what the assistant has learned
// about them is one of those things — so it belongs here rather than behind a
// settings tab nobody opens. The rows come from `memory_records`, the one
// durable table every app writes through (`@quant/ai`'s PrismaMemoryStore).
// That shared table is what makes this a unified view rather than a
// QuantMail-only one: a writing style learned from a sent mail and a preference
// learned in QuantChat are the same row shape in the same place.

/** How many rows we will project a latest-version view over in one request. */
const MEMORY_SCAN_LIMIT = 2000;

/** Apps that write memory under a `<app>-<topic>` session name. */
const MEMORY_APP_LABELS: Record<string, string> = {
  quantmail: 'QuantMail',
  quantchat: 'QuantChat',
  quantube: 'QuantTube',
  quantai: 'QuantAI',
  quantdocs: 'QuantDocs',
  quantmeet: 'QuantMeet',
  quantcalendar: 'QuantCalendar',
  quantdrive: 'QuantDrive',
};

/**
 * Channels that are shared by design. `UserStyleMemory` and
 * `UserContactMemory` are written by whichever app noticed first and read by
 * all of them, so pinning them on one app would be a guess dressed up as a
 * fact. They get their own bucket instead.
 */
const MEMORY_SHARED_SESSIONS = new Set(['user-style', 'user-contacts']);

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

function metaStr(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Best-effort provenance. `RememberRequest.metadata` is documented as freeform
 * and owned by the writer, so there is no guaranteed `app` field — `session` is
 * the signal that is actually always there.
 */
function memorySource(metadata: unknown): { app: string; label: string } {
  const declared = (metaStr(metadata, 'app') || metaStr(metadata, 'sourceApp') || '').toLowerCase();
  if (MEMORY_APP_LABELS[declared]) return { app: declared, label: MEMORY_APP_LABELS[declared] };

  const session = metaStr(metadata, 'session');
  if (session) {
    if (MEMORY_SHARED_SESSIONS.has(session)) return { app: 'shared', label: 'Shared across apps' };
    const prefix = session.split('-')[0]?.toLowerCase() ?? '';
    if (MEMORY_APP_LABELS[prefix]) return { app: prefix, label: MEMORY_APP_LABELS[prefix] };
  }
  if (declared) return { app: declared, label: declared };
  return { app: 'shared', label: 'Shared across apps' };
}

/**
 * The one line a memory shows.
 *
 * `UserStyleMemory` stores its profile as `user-style-profile {…json…}` — right
 * for the retriever, unreadable for a person — so that one shape gets unpacked
 * into words. Everything else is already a sentence and is left alone.
 */
function memorySummary(content: string): string {
  const STYLE_PREFIX = 'user-style-profile ';
  if (!content.startsWith(STYLE_PREFIX)) return content;
  try {
    const p = JSON.parse(content.slice(STYLE_PREFIX.length)) as Record<string, unknown>;
    const bits: string[] = [];
    if (typeof p['tone'] === 'string' && p['tone']) bits.push(`${p['tone']} tone`);
    if (typeof p['vocabularyLevel'] === 'string' && p['vocabularyLevel'])
      bits.push(`${p['vocabularyLevel']} vocabulary`);
    if (typeof p['greetingStyle'] === 'string' && p['greetingStyle'])
      bits.push(`opens with "${p['greetingStyle']}"`);
    if (typeof p['closingStyle'] === 'string' && p['closingStyle'])
      bits.push(`signs off "${p['closingStyle']}"`);
    if (Array.isArray(p['traits']))
      bits.push(...p['traits'].filter((t): t is string => typeof t === 'string'));
    return bits.length > 0 ? `Writing style — ${bits.join(', ')}` : 'Writing style profile';
  } catch {
    return 'Writing style profile';
  }
}

const uploadBodySchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional(),
  folderId: z.string().nullable().optional(),
  contentBase64: z.string().min(1),
});

export default async function driveRoutes(fastify: FastifyInstance) {
  // GET /drive/quota — just the two numbers, no file list.
  //
  // The sidebars used to render hardcoded storage figures — `1.2 / 15 GB` in
  // AppSidebar and `3.5 GB of 15 GB used` in Sidebar, on the same account, at
  // the same time. Both are on every screen in the app, so neither can afford
  // to pull the full `/drive/files` payload just to draw a progress bar.
  fastify.get('/drive/quota', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const used = await usedBytes(prisma, userId);
    return reply.send({ used, total: TOTAL_QUOTA });
  });

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

  // POST /drive/upload — the Next proxy turns the browser's multipart form into
  // JSON base64 so the backend needs no multipart parser. Bytes are encrypted
  // here and only the ciphertext leaves for object storage.
  fastify.post('/drive/upload', { bodyLimit: DRIVE_MAX_BODY_BYTES }, async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    if (!driveStorageReady()) {
      throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
    }

    const parsed = uploadBodySchema.safeParse(request.body);
    if (!parsed.success) throw createAppError('Invalid upload payload', 400, 'VALIDATION_ERROR');

    const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
    if (bytes.length === 0) throw createAppError('Empty file', 400, 'VALIDATION_ERROR');
    if (bytes.length > DRIVE_MAX_FILE_BYTES) {
      throw createAppError('File is larger than the upload limit', 413, 'FILE_TOO_LARGE');
    }

    const used = await usedBytes(prisma, userId);
    if (used + bytes.length > TOTAL_QUOTA) {
      throw createAppError('Storage quota exceeded', 507, 'QUOTA_EXCEEDED');
    }

    let folderId = parsed.data.folderId ?? null;
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.userId !== userId) folderId = null;
    }

    const envelope = encryptForDrive(bytes);
    const created = (await prisma.file.create({
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
    })) as FileRow;

    const key = driveObjectKey(userId, created.id);
    try {
      await putDriveObject(key, envelope.ciphertext);
      await prisma.file.update({ where: { id: created.id }, data: { encryptedContent: key } });
    } catch (err) {
      // Never leave a metadata row pointing at a missing object.
      await prisma.file.delete({ where: { id: created.id } }).catch(() => undefined);
      fastify.log.error({ err }, 'drive upload failed');
      throw createAppError('Upload failed while storing the file', 502, 'STORAGE_ERROR');
    }

    const owner = await ownerInfo(prisma, userId);
    return reply.status(201).send({
      file: fileDto({ ...created, folderId }, owner),
      quota: { used: used + bytes.length, total: TOTAL_QUOTA },
    });
  });

  // GET /drive/files/:id/download — decrypts and streams the file back.
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/download', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const file = await prisma.file.findUnique({ where: { id: request.params.id } });
    if (!file || file.userId !== userId || file.isDeleted) {
      throw createAppError('Not found', 404, 'NOT_FOUND');
    }
    if (!file.encryptedContent)
      throw createAppError('File has no stored content', 409, 'NO_CONTENT');
    if (!driveStorageReady()) {
      throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
    }

    const ciphertext = await getDriveObject(file.encryptedContent);
    const plaintext = decryptFromDrive(
      ciphertext,
      file.encryptionIV,
      file.encryptionAuthTag,
      file.encryptionKey,
    );

    return reply
      .header('Content-Type', file.mimeType || 'application/octet-stream')
      .header('Content-Length', String(plaintext.length))
      .header('Content-Disposition', `attachment; filename="${safeFileName(file.name)}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(plaintext);
  });

  // POST /drive/files/move — move files into another folder (or the root).
  fastify.post<{ Body: { fileIds?: string[]; targetFolderId?: string | null } }>(
    '/drive/files/move',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      const ids = Array.isArray(request.body?.fileIds) ? request.body!.fileIds! : [];
      let target = request.body?.targetFolderId ?? null;
      if (target) {
        const folder = await prisma.folder.findUnique({ where: { id: target } });
        if (!folder || folder.userId !== userId) {
          throw createAppError('Target folder not found', 404, 'NOT_FOUND');
        }
      } else {
        target = null;
      }
      if (ids.length > 0) {
        await prisma.file.updateMany({
          where: { id: { in: ids }, userId },
          data: { folderId: target },
        });
      }
      return reply.send({ ok: true });
    },
  );

  // POST /drive/files/:id/copy — duplicate metadata + a fresh encrypted object.
  fastify.post<{ Params: { id: string }; Body: { targetFolderId?: string | null } }>(
    '/drive/files/:id/copy',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      if (!driveStorageReady()) {
        throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
      }
      const source = await prisma.file.findUnique({ where: { id: request.params.id } });
      if (!source || source.userId !== userId || source.isDeleted) {
        throw createAppError('Not found', 404, 'NOT_FOUND');
      }

      const used = await usedBytes(prisma, userId);
      if (used + (source.size || 0) > TOTAL_QUOTA) {
        throw createAppError('Storage quota exceeded', 507, 'QUOTA_EXCEEDED');
      }

      const plaintext = decryptFromDrive(
        await getDriveObject(source.encryptedContent),
        source.encryptionIV,
        source.encryptionAuthTag,
        source.encryptionKey,
      );
      const envelope = encryptForDrive(plaintext);
      const created = (await prisma.file.create({
        data: {
          userId,
          name: safeFileName(`${source.name} (copy)`),
          mimeType: source.mimeType,
          size: source.size,
          folderId: request.body?.targetFolderId ?? source.folderId ?? null,
          encryptedContent: '',
          encryptionIV: envelope.iv,
          encryptionAuthTag: envelope.authTag,
          encryptionKey: envelope.wrappedKey,
          contentHash: envelope.contentHash,
        },
      })) as FileRow;

      const key = driveObjectKey(userId, created.id);
      await putDriveObject(key, envelope.ciphertext);
      await prisma.file.update({ where: { id: created.id }, data: { encryptedContent: key } });

      const owner = await ownerInfo(prisma, userId);
      return reply.status(201).send(fileDto(created, owner));
    },
  );

  // DELETE /drive/files/:id — permanent delete: purges the stored object too.
  fastify.delete<{ Params: { id: string } }>('/drive/files/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const file = await prisma.file.findUnique({ where: { id: request.params.id } });
    if (!file || file.userId !== userId) throw createAppError('Not found', 404, 'NOT_FOUND');

    if (file.encryptedContent) {
      try {
        await deleteDriveObject(file.encryptedContent);
      } catch (err) {
        // Metadata removal must still succeed; orphaned objects are cheap to sweep.
        fastify.log.warn({ err }, 'drive object purge failed');
      }
    }
    await prisma.file.delete({ where: { id: file.id } });
    return reply.send({ ok: true });
  });

  // GET /drive/memory — the head version of every live memory this user owns.
  fastify.get('/drive/memory', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

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

    // Writes are immutable-append, so a logicalId can hold several versions.
    // Newest-first ordering means the first row we see for one IS its head.
    const heads = new Map<string, MemoryRow>();
    for (const row of rows) {
      if (!heads.has(row.logicalId)) heads.set(row.logicalId, row);
    }

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

  // DELETE /drive/memory/:logicalId — forget, the way the port defines forgetting.
  //
  // `ForgetPolicy`'s documented default is 'archive', not 'hard': every version
  // of the slot gets an `archivedAt` so the row stays auditable and a mistaken
  // tap is recoverable. It leaves the user's view either way, which is the part
  // they asked for.
  fastify.delete<{ Params: { logicalId: string } }>(
    '/drive/memory/:logicalId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      const { logicalId } = request.params;

      const owned = await prisma.memoryRecord.findFirst({
        where: { logicalId, ownerType: 'user', ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!owned) throw createAppError('Not found', 404, 'NOT_FOUND');

      const result = await prisma.memoryRecord.updateMany({
        where: {
          logicalId,
          ownerType: 'user',
          ownerId: userId,
          archivedAt: null,
          deletedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      return reply.send({ ok: true, archived: result?.count ?? 0 });
    },
  );
}
