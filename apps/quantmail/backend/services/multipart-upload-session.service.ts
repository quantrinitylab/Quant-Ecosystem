// ============================================================================
// QuantMail Drive — Durable S3 multipart upload sessions + background digest
//
// CODEX DO NOT MERGE (PR #1558, delta 6389879918) corrective: the original
// multipart-complete handler trusted client-supplied uploadId/key/totalSize,
// kept quota reservations in a process-local Map (lost on restart, invisible
// to other replicas), downloaded + hashed the whole completed object inside
// the completion request, and left a permanent empty contentHash when that
// hash failed. This module replaces all of that:
//
// - A DURABLE session record (Prisma `MultipartUploadSession`, migration
//   0107) is created at initiate time from SERVER-side values. Every later
//   step (part-url, complete, abort) loads that record and checks
//   session.userId === caller, session.storageKey === client key, expiry,
//   and status before touching S3. A caller can no longer complete, abort,
//   or mint part URLs for another user's uploadId, and a restart/replica
//   loses nothing: ownership is decided by the database row, never by
//   process-local state.
// - Length reconciliation is SERVER-side: completion HeadObjects the
//   finished object and compares its real byte count against the session's
//   recorded totalSize. The client-sent totalSize is ignored at completion.
// - Completion is transactional/idempotent: the session is atomically
//   claimed (UPDATE ... WHERE status='pending') before S3 Complete is
//   called, so two concurrent/replayed completions cannot create two files.
//   A replay after success returns the SAME file row via session.fileId.
//   An S3 failure releases the claim back to 'pending' for a safe retry.
// - The SHA-256 digest is a BACKGROUND task, not part of the completion
//   response: the file row is created with an empty contentHash (skipped by
//   findDuplicates, so no false grouping) and the session carries an
//   explicit digest state — 'pending' | 'ready' | 'failed'. The digest
//   streams the object (never buffered whole), verifies the streamed byte
//   count against the session size, and only then writes the real digest
//   onto both the file row and the session. A failure marks 'failed' —
//   never a permanent silent empty hash: `resumePendingMultipartDigests`
//   re-runs pending digests (bounded) so a restart does not strand them.
//
// Fail-closed: when the Prisma delegate for the session table is absent
// (migration 0107 not yet applied), every operation throws a 503 instead
// of falling back to trust-the-client behaviour.
// ============================================================================
import { createHash } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export type MultipartSessionStatus =
  | 'pending'
  | 'completing'
  | 'completed'
  | 'aborted'
  | 'failed'
  | 'expired';

export type MultipartDigestStatus = 'pending' | 'hashing' | 'ready' | 'failed';

export interface MultipartUploadSessionRow {
  id: string;
  uploadId: string;
  userId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  totalSize: number;
  folderId: string | null;
  status: MultipartSessionStatus;
  hashStatus: MultipartDigestStatus;
  contentHash: string | null;
  fileId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MultipartSessionDelegate {
  create(args: { data: Record<string, unknown> }): Promise<MultipartUploadSessionRow>;
  findUnique(args: {
    where: { uploadId: string };
  }): Promise<MultipartUploadSessionRow | null>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<MultipartUploadSessionRow>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: Record<string, unknown>;
    take?: number;
    orderBy?: Record<string, unknown>;
  }): Promise<MultipartUploadSessionRow[]>;
}

