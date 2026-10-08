import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { AIEngine } from '@quant/ai';
import { createAppError, enableIdempotency } from '@quant/server-core';
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
import {
  isQuarantined,
  normalizeScanStatus,
  quarantineBlockedMessage,
} from '../services/file-scan.service';
import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import { AttachmentService } from '../services/attachment.service';
import {
  DefaultAttachmentScanner,
  type AttachmentScannerPort,
} from '../services/attachment-scanner.service';

const MEMORY_SCAN_LIMIT = 2000;
const MEMORY_APP_LABELS: Record<string, string> = {
  mail: 'QuantMail',
  quantmail: 'QuantMail',
  calendar: 'QuantCalendar',
  quantcalendar: 'QuantCalendar',
  drive: 'QuantDrive',
  quantdrive: 'QuantDrive',
  contacts: 'QuantContacts',
  quantcontacts: 'QuantContacts',
  git: 'QuantGit',
  quantgit: 'QuantGit',
};
const MEMORY_SHARED_SESSIONS = new Set(['user-style', 'user-contacts']);
// Canonical short-form app ids exposed as `sourceApp`. Declared metadata may
// use the long "quant*" form; the API normalizes to the canonical short form
// so clients can rely on one stable identifier per app.
const MEMORY_APP_CANONICAL: Record<string, string> = {
  quantcalendar: 'calendar',
  quantgit: 'git',
  quantcontacts: 'contacts',
};
const AI_FILE_SCHEMA = z.object({ fileId: z.string().min(1) });
const AI_SEARCH_SCHEMA = z.object({
  fileId: z.string().min(1).optional(),
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

const DRIVE_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/vnd.google-apps.document',
];

const DRIVE_SPREADSHEET_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

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
  // QM-M39-009: security scan state (pending | scanning | clean | quarantined | unknown)
  scanStatus: string | null;
  scanReason: string | null;
  scannedAt: Date | null;
  // QM-M39-002: nullable — NULL means the file was never explicitly opened;
  // recency ordering falls back to updatedAt for those rows.
  lastOpenedAt: Date | null;
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
// ============================================================================
// QM-M39-006 (screen 22): link-share scope/audience/expiry helpers.
// ============================================================================
type LinkScope = 'anyone' | 'org' | 'specific';

/** Parse the dialog's expiry input. Bare YYYY-MM-DD dates mean end of that day (UTC). */
function parseLinkExpiry(expiresAt?: string | null, expiresInDays?: number): Date | null {
  if (expiresAt) {
    const trimmed = expiresAt.trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T23:59:59.999Z` : trimmed;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
      throw createAppError('Expiry date is not a valid date', 400, 'INVALID_EXPIRY');
    if (date.getTime() <= Date.now())
      throw createAppError('Expiry date must be in the future', 400, 'EXPIRY_IN_PAST');
    return date;
  }
  if (expiresInDays) return new Date(Date.now() + expiresInDays * 86_400_000);
  return null;
}

/**
 * Resolve audience emails to user IDs for scope='specific'. Unknown emails
 * are rejected outright: the link must never silently cover fewer people
 * than the creator picked.
 */
async function resolveLinkAudience(prisma: any, scope: LinkScope, emails?: string[]): Promise<string[]> {
  if (scope !== 'specific') return [];
  const list = [...new Set((emails ?? []).map((e) => e.trim().toLowerCase()))].filter(Boolean);
  if (list.length === 0)
    throw createAppError(
      'Specific-people links need at least one person',
      400,
      'AUDIENCE_REQUIRED',
    );
  const users = await prisma.user.findMany({
    where: { email: { in: list } },
    select: { id: true, email: true },
  });
  const found = new Set(users.map((u: any) => String(u.email).toLowerCase()));
  const unknown = list.filter((e) => !found.has(e));
  if (unknown.length > 0)
    throw createAppError(
      `No Quant account found for: ${unknown.join(', ')}`,
      400,
      'AUDIENCE_UNKNOWN',
    );
  return users.map((u: any) => u.id);
}

/** Org IDs the user belongs to (for scope='org' enforcement). */
async function userOrgIds(prisma: any, userId: string): Promise<string[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { orgId: true },
  });
  return memberships.map((m: any) => m.orgId);
}

/** Org names the user belongs to (for honest audience display). Display-only:
 * degrades to [] when the delegate is unavailable rather than failing the
 * whole listing. */
async function userOrgNames(prisma: any, userId: string): Promise<string[]> {
  const delegate = prisma.organizationMember;
  if (!delegate || typeof delegate.findMany !== 'function') return [];
  const memberships = await delegate.findMany({
    where: { userId },
    select: { org: { select: { name: true } } },
  });
  return memberships.map((m: any) => m.org?.name).filter(Boolean);
}

/** Best-effort optional auth for public link routes: verify a presented token, never require one. */
async function optionalAuthUserId(fastify: FastifyInstance, request: unknown): Promise<string | null> {
  const direct = (request as { auth?: { userId?: string } }).auth?.userId;
  if (direct) return direct;
  const optionalAuth = (fastify as { optionalAuth?: () => (req: unknown) => Promise<void> })
    .optionalAuth;
  if (typeof optionalAuth === 'function') {
    await optionalAuth()(request);
    return (request as { auth?: { userId?: string } }).auth?.userId ?? null;
  }
  return null;
}

/**
 * Enforce a link's scope on resolve/download. 'anyone' passes. 'org' and
 * 'specific' require a signed-in viewer who belongs: expiry is checked before
 * this is called, so a scope rejection can never mask an expired link.
 */
async function enforceLinkScope(
  fastify: FastifyInstance,
  prisma: any,
  request: unknown,
  share: any,
): Promise<void> {
  const scope = (share.scope ?? 'anyone') as LinkScope;
  if (scope === 'anyone') return;
  const viewerId = await optionalAuthUserId(fastify, request);
  if (!viewerId)
    throw createAppError(
      'This link is restricted — sign in to continue',
      401,
      'LINK_SIGNIN_REQUIRED',
    );
  if (scope === 'specific') {
    const audience: string[] = share.audience ? JSON.parse(share.audience) : [];
    if (!audience.includes(viewerId))
      throw createAppError('This link was not shared with you', 403, 'LINK_AUDIENCE_FORBIDDEN');
    return;
  }
  // scope === 'org': viewer must share at least one organization with the owner.
  const ownerOrgs = new Set(await userOrgIds(prisma, share.createdById));
  const viewerOrgs = await userOrgIds(prisma, viewerId);
  if (!viewerOrgs.some((orgId) => ownerOrgs.has(orgId)))
    throw createAppError(
      'This link is only available to members of the owner\u2019s organization',
      403,
      'LINK_ORG_FORBIDDEN',
    );
}

/** Honest audience label for list display: what the dialog shows is what the link reaches. */
function linkAudienceLabel(scope: LinkScope, audienceEmails: string[], orgNames: string[]): string {
  if (scope === 'specific')
    return audienceEmails.length > 0
      ? audienceEmails.join(', ')
      : 'Specific people';
  if (scope === 'org')
    return orgNames.length > 0 ? `Members of ${orgNames.join(', ')}` : 'Organization members';
  return 'Anyone with the link';
}

/** Resolve stored audience user IDs back to emails for display. */
async function emailsForUserIds(prisma: any, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { email: true },
  });
  return users.map((u: any) => u.email).filter(Boolean);
}

/** Canonical link DTO: every surface reads the same honest state from the row. */
function linkDto(
  link: any,
  audienceEmails: string[],
  orgNames: string[],
): Record<string, unknown> {
  const scope = (link.scope ?? 'anyone') as LinkScope;
  const expiresAt = link.expiresAt ? new Date(link.expiresAt) : null;
  return {
    id: link.id,
    role: link.role,
    scope,
    audience: linkAudienceLabel(scope, audienceEmails, orgNames),
    audienceEmails,
    audienceOrgs: scope === 'org' ? orgNames : [],
    requiresPassword: Boolean(link.password),
    expiresAt: link.expiresAt,
    expired: expiresAt ? expiresAt.getTime() < Date.now() : false,
    createdAt: link.createdAt,
    shareUrl: `/drive/share/${link.token}`,
  };
}
function requireStorage(): void {
  if (!driveStorageReady())
    throw createAppError(driveStorageUnavailableReason(), 503, 'STORAGE_UNAVAILABLE');
}
/**
 * Object storage via the generic R2/S3 resolver. Optional at startup like the
 * rest of the storage layer: missing env fails the request with a clear 503
 * instead of crashing the process or surfacing an opaque 500.
 */
function requireObjectStorage(): StorageClient {
  const config = resolveStorageConfigFromEnv();
  if (!config) {
    throw createAppError(
      'Object storage is not configured \u2014 set S3/R2 env vars',
      503,
      'STORAGE_NOT_CONFIGURED',
    );
  }
  return new StorageClient(config);
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
    // QM-M39-002: last explicit open (preview/download/open action). NULL when
    // never opened; clients fall back to modifiedAt for recency display.
    lastOpenedAt: file.lastOpenedAt ?? null,
    owner,
    sharedWith: decorations?.shares.get(`file:${file.id}`) ?? [],
    isStarred: file.isStarred,
    versions: decorations?.versions.get(file.id) ?? [],
    thumbnailUrl: `/api/drive/files/${file.id}/thumbnail`,
    // QM-M39-009: scan state. 'unknown' is the honest state for unscanned
    // files — never rendered as safe by the UI.
    scanStatus: normalizeScanStatus(file.scanStatus),
    scanReason: file.scanReason ?? null,
    scannedAt: file.scannedAt ?? null,
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
// ============================================================================
// QM-UIUX-079 — Documents are first-class Drive items.
//
// Documents created through the Drive doc editor (`/documents`) live in the
// `documents` table, but the Drive surface (`/drive/files`, `/drive/search`,
// `/drive/recent`, Home categories, Trash) only ever read `drive_files` /
// `drive_folders` — so a created document loaded fine via its direct URL yet
// appeared NOWHERE in Drive. Rather than duplicating document content into
// drive_files (a second source of truth), the Drive API projects each Document
// row as a virtual Drive item. The `doc:` id prefix keeps document ids
// unambiguous so file-keyed handlers (download, star, versions) never mistake
// one for a drive_files row. Documents have no storage object, no scan state
// and no star — the DTO says so explicitly instead of inventing values.
// ============================================================================
const QUANT_DOCUMENT_MIME = 'application/x-quant-document';
const DOCUMENT_DRIVE_ID_PREFIX = 'doc:';

function isDocumentDriveId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(DOCUMENT_DRIVE_ID_PREFIX);
}

function documentIdFromDriveId(id: string): string {
  return id.slice(DOCUMENT_DRIVE_ID_PREFIX.length);
}

function documentDriveDto(doc: any, owner: Owner) {
  const content = typeof doc.content === 'string' ? doc.content : '';
  return {
    id: `${DOCUMENT_DRIVE_ID_PREFIX}${doc.id}`,
    name: doc.title || 'Untitled Document',
    type: 'document' as const,
    mimeType: QUANT_DOCUMENT_MIME,
    size: Buffer.byteLength(content, 'utf8'),
    path: '',
    parentId: null,
    modifiedAt: doc.updatedAt,
    // Documents track no explicit open — recency falls back to updatedAt.
    lastOpenedAt: null,
    owner,
    sharedWith: [],
    // Documents have no star flag — never rendered as starred.
    isStarred: false,
    versions: [],
    thumbnailUrl: null,
    // Documents are never scanned — the honest state is null (no badge),
    // not 'unknown' (which renders a "not scanned" warning for files).
    scanStatus: null,
    scanReason: null,
    scannedAt: null,
    // Real Document row id — the Drive UI routes document opens to the doc
    // editor with this id (`/drive/doc/<documentId>`).
    documentId: doc.id,
    // The Document table carries no deletion timestamp; the soft-delete
    // update bumps updatedAt, which is the honest deletion time.
    deletedAt: doc.isDeleted ? doc.updatedAt : null,
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
// ============================================================================
// QM-M39-002: honest "opened at" tracking for the Drive Recent view.
// Records lastOpenedAt = NOW() for an explicit open/preview/download action.
//
// The write goes through a raw UPDATE that touches ONLY the lastOpenedAt
// column: a prisma file.update would also bump @updatedAt, which would make
// a mere open look like a content modification everywhere the file list is
// sorted by modifiedAt. Best-effort: tracking must never break the open /
// download itself (e.g. on a DB that has not applied the 0085 migration yet),
// so failures are logged and swallowed.
// ============================================================================
async function recordFileOpened(prisma: any, fileId: string, log?: (msg: string) => void) {
  try {
    await prisma.$executeRawUnsafe('UPDATE "drive_files" SET "lastOpenedAt" = NOW() WHERE "id" = $1', fileId);
  } catch (err) {
    log?.(`recordFileOpened failed for ${fileId}: ${err instanceof Error ? err.message : err}`);
  }
}
// ============================================================================
// QM-M39-008: per-file activity/history event log (M39 screen 25).
//
// The backend appends exactly one row per REAL file action — upload, rename,
// move, share change, version restore. Nothing is ever backfilled or invented,
// so a file may honestly have zero events. The write goes through raw SQL
// with the same best-effort contract as recordFileOpened above: a DB that has
// not applied the 0087 migration yet (or any transient DB failure) must never
// break the action itself — failures are logged and swallowed.
// ============================================================================
// Details come back from node-pg as parsed JSONB, but some drivers return the
// raw text. Parse defensively; a corrupt payload becomes an empty object,
// never a 500.
function safeParseJson(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
type FileActivityAction =
  | 'upload'
  | 'rename'
  | 'move'
  | 'share_added'
  | 'share_updated'
  | 'share_revoked'
  | 'version_restored';
interface RecordFileActivityInput {
  fileId: string;
  ownerUserId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: FileActivityAction;
  details?: Record<string, unknown>;
}
async function recordFileActivity(
  prisma: any,
  input: RecordFileActivityInput,
  log?: (msg: string) => void,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "drive_file_activity_events" ' +
        '("id","fileId","userId","actorUserId","actorName","actorEmail","action","details","createdAt") ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
      randomUUID(),
      input.fileId,
      input.ownerUserId,
      input.actorUserId,
      input.actorName,
      input.actorEmail,
      input.action,
      JSON.stringify(input.details ?? {}),
      new Date(),
    );
  } catch (err) {
    log?.(
      `recordFileActivity failed for ${input.fileId} (${input.action}): ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
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
function metaNumber(metadata: unknown, ...keys: string[]): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function metaString(metadata: unknown, ...keys: string[]): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function metaStringArray(metadata: unknown, ...keys: string[]): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
    }
  }
  return [];
}

function memoryConfidence(metadata: unknown): number | null {
  const value = metaNumber(metadata, 'confidenceScore', 'confidence');
  if (value === null) return null;
  return value <= 1 ? Math.round(value * 100) : Math.round(Math.min(100, value));
}

function memorySource(metadata: unknown): { app: string; label: string } {
  const declared = (metaStr(metadata, 'app') || metaStr(metadata, 'sourceApp') || '').toLowerCase();
  if (MEMORY_APP_LABELS[declared]) {
    const app = MEMORY_APP_CANONICAL[declared] ?? declared;
    return { app, label: MEMORY_APP_LABELS[declared] };
  }
  const session = metaStr(metadata, 'session');
  if (session) {
    if (MEMORY_SHARED_SESSIONS.has(session)) return { app: 'shared', label: 'Shared across apps' };
    const prefix = session.split('-')[0]?.toLowerCase() ?? '';
    if (MEMORY_APP_LABELS[prefix]) {
      const app = MEMORY_APP_CANONICAL[prefix] ?? prefix;
      return { app, label: MEMORY_APP_LABELS[prefix] };
    }
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
const linkScopeSchema = z.enum(['anyone', 'org', 'specific']);
const publicShareLinkSchema = z.object({
  fileId: z.string().min(1),
  role: z.enum(['viewer', 'editor']).optional().default('viewer'),
  // QM-M39-006 (screen 22): link scope + audience. 'anyone' = anyone holding
  // the URL. 'org' = signed-in members of an organization the owner belongs
  // to (no orgId picks "every org I belong to"). 'specific' = only the given
  // people. audienceEmails are resolved to user IDs server-side; unknown
  // emails are rejected so the link never silently covers fewer people than
  // the creator picked.
  scope: linkScopeSchema.optional().default('anyone'),
  audienceEmails: z.array(z.string().email().max(255)).max(50).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  // Absolute expiry from the dialog's date picker. Accepts a full ISO
  // datetime or a bare YYYY-MM-DD date (treated as end of that day, UTC).
  // Null/omitted = no expiry.
  expiresAt: z.string().min(1).max(40).nullable().optional(),
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
const initiateMultipartSchema = z.object({
  name: z.string().min(1).max(255),
  totalSize: z.number().int().positive().max(DRIVE_MAX_FILE_BYTES),
  mimeType: z.string().max(255).optional(),
  folderId: z.string().nullable().optional(),
  partSize: z
    .number()
    .int()
    .min(5 * 1024 * 1024)
    .max(50 * 1024 * 1024)
    .optional(),
});
const multipartPartUrlSchema = z.object({
  key: z.string().min(1),
  partNumber: z.number().int().min(1).max(10000),
});
const completeMultipartSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(255),
  totalSize: z.number().int().positive().max(DRIVE_MAX_FILE_BYTES),
  mimeType: z.string().max(255).optional(),
  folderId: z.string().nullable().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z.string().min(1),
      }),
    )
    .min(1),
});
const abortMultipartSchema = z.object({
  key: z.string().min(1),
});