export interface MultipartSessionPrismaClient {
  multipartUploadSession?: MultipartSessionDelegate;
  file?: {
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
    findUnique(args: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null>;
  };
}

export interface ObjectStorageDigestPort {
  download(key: string): Promise<{
    body: AsyncIterable<unknown>;
    contentLength: number;
  }>;
}

function requireDelegate(
  prisma: MultipartSessionPrismaClient,
): MultipartSessionDelegate {
  const delegate = prisma.multipartUploadSession;
  if (!delegate) {
    throw createAppError(
      'Multipart upload sessions are unavailable — migration 0107 has not been applied',
      503,
      'SESSION_STORE_UNAVAILABLE',
    );
  }
  return delegate;
}

/** Create the durable session record at initiate time (server-side values only). */
export async function createMultipartSession(
  prisma: MultipartSessionPrismaClient,
  input: {
    uploadId: string;
    userId: string;
    storageKey: string;
    name: string;
    mimeType: string;
    totalSize: number;
    folderId: string | null;
    ttlMs: number;
  },
): Promise<MultipartUploadSessionRow> {
  const delegate = requireDelegate(prisma);
  return delegate.create({
    data: {
      uploadId: input.uploadId,
      userId: input.userId,
      storageKey: input.storageKey,
      name: input.name,
      mimeType: input.mimeType,
      totalSize: input.totalSize,
      folderId: input.folderId,
      status: 'pending',
      hashStatus: 'pending',
      contentHash: null,
      fileId: null,
      expiresAt: new Date(Date.now() + input.ttlMs),
    },
  });
}

/**
 * Load a session and enforce ownership + key binding + expiry + status.
 * This is the single gate every multipart step (part-url, complete, abort)
 * must pass before touching S3. Throws 404 (unknown), 403 (not the owner,
 * or the client key does not match the server-issued session key), or 410
 * (expired — the session is marked expired and the caller must re-initiate).
 */
export async function loadOwnedMultipartSession(
  prisma: MultipartSessionPrismaClient,
  userId: string,
  uploadId: string,
  clientKey: string,
  allowedStatuses: MultipartSessionStatus[] = ['pending'],
): Promise<MultipartUploadSessionRow> {
  const delegate = requireDelegate(prisma);
  const session = await delegate.findUnique({ where: { uploadId } });
  if (!session) {
    throw createAppError('Multipart upload session not found', 404, 'SESSION_NOT_FOUND');
  }
  if (session.userId !== userId) {
    throw createAppError(
      'Multipart upload session belongs to another user',
      403,
      'FORBIDDEN',
    );
  }
  if (session.storageKey !== clientKey) {
    throw createAppError(
      'Multipart upload key does not match the initiated session',
      403,
      'FORBIDDEN',
    );
  }
  if (session.expiresAt.getTime() <= Date.now() && session.status === 'pending') {
    await delegate
      .update({ where: { id: session.id }, data: { status: 'expired' } })
      .catch(() => undefined);
    throw createAppError('Multipart upload session has expired', 410, 'SESSION_EXPIRED');
  }
  if (!allowedStatuses.includes(session.status)) {
    throw createAppError(
      `Multipart upload session is ${session.status}`,
      409,
      'SESSION_NOT_PENDING',
    );
  }
  return session;
}

/**
 * Atomically claim a pending session for completion. Returns true when this
 * caller won the claim; false when another completion already claimed it
 * (the caller must re-read the session and follow the idempotent path).
 * A single conditional UPDATE is the transaction boundary — no process-local
 * lock is involved, so concurrent completions on different replicas are safe.
 */
export async function claimMultipartSessionForCompletion(
  prisma: MultipartSessionPrismaClient,
  session: MultipartUploadSessionRow,
): Promise<boolean> {
  const delegate = requireDelegate(prisma);
  const result = await delegate.updateMany({
    where: { id: session.id, status: 'pending' },
    data: { status: 'completing' },
  });
  return result.count === 1;
}

/** Release a 'completing' claim back to 'pending' so a failed S3 complete can be retried. */
export async function releaseMultipartCompletionClaim(
  prisma: MultipartSessionPrismaClient,
  session: MultipartUploadSessionRow,
): Promise<void> {
  const delegate = requireDelegate(prisma);
  await delegate
    .updateMany({
      where: { id: session.id, status: 'completing' },
      data: { status: 'pending' },
    })
    .catch(() => undefined);
}

/** Mark a session terminal (completed/aborted/failed/expired) and record its file, if any. */
export async function markMultipartSession(
  prisma: MultipartSessionPrismaClient,
  session: MultipartUploadSessionRow,
  status: MultipartSessionStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const delegate = requireDelegate(prisma);
  await delegate.update({ where: { id: session.id }, data: { status, ...extra } });
}

/**
 * Durable quota input: bytes held by OTHER pending multipart sessions of
 * this user, read from the database (restart/replica-safe). The caller adds
 * this to the process-local reservation total before enforcing the limit —
 * neither source alone is sufficient.
 */
export async function getPendingMultipartReservedBytes(
  prisma: MultipartSessionPrismaClient,
  userId: string,
  excludeUploadId?: string,
): Promise<number> {
  const delegate = requireDelegate(prisma);
  const sessions = await delegate.findMany({
    where: { userId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });
  return sessions
    .filter((s) => s.uploadId !== excludeUploadId)
    .reduce((sum, s) => sum + s.totalSize, 0);
}

/**
 * Background digest task. Streams the completed object through SHA-256
 * (never buffered whole), verifies the streamed byte count against the
 * session's server-recorded size, and only then writes the digest onto the
 * file row and marks the session hashStatus 'ready'. On ANY failure the
 * session is marked hashStatus 'failed' and the file keeps its empty
 * contentHash (skipped by findDuplicates) — a wrong or partial digest is
 * never stored, and the failure is visible in the session row for retry
 * instead of silently permanent.
 *
 * Idempotent: a session already 'ready' is a no-op. The digest is claimed
 * atomically (UPDATE ... WHERE hashStatus IN ('pending','failed')) so two
 * concurrent digest workers — e.g. the post-complete background task and
 * the resume sweeper — cannot double-download the object; the claim loser
 * returns { skipped: true } without touching storage.
 */
export async function digestMultipartFile(
  prisma: MultipartSessionPrismaClient,
  storage: ObjectStorageDigestPort,
  session: MultipartUploadSessionRow,
): Promise<{ contentHash: string; bytesHashed: number; skipped?: boolean }> {
  if (!session.fileId) {
    throw createAppError('Multipart session has no completed file to digest', 400, 'NO_FILE');
  }
  if (session.hashStatus === 'ready') {
    return { contentHash: session.contentHash ?? '', bytesHashed: session.totalSize };
  }
  const delegate = requireDelegate(prisma);
  const claimed = await delegate.updateMany({
    where: { id: session.id, hashStatus: { in: ['pending', 'failed'] } },
    data: { hashStatus: 'hashing' },
  });
  if (claimed.count !== 1) {
    return { contentHash: session.contentHash ?? '', bytesHashed: 0, skipped: true };
  }
  try {
    const { body } = await storage.download(session.storageKey);
    const hash = createHash('sha256');
    let bytesHashed = 0;
    for await (const chunk of body as AsyncIterable<Buffer>) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as never);
      bytesHashed += buf.length;
      hash.update(buf);
    }
    if (bytesHashed !== session.totalSize) {
      throw new Error(
        `Digest byte-count mismatch: hashed ${bytesHashed} bytes, session size is ${session.totalSize}`,
      );
    }
    const contentHash = hash.digest('hex');
    if (prisma.file) {
      await prisma.file.update({
        where: { id: session.fileId },
        data: { contentHash },
      });
    }
    await delegate.update({
      where: { id: session.id },
      data: { hashStatus: 'ready', contentHash },
    });
    return { contentHash, bytesHashed };
  } catch (error) {
    await delegate
      .update({
        where: { id: session.id },
        data: { hashStatus: 'failed' },
      })
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Restart-recovery sweeper: re-runs the digest for pending-digest sessions
 * that already have a file row (i.e. completions whose background digest
 * died with a restart/replica loss). Bounded so one trigger cannot fan out
 * over an unbounded backlog; returns how many sessions were processed.
 * Callers fire-and-forget this — it must never fail a user request.
 */
export async function resumePendingMultipartDigests(
  prisma: MultipartSessionPrismaClient,
  storage: ObjectStorageDigestPort,
  limit = 5,
): Promise<{ processed: number; ready: number; failed: number }> {
  const delegate = requireDelegate(prisma);
  const sessions = await delegate.findMany({
    where: { status: 'completed', hashStatus: 'pending' },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
  let ready = 0;
  let failed = 0;
  for (const session of sessions) {
    if (!session.fileId) continue;
    try {
      const result = await digestMultipartFile(prisma, storage, session);
      if (!result.skipped) ready += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed: sessions.length, ready, failed };
}