export interface DriveRoutesOptions {
  /** Injectable for tests; defaults to a real AttachmentService over the app Prisma client. */
  attachmentService?: AttachmentService;
  /** Injectable for tests; defaults to the real heuristic malware scanner. */
  attachmentScanner?: AttachmentScannerPort;
}

export default async function driveRoutes(fastify: FastifyInstance, options?: DriveRoutesOptions) {
  // K4: Idempotency-Key support on Drive uploads (incl. chunked uploads).
  enableIdempotency(fastify);

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
    const userId = requireUserId(request);
    if (parsed.data.fileId) {
      const { file, content } = await aiFile(request, { fileId: parsed.data.fileId });
      await searchService.indexFile(file.id, file.name, content, file.mimeType, userId);
    }
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
      filter?:
        | 'all'
        | 'folders'
        | 'documents'
        | 'images'
        | 'spreadsheets'
        | 'media'
        | 'starred'
        | 'trash';
    };
  }>('/drive/files', async (request, reply) => {
    const userId = requireUserId(request);
    const filter = request.query.filter;
    const folderId = request.query.folderId || null;
    const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
    const cursor = request.query.cursor;
    const sortBy = request.query.sortBy || 'updatedAt';
    const sortDir = request.query.sortDir === 'asc' ? 'asc' : 'desc';
    const owner = await ownerInfo(prisma, userId);

    let folderWhere: any = null;
    let fileWhere: any = null;
    let returnFolders = true;
    let returnFiles = true;

    if (filter === 'folders') {
      folderWhere = { userId, parentId: folderId, isDeleted: false };
      returnFiles = false;
    } else if (filter === 'images') {
      returnFolders = false;
      fileWhere = { userId, isDeleted: false, mimeType: { startsWith: 'image/' } };
      if (folderId) fileWhere.folderId = folderId;
    } else if (filter === 'media') {
      returnFolders = false;
      fileWhere = {
        userId,
        isDeleted: false,
        OR: [{ mimeType: { startsWith: 'video/' } }, { mimeType: { startsWith: 'audio/' } }],
      };
      if (folderId) fileWhere.folderId = folderId;
    } else if (filter === 'documents') {
      returnFolders = false;
      fileWhere = {
        userId,
        isDeleted: false,
        mimeType: { in: DRIVE_DOCUMENT_MIME_TYPES },
      };
      if (folderId) fileWhere.folderId = folderId;
    } else if (filter === 'spreadsheets') {
      returnFolders = false;
      fileWhere = {
        userId,
        isDeleted: false,
        mimeType: { in: DRIVE_SPREADSHEET_MIME_TYPES },
      };
      if (folderId) fileWhere.folderId = folderId;
    } else if (filter === 'starred') {
      folderWhere = { userId, isStarred: true, isDeleted: false };
      if (folderId) folderWhere.parentId = folderId;
      fileWhere = { userId, isStarred: true, isDeleted: false };
      if (folderId) fileWhere.folderId = folderId;
    } else if (filter === 'trash') {
      folderWhere = { userId, isDeleted: true };
      if (folderId) folderWhere.parentId = folderId;
      fileWhere = { userId, isDeleted: true };
      if (folderId) fileWhere.folderId = folderId;
    } else {
      folderWhere = { userId, parentId: folderId, isDeleted: false };
      fileWhere = { userId, folderId, isDeleted: false };
    }

    // QM-UIUX-079 — documents (the doc-editor `documents` table) are projected
    // into Drive listings so a created document shows up everywhere a file
    // does. Documents have no folder, so they only join the root listing and
    // the 'documents' filter — never a folder view or a cursor page (cursor
    // pagination stays file-keyed so page boundaries never shift).
    const includeDocuments =
      (filter === 'documents' || !filter || filter === 'all') && !folderId && !cursor;

    const [folders, files, totalCount, docCount, documents, quota] = await Promise.all([
      returnFolders && !cursor
        ? prisma.folder.findMany({
            where: folderWhere,
            orderBy: { [sortBy === 'size' ? 'name' : sortBy]: sortDir },
          })
        : Promise.resolve([]),
      returnFiles
        ? prisma.file.findMany({
            where: fileWhere,
            orderBy: [{ [sortBy]: sortDir }, { id: 'asc' }],
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          })
        : Promise.resolve([]),
      returnFiles ? prisma.file.count({ where: fileWhere }) : Promise.resolve(0),
      includeDocuments
        ? prisma.document.count({ where: { userId, isDeleted: false } })
        : Promise.resolve(0),
      includeDocuments
        ? prisma.document.findMany({
            where: { userId, isDeleted: false },
            orderBy: { updatedAt: 'desc' },
            take: limit + 1,
          })
        : Promise.resolve([]),
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

    // Merge the document projection with the file page in the requested sort
    // order so created documents interleave with files instead of dangling at
    // the end (or never appearing at all, as before this fix).
    const mergedItems = [
      ...items.map((file: FileRow) => fileDto(file, owner, decorations)),
      ...documents.map((doc: any) => documentDriveDto(doc, owner)),
    ];
    if (mergedItems.length > 1) {
      const dir = sortDir === 'asc' ? 1 : -1;
      mergedItems.sort((a: any, b: any) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name) * dir;
        if (sortBy === 'size') return (a.size - b.size) * dir;
        return (new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()) * dir;
      });
    }

    return reply.send({
      files: [
        ...folders.map((folder: FolderRow) => folderDto(folder, owner, decorations)),
        ...mergedItems,
      ],
      quota: { used: quota.usedBytes, total: quota.limitBytes },
      nextCursor,
      totalCount: totalCount + docCount,
      hasMore,
    });
  });
  fastify.get<{ Querystring: { q?: string } }>('/drive/search', async (request, reply) => {
    const userId = requireUserId(request);
    const q = (request.query.q || '').trim();
    if (!q) return reply.send({ files: [] });
    const owner = await ownerInfo(prisma, userId);
    // QM-UIUX-079 — search covers documents too (title AND content), so a
    // created document is findable the same way it is listable.
    const [folders, files, documents] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } },
        take: 50,
      }),
      prisma.file.findMany({
        where: { userId, isDeleted: false, name: { contains: q, mode: 'insensitive' } },
        take: 50,
      }),
      prisma.document.findMany({
        where: {
          userId,
          isDeleted: false,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
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
        ...documents.map((doc: any) => documentDriveDto(doc, owner)),
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
        const oldName = item.row.name as string;
        // QM-M39-008: only a real name change is an event — recording one when
        // the name is unchanged would be a fabricated entry.
        if (oldName !== name) {
          await prisma.file.update({ where: { id: item.row.id }, data: { name } });
          const actor = await ownerInfo(prisma, userId);
          await recordFileActivity(
            prisma,
            {
              fileId: item.row.id,
              ownerUserId: userId,
              actorUserId: userId,
              actorName: actor.name || null,
              actorEmail: actor.email || null,
              action: 'rename',
              details: { fromName: oldName, toName: name },
            },
            (msg) => request.log.warn(msg),
          );
        }
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
  // ============================================================================
  // NOTE (QM-M39-006): GET /drive/files/:id/links lives below with the
  // link-share management routes — one canonical implementation returning
  // real scope/audience (the earlier QM-M39-005 version hardcoded the
  // audience and is superseded).
  // ============================================================================
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

    // QM-M39-008: log the real share change (new invite vs permission update).
    await recordFileActivity(
      prisma,
      {
        fileId: file.id,
        ownerUserId: userId,
        actorUserId: userId,
        actorName: ownerDisplayName || null,
        actorEmail: ownerEmail || null,
        action: existing ? 'share_updated' : 'share_added',
        details: { email: recipient.email, permission: parsed.data.permission },
      },
      (msg) => request.log.warn(msg),
    );

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
      const recipient = await prisma.user.findUnique({
        where: { id: share.sharedWithUserId },
        select: { email: true, displayName: true },
      });
      await prisma.share.update({ where: { id: share.id }, data: { status: 'revoked' } });
      // QM-M39-008: log the real share revocation.
      const actor = await ownerInfo(prisma, userId);
      await recordFileActivity(
        prisma,
        {
          fileId: file.id,
          ownerUserId: userId,
          actorUserId: userId,
          actorName: actor.name || null,
          actorEmail: actor.email || null,
          action: 'share_revoked',
          details: { email: recipient?.email ?? null },
        },
        (msg) => request.log.warn(msg),
      );
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
          // QM-M39-009: shared-file rows carry scan state too.
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            updatedAt: true,
            scanStatus: true,
            scanReason: true,
          },
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
  // ==========================================================================
  // GET /drive/shares/sent — "Shared by me" (QM-M39-001, M39 screen 5).
  //
  // One record per file/folder the current user OWNS and has shared, grouped
  // from the underlying share rows. Each record carries the real recipient
  // list (name, email, permission, status, sharedAt), a real sharedCount, and
  // the active public-link state for the item (role / expiry / password gate).
  // Link tokens are never exposed. Revoked shares and deleted / unowned
  // targets are excluded — the view only ever shows what is really shared.
  // ==========================================================================
  fastify.get('/drive/shares/sent', async (request, reply) => {
    const userId = requireUserId(request);
    const shares = await prisma.share.findMany({
      where: { ownerUserId: userId, status: { not: 'revoked' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!shares.length) return reply.send({ items: [] });

    const recipientIds = [...new Set<string>(shares.map((s: any) => s.sharedWithUserId))];
    const recipients = recipientIds.length
      ? await prisma.user.findMany({
          where: { id: { in: recipientIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];
    const recipientMap = new Map<string, { name: string; email: string }>(
      recipients.map((u: any) => [
        u.id,
        { name: u.displayName || u.email.split('@')[0], email: u.email },
      ]),
    );

    const fileIds = [...new Set<string>(shares.map((s: any) => s.fileId).filter(Boolean))];
    const files = fileIds.length
      ? await prisma.file.findMany({
          where: { id: { in: fileIds }, userId, isDeleted: false },
          select: { id: true, name: true, mimeType: true, size: true, updatedAt: true },
        })
      : [];
    const fileMap = new Map(files.map((f: any) => [f.id, f]));

    const folderIds = [...new Set<string>(shares.map((s: any) => s.folderId).filter(Boolean))];
    const folders = folderIds.length
      ? await prisma.folder.findMany({
          where: { id: { in: folderIds }, userId, isDeleted: false },
          select: { id: true, name: true, path: true, updatedAt: true },
        })
      : [];
    const folderMap = new Map(folders.map((f: any) => [f.id, f]));

    // Active public-link state per owned file (latest link wins). The token is
    // never exposed — only what the owner needs to know: role, expiry, gate.
    const linkRows = fileIds.length
      ? await prisma.driveShare.findMany({
          where: { fileId: { in: fileIds }, createdById: userId },
          select: { fileId: true, role: true, password: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const linkMap = new Map<string, { role: string; requiresPassword: boolean; expiresAt: Date | null }>();
    for (const row of linkRows as any[]) {
      if (!linkMap.has(row.fileId)) {
        linkMap.set(row.fileId, {
          role: row.role,
          requiresPassword: Boolean(row.password),
          expiresAt: row.expiresAt,
        });
      }
    }

    type GroupedItem = {
      id: string;
      name: string;
      type: 'file' | 'folder';
      mimeType: string;
      size: number;
      updatedAt: Date;
      sharedWith: Array<{
        name: string;
        email: string;
        permission: 'view' | 'edit' | 'admin';
        status: string;
        sharedAt: Date;
      }>;
      linkShare: { role: string; requiresPassword: boolean; expiresAt: Date | null } | null;
    };
    const byItem = new Map<string, GroupedItem>();
    for (const share of shares as any[]) {
      const key = share.fileId ? `file:${share.fileId}` : share.folderId ? `folder:${share.folderId}` : null;
      if (!key) continue;
      const target = share.fileId ? fileMap.get(share.fileId) : folderMap.get(share.folderId);
      // A share whose target was deleted or is no longer owned by the caller
      // is not "shared by me" anymore — skip it instead of showing a ghost.
      if (!target) continue;
      let grouped = byItem.get(key);
      if (!grouped) {
        grouped = {
          id: target.id,
          name: target.name,
          type: share.fileId ? 'file' : 'folder',
          mimeType: share.fileId ? target.mimeType : '',
          size: share.fileId ? target.size : 0,
          updatedAt: target.updatedAt,
          sharedWith: [],
          linkShare: share.fileId ? (linkMap.get(share.fileId) ?? null) : null,
        };
        byItem.set(key, grouped);
      }
      const recipient = recipientMap.get(share.sharedWithUserId) ?? { name: 'Unknown', email: '' };
      grouped.sharedWith.push({
        name: recipient.name,
        email: recipient.email,
        permission: frontendPermission(share.permission),
        status: share.status,
        sharedAt: share.createdAt,
      });
    }

    return reply.send({
      items: [...byItem.values()].map((item) => ({
        ...item,
        sharedCount: item.sharedWith.length,
      })),
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
    // QM-M39-006: absolute date-picker expiry wins over the legacy day count.
    const expiresAt = parseLinkExpiry(parsed.data.expiresAt, parsed.data.expiresInDays);
    const scope = parsed.data.scope ?? 'anyone';
    const audienceIds = await resolveLinkAudience(prisma, scope, parsed.data.audienceEmails);

    // Store a one-way argon2 digest, never the plaintext. The download endpoint
    // verifies the supplied password against this hash; the column being set is
    // also what drives `requiresPassword` in the metadata response.
    const passwordHash = parsed.data.password ? await argon2.hash(parsed.data.password) : null;

    const share = await prisma.driveShare.create({
      data: {
        fileId: file.id,
        createdById: userId,
        token,
        role: parsed.data.role ?? 'viewer',
        password: passwordHash,
        expiresAt,
        scope,
        audience: audienceIds.length > 0 ? JSON.stringify(audienceIds) : null,
      },
    });

    const audienceEmails =
      scope === 'specific' && parsed.data.audienceEmails
        ? [...new Set(parsed.data.audienceEmails.map((e) => e.trim().toLowerCase()))]
        : [];
    return reply.status(201).send({
      success: true,
      share: {
        id: share.id,
        fileId: share.fileId,
        token: share.token,
        shareUrl: `/drive/share/${share.token}`,
        role: share.role,
        scope,
        audience: linkAudienceLabel(scope, audienceEmails, await userOrgNames(prisma, userId)),
        audienceEmails,
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
      // QM-M39-006: scope is enforced AFTER expiry, so an expired restricted
      // link still reports 410 (honest state), never a scope error.
      await enforceLinkScope(fastify, prisma, request, share);

      const file = await prisma.file.findFirst({
        where: { id: share.fileId, isDeleted: false },
      });
      if (!file) throw createAppError('File not found or has been deleted', 404, 'FILE_NOT_FOUND');

      const owner = await prisma.user.findUnique({
        where: { id: file.userId },
        select: { displayName: true, email: true },
      });

      const scope = (share.scope ?? 'anyone') as LinkScope;
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
          scope,
          requiresSignIn: scope !== 'anyone',
        },
      });
    },
  );

  fastify.get<{ Params: { token: string }; Querystring: { password?: string } }>(
    '/drive/public/share/:token/download',
    async (request, reply) => {
      const share = await prisma.driveShare.findUnique({
        where: { token: request.params.token },
      });
      if (!share) throw createAppError('Share link not found', 404, 'SHARE_NOT_FOUND');
      if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
        throw createAppError('This share link has expired', 410, 'LINK_EXPIRED');
      }
      // QM-M39-006: scope gate before the password gate — a viewer outside the
      // audience learns nothing about the password.
      await enforceLinkScope(fastify, prisma, request, share);

      // Enforce the password server-side before any bytes leave the box. The
      // metadata endpoint only advertises `requiresPassword`; the real gate is
      // here. Fail closed: a missing or wrong password never streams the file.
      // The secret is accepted from the `x-share-password` header (preferred,
      // kept out of URLs/logs) or a `password` query param as a fallback for
      // plain-navigation downloads.
      if (share.password) {
        const headerValue = request.headers['x-share-password'];
        const supplied =
          (typeof headerValue === 'string'
            ? headerValue
            : Array.isArray(headerValue)
              ? headerValue[0]
              : undefined) ?? request.query.password;
        if (!supplied) {
          throw createAppError(
            'This share link requires a password',
            401,
            'SHARE_PASSWORD_REQUIRED',
          );
        }
        const valid = await argon2.verify(share.password, supplied).catch(() => false);
        if (!valid) {
          throw createAppError('Incorrect share password', 403, 'SHARE_PASSWORD_INVALID');
        }
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

  // ==========================================================================
  // QM-M39-006: link-share management — list a file's links (honest state) and
  // update a link's scope/role/expiry/password. The dialog's confirmation step
  // lives client-side; these routes apply the change only after the user
  // confirms. Owner-only, like the rest of share management.
  // ==========================================================================
  const updateLinkSchema = z.object({
    role: z.enum(['viewer', 'editor']).optional(),
    scope: linkScopeSchema.optional(),
    audienceEmails: z.array(z.string().email().max(255)).max(50).optional(),
    // expiresAt: ISO datetime or YYYY-MM-DD (end of day UTC); null clears expiry.
    expiresAt: z.string().min(1).max(40).nullable().optional(),
    // password: null removes the password; undefined leaves it unchanged.
    password: z.string().max(100).nullable().optional(),
  });

  fastify.patch<{ Params: { id: string } }>('/drive/shares/link/:id', async (request, reply) => {
    const parsed = updateLinkSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const share = await prisma.driveShare.findUnique({ where: { id: request.params.id } });
    if (!share) throw createAppError('Share link not found', 404, 'SHARE_NOT_FOUND');
    if (share.createdById !== userId) throw createAppError('Forbidden', 403, 'FORBIDDEN');

    const nextScope = (parsed.data.scope ?? share.scope ?? 'anyone') as LinkScope;
    // Resolve the audience for the resulting scope. When the scope stays
    // 'specific' and no new emails are given, the existing audience is kept.
    let audienceIds: string[] | null = null;
    if (nextScope === 'specific') {
      if (parsed.data.audienceEmails) {
        audienceIds = await resolveLinkAudience(prisma, nextScope, parsed.data.audienceEmails);
      } else if (share.audience) {
        audienceIds = JSON.parse(share.audience) as string[];
      } else {
        throw createAppError(
          'Specific-people links need at least one person',
          400,
          'AUDIENCE_REQUIRED',
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.scope) data.scope = parsed.data.scope;
    if (audienceIds !== null) data.audience = JSON.stringify(audienceIds);
    if (nextScope !== 'specific' && parsed.data.scope) data.audience = null;
    if (parsed.data.expiresAt !== undefined)
      data.expiresAt = parsed.data.expiresAt === null ? null : parseLinkExpiry(parsed.data.expiresAt);
    if (parsed.data.password !== undefined)
      data.password = parsed.data.password === null ? null : await argon2.hash(parsed.data.password);

    const updated = await prisma.driveShare.update({ where: { id: share.id }, data });
    const finalScope = (updated.scope ?? 'anyone') as LinkScope;
    const audienceEmails =
      finalScope === 'specific' && updated.audience
        ? await emailsForUserIds(prisma, JSON.parse(updated.audience) as string[])
        : [];
    return reply.send({
      success: true,
      share: linkDto(updated, audienceEmails, await userOrgNames(prisma, userId)),
    });
  });

  fastify.get<{ Params: { id: string } }>('/drive/files/:id/links', async (request, reply) => {
    const userId = requireUserId(request);
    const file = await fileAccess(prisma, request.params.id, userId);
    if (file.userId !== userId)
      throw createAppError('Only the owner can manage sharing', 403, 'FORBIDDEN');
    const links = await prisma.driveShare.findMany({
      where: { fileId: file.id },
      orderBy: { createdAt: 'desc' },
    });
    const orgNames = await userOrgNames(prisma, userId);
    const dtos = await Promise.all(
      links.map(async (link: any) => {
        const scope = (link.scope ?? 'anyone') as LinkScope;
        const audienceEmails =
          scope === 'specific' && link.audience
            ? await emailsForUserIds(prisma, JSON.parse(link.audience) as string[])
            : [];
        return linkDto(link, audienceEmails, orgNames);
      }),
    );
    return reply.send({ links: dtos });
  });
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/versions', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request));
    const versions = await prisma.fileVersion.findMany({
      where: { fileId: file.id },
      orderBy: { versionNumber: 'desc' },
    });
    return reply.send({ versions: versions.map(versionDto) });
  });
  // ============================================================================
  // QM-M39-007: file details panel (M39 screen 24). One honest aggregation
  // endpoint behind the details panel: every field comes from the database,
  // nothing is invented. Deleted rows are never shown (same 404 contract as
  // fileAccess). Works for files and folders; people-share emails and link
  // metadata are owner-visible only — recipients get counts, not addresses.
  // ============================================================================
  fastify.get<{ Params: { id: string } }>('/drive/files/:id/details', async (request, reply) => {
    const userId = requireUserId(request);
    const id = request.params.id;

    // Resolve as a file (owner or accepted share recipient) or a folder
    // (owner or accepted folder-share recipient).
    let type: 'file' | 'folder';
    let row: any;
    let isOwner = false;
    const file = await prisma.file.findUnique({ where: { id } });
    if (file && !file.isDeleted) {
      if (file.userId === userId) {
        isOwner = true;
      } else {
        const share = await prisma.share.findFirst({
          where: { fileId: id, sharedWithUserId: userId, status: 'accepted' },
        });
        if (!share) throw createAppError('Not authorized to access this file', 403, 'FORBIDDEN');
      }
      type = 'file';
      row = file;
    } else {
      const folder = await prisma.folder.findFirst({ where: { id, isDeleted: false } });
      if (!folder) throw createAppError('Drive item not found', 404, 'NOT_FOUND');
      if (folder.userId === userId) {
        isOwner = true;
      } else {
        const share = await prisma.share.findFirst({
          where: { folderId: id, sharedWithUserId: userId, status: 'accepted' },
        });
        if (!share) throw createAppError('Not authorized to access this folder', 403, 'FORBIDDEN');
      }
      type = 'folder';
      row = folder;
    }

    const owner = await ownerInfo(prisma, row.userId);

    // Location breadcrumb: walk the folderId/parentId chain up to the root.
    // Bounded at 30 levels like folderTree; stale links are tolerated by
    // stopping the walk rather than 500ing.
    const location: { id: string; name: string }[] = [];
    let cursorId: string | null = type === 'file' ? row.folderId : row.parentId;
    const seen = new Set<string>();
    for (let depth = 0; depth < 30 && cursorId && !seen.has(cursorId); depth++) {
      seen.add(cursorId);
      const ancestor = await prisma.folder.findFirst({
        where: { id: cursorId, userId: row.userId, isDeleted: false },
        select: { id: true, name: true, parentId: true },
      });
      if (!ancestor) break;
      location.unshift({ id: ancestor.id, name: ancestor.name });
      cursorId = ancestor.parentId;
    }

    // Sharing summary. People shares = non-revoked rows targeting this item.
    // Email addresses are owner-visible only; everyone else gets the count.
    const shareWhere: Record<string, unknown> =
      type === 'file' ? { fileId: id } : { folderId: id };
    const peopleShares = await prisma.share.findMany({
      where: { ...shareWhere, status: { not: 'revoked' } },
      orderBy: { createdAt: 'desc' },
    });
    let people: { email: string; permission: string }[] | null = null;
    if (isOwner && peopleShares.length) {
      const recipients = await prisma.user.findMany({
        where: { id: { in: peopleShares.map((s: any) => s.sharedWithUserId) } },
        select: { id: true, email: true },
      });
      const emails = new Map(recipients.map((u: any) => [u.id, u.email]));
      people = peopleShares.map((s: any) => ({
        email: emails.get(s.sharedWithUserId) ?? '',
        permission: frontendPermission(s.permission),
      }));
    }
    // Active public links: created-by-anyone on this file, not expired.
    // (Link sharing is file-only in QM-M39-006.)
    const now = new Date();
    const linkShares =
      type === 'file'
        ? await prisma.driveShare.findMany({
            where: { fileId: id },
            orderBy: { createdAt: 'desc' },
          })
        : [];
    const activeLinks = linkShares.filter(
      (l: any) => !l.expiresAt || new Date(l.expiresAt).getTime() > now.getTime(),
    );
    const links = isOwner
      ? activeLinks.map((l: any) => ({
          role: l.role,
          expiresAt: l.expiresAt,
          createdAt: l.createdAt,
        }))
      : null;

    // Versions (files only). Count is real; the latest row carries context.
    let versions: { count: number; latest: { version: number; size: number; date: Date } | null } | null =
      null;
    if (type === 'file') {
      const [versionCount, latestVersion] = await Promise.all([
        prisma.fileVersion.count({ where: { fileId: id } }),
        prisma.fileVersion.findFirst({
          where: { fileId: id },
          orderBy: { versionNumber: 'desc' },
        }),
      ]);
      versions = {
        count: versionCount,
        latest: latestVersion
          ? {
              version: latestVersion.versionNumber,
              size: latestVersion.size,
              date: latestVersion.createdAt,
            }
          : null,
      };
    }

    return reply.send({
      id: row.id,
      name: row.name,
      type,
      mimeType: type === 'file' ? row.mimeType : 'application/vnd.quant.folder',
      size: type === 'file' ? row.size : 0,
      owner,
      isOwner,
      modifiedAt: row.updatedAt,
      createdAt: type === 'file' ? (row.createdAt ?? null) : null,
      lastOpenedAt: type === 'file' ? (row.lastOpenedAt ?? null) : null,
      location,
      sharing: {
        people,
        peopleCount: peopleShares.length,
        linkCount: activeLinks.length,
        links,
      },
      // QM-M39-009: scan state wired straight through the shared model —
      // 'unknown' is the honest state for unscanned files, never safe.
      scan:
        type === 'file'
          ? {
              status: normalizeScanStatus(row.scanStatus),
              reason: row.scanReason ?? null,
              scannedAt: row.scannedAt ?? null,
            }
          : null,
      versions,
    });
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
              // QM-M39-009: new content means the old scan verdict no longer
              // applies — back to the honest 'unknown' until a scanner runs.
              scanStatus: 'unknown',
              scanReason: null,
              scannedAt: null,
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
      const userId = requireUserId(request);
      const file = await fileAccess(prisma, request.params.id, userId, true);
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
      // QM-M39-008: log the real version restore.
      const actor = await ownerInfo(prisma, userId);
      await recordFileActivity(
        prisma,
        {
          fileId: file.id,
          ownerUserId: file.userId,
          actorUserId: userId,
          actorName: actor.name || null,
          actorEmail: actor.email || null,
          action: 'version_restored',
          details: { versionNumber: version.versionNumber },
        },
        (msg) => request.log.warn(msg),
      );
      return reply.send({ ok: true, restoredVersion: versionDto(version) });
    },
  );
  // ==========================================================================
  // GET /drive/files/:id/activity — per-file activity/history (QM-M39-008,
  // M39 screen 25).
  //
  // Returns the backend-written event log for this file, newest first. Events
  // exist only for actions that really happened after migration 0087
  // (upload, rename, move, share change, version restore) — nothing is
  // backfilled, so an empty list is an honest "no recorded activity" state.
  // A DB without the 0087 migration returns the same empty list, never a 500.
  // Authz matches download: the owner or an accepted share recipient.
  // ==========================================================================
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/drive/files/:id/activity',
    async (request, reply) => {
      const userId = requireUserId(request);
      const file = await fileAccess(prisma, request.params.id, userId);
      const parsedLimit = parseInt(request.query?.limit ?? '100', 10);
      const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 200);
      let rows: Array<{
        id: string;
        fileId: string;
        actorUserId: string;
        actorName: string | null;
        actorEmail: string | null;
        action: string;
        details: unknown;
        createdAt: Date | string;
      }>;
      try {
        rows = await prisma.$queryRawUnsafe(
          'SELECT "id","fileId","actorUserId","actorName","actorEmail","action","details","createdAt" ' +
            'FROM "drive_file_activity_events" WHERE "fileId" = $1 ' +
            'ORDER BY "createdAt" DESC, "id" DESC LIMIT $2',
          file.id,
          limit,
        );
      } catch (err) {
        // Missing 0087 migration (or a transient DB error): the honest answer
        // is "no recorded activity", never a 500.
        request.log.warn(
          `drive activity read failed for ${file.id}: ${err instanceof Error ? err.message : err}`,
        );
        return reply.send({ fileId: file.id, events: [] });
      }
      return reply.send({
        fileId: file.id,
        events: rows.map((row) => ({
          id: row.id,
          fileId: row.fileId,
          action: row.action,
          actor: {
            userId: row.actorUserId,
            name: row.actorName ?? null,
            email: row.actorEmail ?? null,
          },
          details:
            typeof row.details === 'string'
              ? safeParseJson(row.details)
              : (row.details ?? {}),
          createdAt:
            row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        })),
      });
    },
  );
  fastify.post<{ Body: { fileIds?: string[] } }>('/drive/files/trash', async (request, reply) => {
    const userId = requireUserId(request);
    const ids = [...new Set(request.body?.fileIds ?? [])];
    if (ids.length === 0) return reply.send({ ok: true });

    const now = new Date();

    // QM-UIUX-079 — document Drive ids (`doc:<id>`) soft-delete the Document
    // row. Previously the doc editor's delete flow sent its document id here
    // and it silently no-oped, so "deleted" documents lingered in listings.
    const docIds = ids.filter(isDocumentDriveId).map(documentIdFromDriveId);
    if (docIds.length > 0) {
      await prisma.document.updateMany({
        where: { id: { in: docIds }, userId, isDeleted: false },
        data: { isDeleted: true },
      });
    }

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
    // QM-UIUX-079 — trashed documents surface here too, so a document moved
    // to Trash is restorable instead of vanishing from every surface.
    const [files, folders, documents] = await Promise.all([
      prisma.file.findMany({ where: { userId, isDeleted: true }, orderBy: { deletedAt: 'desc' } }),
      prisma.folder.findMany({
        where: { userId, isDeleted: true },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.document.findMany({
        where: { userId, isDeleted: true },
        orderBy: { updatedAt: 'desc' },
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
        ...documents.map((doc: any) => documentDriveDto(doc, owner)),
      ],
    });
  });
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/restore', async (request, reply) => {
    const userId = requireUserId(request);
    const id = request.params.id;
    // QM-UIUX-079 — restore a trashed document projection.
    if (isDocumentDriveId(id)) {
      const docId = documentIdFromDriveId(id);
      const doc = await prisma.document.findFirst({
        where: { id: docId, userId, isDeleted: true },
      });
      if (!doc) throw createAppError('Trash item not found', 404, 'NOT_FOUND');
      await prisma.document.update({ where: { id: doc.id }, data: { isDeleted: false } });
      return reply.send({ ok: true });
    }
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
    // QM-UIUX-079 — permanently delete a trashed document projection.
    // Versions, collaborators and comments cascade per the prisma schema.
    if (isDocumentDriveId(id)) {
      const docId = documentIdFromDriveId(id);
      const doc = await prisma.document.findFirst({
        where: { id: docId, userId, isDeleted: true },
        select: { id: true },
      });
      if (!doc) throw createAppError('Trash item not found', 404, 'NOT_FOUND');
      await prisma.document.delete({ where: { id: doc.id } });
      return reply.send({ ok: true, purged: 1 });
    }
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
        // QM-M39-009: no scanner runs on upload yet — 'unknown' is honest.
        // Never default to 'clean'.
        scanStatus: 'unknown',
        scanReason: null,
        scannedAt: null,
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
    const owner = await ownerInfo(prisma, userId);
    // QM-M39-008: log the real upload event.
    await recordFileActivity(
      prisma,
      {
        fileId: file.id,
        ownerUserId: userId,
        actorUserId: userId,
        actorName: owner.name || null,
        actorEmail: owner.email || null,
        action: 'upload',
        details: { name: file.name, size: bytes.length },
      },
      (msg) => request.log.warn(msg),
    );
    return reply.status(201).send({
      file: fileDto({ ...file, folderId, encryptedContent: key }, owner),
      quota: { used: quota.usedBytes, total: quota.limitBytes },
    });
  });

  // ============================================================================
  // QM-M39-010 — mail attachment → Drive handoff (M39 screen 30).
  //
  // POST /drive/files/save-attachment { attachmentId, messageId? }
  //
  // Drive owns file objects: "Save to Drive" on a mail attachment creates one
  // canonical Drive File row. Dedupe is on the SHA-256 of the real bytes —
  // saving the same content again returns the existing file with
  // `deduplicated: true` instead of a second Drive row, and quota is not
  // charged twice (quota is aggregate-derived from drive_files rows).
  //
  // Only attachments the backend can actually read are savable: the bytes are
  // fetched server-side through AttachmentService (ownership re-checked), the
  // same heuristic scan that gates the attachment download path runs before
  // the bytes touch Drive storage, and the file lands through the same
  // encrypt → put → transaction pipeline as /drive/upload. Unknown
  // attachmentIds answer 404 — the UI only offers the button for resolvable
  // ids, so a button that 404s is a bug, not a flow.
  // ============================================================================
  fastify.post('/drive/files/save-attachment', async (request, reply) => {
    const parsed = z
      .object({
        attachmentId: z.string().min(1).max(128),
        messageId: z.string().min(1).max(128).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw createAppError('Invalid request', 400, 'VALIDATION_ERROR');
    const userId = requireUserId(request);
    const { attachmentId, messageId } = parsed.data;

    const attachmentService =
      options?.attachmentService ?? new AttachmentService({ db: prisma as never });
    const scanner = options?.attachmentScanner ?? new DefaultAttachmentScanner();

    // Real bytes, streamed out of R2/S3 with the ownership check server-side.
    const { metadata, body } = await attachmentService.readAttachment(attachmentId, userId);
    if (!body.length) throw createAppError('Attachment is empty', 400, 'VALIDATION_ERROR');

    // Same malware bar as the attachment download path: infected bytes never
    // become Drive files.
    const scanResult = await scanner.scanBuffer(body, metadata.filename);
    if (scanResult.isInfected) {
      throw createAppError(
        `Attachment blocked: malware detected (${scanResult.virusName || 'Infected'})`,
        422,
        'MALICIOUS_ATTACHMENT_DETECTED',
      );
    }

    const contentHash = createHash('sha256').update(body).digest('hex');
    const owner = await ownerInfo(prisma, userId);

    // Content-hash dedupe: an existing non-trashed file with identical bytes
    // is returned as-is — no second Drive row, no duplicate storage blob, no
    // fabricated "upload" activity event.
    const existing = await prisma.file.findFirst({
      where: { userId, contentHash, isDeleted: false },
    });
    if (existing) {
      return reply.status(200).send({
        file: fileDto(existing, owner),
        deduplicated: true,
        message: 'Already in Drive — no duplicate was created.',
      });
    }

    requireStorage();
    await quotaService.checkQuota(userId, body.length);
    const envelope = encryptForDrive(body);
    const file = await prisma.file.create({
      data: {
        userId,
        name: safeFileName(metadata.filename),
        mimeType: metadata.contentType || 'application/octet-stream',
        size: body.length,
        folderId: null,
        encryptedContent: '',
        encryptionIV: envelope.iv,
        encryptionAuthTag: envelope.authTag,
        encryptionKey: envelope.wrappedKey,
        contentHash: envelope.contentHash,
        // QM-M39-009: no scanner runs on Drive ingest yet — 'unknown' is the
        // honest state, never 'clean'.
        scanStatus: 'unknown',
        scanReason: null,
        scannedAt: null,
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
            size: body.length,
          },
        }),
      ]);
    } catch (error) {
      await deleteDriveObject(key).catch(() => undefined);
      await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined);
      throw error;
    }
    const quota = await quotaService.getQuota(userId);
    // QM-M39-008: log the real save event. `source: 'mail-attachment'` keeps
    // the handoff visible in file history alongside ordinary uploads.
    await recordFileActivity(
      prisma,
      {
        fileId: file.id,
        ownerUserId: userId,
        actorUserId: userId,
        actorName: owner.name || null,
        actorEmail: owner.email || null,
        action: 'upload',
        details: {
          name: file.name,
          size: body.length,
          source: 'mail-attachment',
          messageId: messageId ?? null,
          attachmentId,
        },
      },
      (msg) => request.log.warn(msg),
    );
    return reply.status(201).send({
      file: fileDto({ ...file, folderId: null, encryptedContent: key }, owner),
      deduplicated: false,
      message: 'Saved to Drive.',
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
      // QM-M39-008: log the real upload event for chunked uploads.
      await recordFileActivity(
        prisma,
        {
          fileId: result.file.id,
          ownerUserId: userId,
          actorUserId: userId,
          actorName: owner.name || null,
          actorEmail: owner.email || null,
          action: 'upload',
          details: { name: result.file.name ?? null, size: result.file.size ?? null },
        },
        (msg) => request.log.warn(msg),
      );
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

  // Task DR-1 to DR-5: Direct S3 5GB multipart presigned upload protocol
  fastify.post('/drive/upload/multipart/initiate', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = initiateMultipartSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    await quotaService.checkQuota(userId, parsed.data.totalSize);

    let folderId = parsed.data.folderId ?? null;
    if (
      folderId &&
      !(await prisma.folder.findFirst({ where: { id: folderId, userId, isDeleted: false } }))
    ) {
      folderId = null;
    }

    const partSize = parsed.data.partSize ?? 5 * 1024 * 1024;
    const totalParts = Math.ceil(parsed.data.totalSize / partSize);
    const storageKey = driveObjectKey(
      userId,
      `multipart/${randomUUID()}-${safeFileName(parsed.data.name)}`,
    );

    const storage = requireObjectStorage();
    const { uploadId } = await storage.createMultipartUpload(
      storageKey,
      parsed.data.mimeType || 'application/octet-stream',
    );

    await quotaService.reserveQuota(userId, parsed.data.totalSize, uploadId, 24 * 60 * 60 * 1000);

    return reply.status(201).send({
      uploadId,
      key: storageKey,
      partSize,
      totalParts,
      folderId,
    });
  });

  fastify.post<{ Params: { uploadId: string } }>(
    '/drive/upload/multipart/:uploadId/part-url',
    async (request, reply) => {
      requireUserId(request);
      const parsed = multipartPartUrlSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const storage = requireObjectStorage();
      const presignedUrl = await storage.getUploadPartPresignedUrl({
        key: parsed.data.key,
        uploadId: request.params.uploadId,
        partNumber: parsed.data.partNumber,
      });

      return reply.send({
        uploadId: request.params.uploadId,
        partNumber: parsed.data.partNumber,
        url: presignedUrl,
      });
    },
  );

  fastify.post<{ Params: { uploadId: string } }>(
    '/drive/upload/multipart/:uploadId/complete',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = completeMultipartSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const storage = requireObjectStorage();
      const completeRes = await storage.completeMultipartUpload({
        key: parsed.data.key,
        uploadId: request.params.uploadId,
        parts: parsed.data.parts,
      });

      let folderId = parsed.data.folderId ?? null;
      if (
        folderId &&
        !(await prisma.folder.findFirst({ where: { id: folderId, userId, isDeleted: false } }))
      ) {
        folderId = null;
      }

      const file = await prisma.file.create({
        data: {
          userId,
          name: safeFileName(parsed.data.name),
          mimeType: parsed.data.mimeType || 'application/octet-stream',
          size: parsed.data.totalSize,
          folderId,
          encryptedContent: completeRes.key,
          encryptionIV: '',
          encryptionAuthTag: '',
          encryptionKey: '',
          contentHash: completeRes.etag ?? '',
        },
      });

      await prisma.fileVersion.create({
        data: {
          fileId: file.id,
          versionNumber: 1,
          encryptedContent: completeRes.key,
          encryptionIV: '',
          encryptionAuthTag: '',
          encryptionKey: '',
          size: parsed.data.totalSize,
        },
      });

      quotaService.commitReservation(request.params.uploadId);
      const quota = await quotaService.getQuota(userId);
      const owner = await ownerInfo(prisma, userId);
      // QM-M39-008: log the real upload event for multipart uploads.
      await recordFileActivity(
        prisma,
        {
          fileId: file.id,
          ownerUserId: userId,
          actorUserId: userId,
          actorName: owner.name || null,
          actorEmail: owner.email || null,
          action: 'upload',
          details: { name: file.name, size: file.size },
        },
        (msg) => request.log.warn(msg),
      );

      return reply.status(201).send({
        file: fileDto(file, owner),
        quota: { used: quota.usedBytes, total: quota.limitBytes },
      });
    },
  );

  fastify.post<{ Params: { uploadId: string } }>(
    '/drive/upload/multipart/:uploadId/abort',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = abortMultipartSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const storage = requireObjectStorage();
      await storage.abortMultipartUpload({
        key: parsed.data.key,
        uploadId: request.params.uploadId,
      });

      quotaService.releaseReservation(request.params.uploadId);
      return reply.send({ ok: true });
    },
  );

  fastify.get<{ Params: { id: string } }>('/drive/files/:id/download', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request));
    // QM-M39-009: quarantined files must not leave quarantine. Block with an
    // instruction, not a generic error.
    if (isQuarantined(file.scanStatus)) {
      throw createAppError(quarantineBlockedMessage('download'), 403, 'FILE_QUARANTINED', {
        fileId: file.id,
        scanStatus: 'quarantined',
        scanReason: file.scanReason ?? null,
      });
    }
    // QM-M39-002: downloading (or previewing, which streams this endpoint) is an
    // explicit open — record it for the Recent view. Best-effort; a tracking
    // failure must never break the download itself.
    await recordFileOpened(prisma, file.id, (msg) => request.log.warn(msg));
    requireStorage();
    const plaintext = await checkedPlaintext(file);
    return reply
      .header('Content-Type', file.mimeType || 'application/octet-stream')
      .header('Content-Length', String(plaintext.length))
      .header('Content-Disposition', `attachment; filename="${safeFileName(file.name)}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(plaintext);
  });

  // ==========================================================================
  // POST /drive/files/:id/open — record an explicit file open (QM-M39-002,
  // M39 screen 6 "Recent").
  //
  // The frontend calls this when the user opens a file preview. Download and
  // preview streams also record the open server-side in the download route
  // above; this endpoint exists so the intent is explicit even when the bytes
  // never stream (e.g. a preview that renders from cached metadata).
  // Authorization is identical to download: owner or an accepted share
  // recipient. Never fabricates — it only stamps the real action.
  // ==========================================================================
  fastify.post<{ Params: { id: string } }>('/drive/files/:id/open', async (request, reply) => {
    const file = await fileAccess(prisma, request.params.id, requireUserId(request));
    await recordFileOpened(prisma, file.id, (msg) => request.log.warn(msg));
    const row = await prisma.file.findUnique({
      where: { id: file.id },
      select: { lastOpenedAt: true },
    });
    return reply.send({ ok: true, id: file.id, openedAt: row?.lastOpenedAt ?? null });
  });

  // ==========================================================================
  // GET /drive/recent — the Drive "Recent" view (QM-M39-002, M39 screen 6).
  //
  // Recency is computed SERVER-side as the latest real interaction with each
  // file: max(lastOpenedAt, updatedAt). Files never explicitly opened fall
  // back to updatedAt (their last modification). Trashed files are excluded.
  // Cursor pagination: pass ?cursor=<recencyEpochMs>:<id> from the previous
  // page's nextCursor. The client must NOT re-sort; order comes from the DB.
  // ==========================================================================
  const RECENT_RECENCY_EXPR = 'GREATEST(COALESCE("lastOpenedAt", "updatedAt"), "updatedAt")';
  const RECENT_COLUMNS = [
    '"id"',
    '"name"',
    '"mimeType"',
    '"size"',
    '"folderId"',
    '"isStarred"',
    '"isDeleted"',
    '"deletedAt"',
    '"trashRootId"',
    '"userId"',
    '"createdAt"',
    '"updatedAt"',
    '"lastOpenedAt"',
  ].join(', ');
  fastify.get<{
    Querystring: { cursor?: string; limit?: string | number };
  }>('/drive/recent', async (request, reply) => {
    const userId = requireUserId(request);
    const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
    const owner = await ownerInfo(prisma, userId);

    // Cursor is "<recency epoch ms>:<file id>" from the previous nextCursor.
    let cursorTs: Date | null = null;
    let cursorId: string | null = null;
    const rawCursor = (request.query.cursor || '').trim();
    if (rawCursor) {
      const sep = rawCursor.indexOf(':');
      if (sep > 0) {
        const epochMs = Number(rawCursor.slice(0, sep));
        if (Number.isFinite(epochMs) && epochMs > 0) {
          cursorTs = new Date(epochMs);
          cursorId = rawCursor.slice(sep + 1) || null;
        }
      }
    }

    const params: unknown[] = [userId];
    let cursorClause = '';
    if (cursorTs && cursorId) {
      params.push(cursorTs, cursorId);
      cursorClause = `AND (
        ${RECENT_RECENCY_EXPR} < $2::timestamptz
        OR (${RECENT_RECENCY_EXPR} = $2::timestamptz AND "id" > $3)
      )`;
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${RECENT_COLUMNS}, ${RECENT_RECENCY_EXPR} AS "recency"
       FROM "drive_files"
       WHERE "userId" = $1 AND "isDeleted" = false
       ${cursorClause}
       ORDER BY ${RECENT_RECENCY_EXPR} DESC, "id" ASC
       LIMIT ${limitParam}`,
      ...params,
    )) as Array<FileRow & { recency: Date }>;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? `${new Date(last.recency).getTime()}:${last.id}` : null;

    const totalCount = (await prisma.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS "count" FROM "drive_files" WHERE "userId" = $1 AND "isDeleted" = false',
      userId,
    )) as Array<{ count: number }>;

    // QM-UIUX-079 — documents join the Recent view too, merged by recency
    // (documents track no explicit open; recency is updatedAt). Cursor
    // pagination stays file-keyed: documents ride along on every page and
    // never shift the file cursor.
    const documents = cursorTs
      ? []
      : await prisma.document.findMany({
          where: { userId, isDeleted: false },
          orderBy: { updatedAt: 'desc' },
          take: limit + 1,
        });
    const decorations = await loadDecorations(
      prisma,
      items.map((file) => file.id),
      [],
    );
    const docItems = documents.map((doc: any) => documentDriveDto(doc, owner));
    const merged = [
      ...items.map((file) => fileDto(file, owner, decorations)),
      ...docItems,
    ].sort(
      (a: any, b: any) =>
        new Date(b.lastOpenedAt ?? b.modifiedAt).getTime() -
        new Date(a.lastOpenedAt ?? a.modifiedAt).getTime(),
    );

    return reply.send({
      files: merged,
      totalCount: (totalCount[0]?.count ?? items.length) + documents.length,
      nextCursor,
      hasMore,
    });
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

    // QM-M39-009: a quarantined file's content must not render anywhere —
    // not even as a thumbnail.
    if (isQuarantined(file.scanStatus)) {
      throw createAppError(quarantineBlockedMessage('preview'), 403, 'FILE_QUARANTINED', {
        fileId: file.id,
        scanStatus: 'quarantined',
        scanReason: file.scanReason ?? null,
      });
    }

    const mime = (file.mimeType || '').split(';', 1)[0].trim().toLowerCase();
    if (THUMBNAIL_IMAGE_MIME_TYPES.has(mime) && driveStorageReady() && file.encryptedContent) {
      try {
        const plaintext = await checkedPlaintext(file);
        let thumbnailBuffer = plaintext;
        try {
          // @ts-ignore
          const sharpModule: any = await import('sharp').catch(() => null);
          if (sharpModule) {
            const sharp = sharpModule.default || sharpModule;
            thumbnailBuffer = await sharp(plaintext)
              .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
              .toBuffer();
          }
        } catch {
          // Fall back to original buffer if sharp downscaling is unavailable
        }
        return reply
          .header('Content-Type', file.mimeType)
          .header('Cache-Control', 'private, max-age=86400')
          .header('X-Content-Type-Options', 'nosniff')
          .header('Content-Security-Policy', "default-src 'none'; sandbox")
          .header('Content-Length', String(thumbnailBuffer.length))
          .send(thumbnailBuffer);
      } catch {
        // Fall back to SVG thumbnail preview if storage retrieval fails
      }
    }

    const svg = generateThumbnailSvg(file.name, file.mimeType);
    return reply
      .header('Content-Type', 'image/svg+xml')
      .header('Cache-Control', 'private, max-age=86400')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
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
      // QM-M39-008: read the files first so the activity log records only the
      // files that genuinely moved (owned, not trashed), with real from/to
      // folder references. Files already in the target folder are no-ops and
      // are not logged as moves.
      const filesToMove = await prisma.file.findMany({
        where: { id: { in: fileIds }, userId, isDeleted: false },
        select: { id: true, folderId: true },
      });
      // Snapshot the source folders BEFORE the update: the rows above must not
      // be read after updateMany mutates them (ORM copy semantics differ).
      const moves: Array<{ fileId: string; fromFolderId: string | null }> = filesToMove.map(
        (f: { id: string; folderId: string | null }) => ({
          fileId: f.id,
          fromFolderId: f.folderId,
        }),
      );
      await prisma.file.updateMany({
        where: { id: { in: fileIds }, userId, isDeleted: false },
        data: { folderId: targetFolderId },
      });
      const folderIdsForNames = [
        ...new Set(moves.flatMap((m) => [m.fromFolderId, targetFolderId])),
      ].filter((id): id is string => typeof id === 'string' && id.length > 0);
      const nameByFolderId = new Map<string, string>();
      if (folderIdsForNames.length) {
        const folders = await prisma.folder.findMany({
          where: { id: { in: folderIdsForNames }, userId },
          select: { id: true, name: true },
        });
        for (const folder of folders) nameByFolderId.set(folder.id, folder.name);
      }
      const actor = await ownerInfo(prisma, userId);
      for (const move of moves) {
        if (move.fromFolderId === targetFolderId) continue;
        await recordFileActivity(
          prisma,
          {
            fileId: move.fileId,
            ownerUserId: userId,
            actorUserId: userId,
            actorName: actor.name || null,
            actorEmail: actor.email || null,
            action: 'move',
            details: {
              fromFolderId: move.fromFolderId,
              toFolderId: targetFolderId,
              fromFolderName: move.fromFolderId
                ? (nameByFolderId.get(move.fromFolderId) ?? null)
                : null,
              toFolderName: targetFolderId ? (nameByFolderId.get(targetFolderId) ?? null) : null,
            },
          },
          (msg) => fastify.log.warn(msg),
        );
      }
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
      // QM-M39-009: copying is another path for quarantined bytes to leave
      // quarantine — block it with the same instruction as download.
      if (isQuarantined(source.scanStatus)) {
        throw createAppError(quarantineBlockedMessage('copy'), 403, 'FILE_QUARANTINED', {
          fileId: source.id,
          scanStatus: 'quarantined',
          scanReason: source.scanReason ?? null,
        });
      }
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
          // QM-M39-009: a copy carries the same bytes — inherit the source's
          // scan state so a quarantined file can never be laundered into a
          // clean-looking copy (quarantined copies are blocked above).
          scanStatus: normalizeScanStatus(source.scanStatus),
          scanReason: source.scanReason ?? null,
          scannedAt: source.scannedAt ?? null,
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
        const metadata = row.metadata;
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
          confidenceScore: memoryConfidence(metadata),
          sensitivity: metaString(metadata, 'sensitivity', 'sensitivityClass'),
          explicitness: metaString(metadata, 'explicitness'),
          policyVersion: metaString(metadata, 'policyVersion'),
          provenance: metaString(metadata, 'provenanceSummary', 'provenance'),
          sourceObjectId: metaString(metadata, 'sourceObjectId', 'sourceId'),
          extractedFacts: metaStringArray(metadata, 'extractedFacts', 'facts', 'keyFacts'),
          entityGraphLinks: metaStringArray(metadata, 'entityGraphLinks', 'graphLinks', 'relatedEntities'),
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
