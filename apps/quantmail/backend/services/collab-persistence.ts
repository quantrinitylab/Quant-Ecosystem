import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';
import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import * as Y from 'yjs';

const YJS_STATE_PREFIX = 'yjs:v1:';
const MAX_VERSION_RETRIES = 5;
/** Fixed clientID for legacy plaintext seeding so two pods produce byte-identical
 *  updates. Without this, concurrent legacy upgrades duplicate the text on merge. */
const LEGACY_SEED_CLIENT_ID = 1;

export interface CollabUpdateDelegate {
  findFirst(args: any): Promise<any>;
  findMany(args: any): Promise<any>;
  create(args: any): Promise<any>;
  deleteMany(args: any): Promise<any>;
}

export interface CollabPrismaClient {
  document: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
    create?(args: any): Promise<any>;
  };
  documentVersion?: {
    findMany(args: any): Promise<any>;
    create(args: any): Promise<any>;
  };
  collabDocumentUpdate?: CollabUpdateDelegate;
}

export interface DocumentVersion {
  id: string;
  docId: string;
  name: string;
  createdAt: Date;
}

export interface CompactionResult {
  snapshotBytes: number;
  prunedUpdates: number;
}

export interface CollabStorageClient {
  upload(
    key: string,
    body: Buffer | any,
    contentType: string,
  ): Promise<{ key: string; etag: string }>;
  download(key: string): Promise<{ body: any; contentType?: string; contentLength?: number }>;
  getObjectSize?(key: string): Promise<number | null>;
  headObject?(key: string): Promise<{ contentLength: number }>;
}

export function extractPlainText(update: Uint8Array): string {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    const text = doc.getText('content');
    const textStr = text ? text.toString() : '';
    if (textStr.trim().length > 0) return textStr;

    const parts: string[] = [];
    for (const [, val] of doc.share.entries()) {
      if (val instanceof Y.Text) {
        const s = val.toString();
        if (s.trim()) parts.push(s);
      }
    }
    return parts.join('\n');
  } catch {
    return '';
  } finally {
    doc.destroy();
  }
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  if (stream && (typeof stream.read === 'function' || Symbol.asyncIterator in Object(stream))) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.alloc(0);
}

function encodeUpdate(update: Uint8Array): string {
  return `${YJS_STATE_PREFIX}${Buffer.from(update).toString('base64')}`;
}

function decodeUpdate(content: unknown): Uint8Array | null {
  if (typeof content !== 'string' || !content.startsWith(YJS_STATE_PREFIX)) return null;
  return new Uint8Array(Buffer.from(content.slice(YJS_STATE_PREFIX.length), 'base64'));
}

function toUpdate(source: Y.Doc | Uint8Array): Uint8Array {
  return source instanceof Uint8Array ? source : Y.encodeStateAsUpdate(source);
}

/** Prisma 6 returns `Bytes` as Uint8Array; older clients returned Buffer. Accept both. */
function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw createAppError('Corrupt collaboration update payload', 500, 'INTERNAL_ERROR');
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/** Deterministic Y update representing a legacy plaintext document body. */
function legacyTextToUpdate(content: string): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = LEGACY_SEED_CLIENT_ID;
  doc.getText('content').insert(0, content);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

export interface PersistenceAdapterOptions {
  storage?: CollabStorageClient;
  allowInlineFallback?: boolean;
}

/** Prisma-backed Yjs persistence: append-only delta log + snapshot compaction. */
export class PersistenceAdapter {
  private readonly storage?: CollabStorageClient;
  private readonly allowInlineFallback: boolean;

  constructor(
    private readonly db: CollabPrismaClient = defaultPrisma,
    options?: PersistenceAdapterOptions | CollabStorageClient,
  ) {
    if (options && typeof (options as CollabStorageClient).download === 'function') {
      this.storage = options as CollabStorageClient;
      this.allowInlineFallback = false;
    } else if (options && typeof options === 'object' && 'storage' in options) {
      this.storage = (options as PersistenceAdapterOptions).storage;
      this.allowInlineFallback = Boolean(
        (options as PersistenceAdapterOptions).allowInlineFallback,
      );
    } else if (options && typeof options === 'object' && 'allowInlineFallback' in options) {
      this.storage = (options as PersistenceAdapterOptions).storage;
      this.allowInlineFallback = Boolean(
        (options as PersistenceAdapterOptions).allowInlineFallback,
      );
    } else {
      this.allowInlineFallback = false;
      this.storage = new StorageClient(resolveStorageConfigFromEnv());
    }
  }

  /**
   * No optional chaining on the delegate. A missing Prisma model must fail loudly,
   * not silently degrade to "no durable updates" (see finding W15-3).
   */
  private updates(): CollabUpdateDelegate {
    const delegate = this.db.collabDocumentUpdate;
    if (!delegate || typeof delegate.create !== 'function') {
      throw createAppError(
        'collab_document_updates is not available; run prisma migrate + prisma generate',
        503,
        'COLLAB_PERSISTENCE_UNAVAILABLE',
      );
    }
    return delegate;
  }

  /** Durably append one CRDT delta. Returns the allocated version. */
  async appendUpdate(docId: string, update: Uint8Array): Promise<number> {
    if (update.byteLength === 0) return 0;
    const delegate = this.updates();

    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt += 1) {
      const latest = await delegate.findFirst({
        where: { docId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      try {
        await delegate.create({
          data: {
            id: `cdu_${crypto.randomUUID()}`,
            docId,
            version,
            updateBinary: Buffer.from(update),
          },
          select: { id: true },
        });
        return version;
      } catch (error) {
        // Concurrent writer took this version. Yjs updates commute, so re-reading
        // and taking the next slot is always safe; ordering is bookkeeping only.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw createAppError(
      'Could not allocate a collaboration update version',
      503,
      'COLLAB_PERSISTENCE_CONTENTION',
    );
  }

  /**
   * Full durable state = snapshot (from R2/S3 or inline) + every un-compacted delta.
   *
   * G-A-BUG-1 fix: the legacy-plaintext branch used to exist only in loadDoc(), so
   * yjs-server opened pre-existing docs empty and the next compaction overwrote the
   * real body. Legacy bodies are now upgraded in place on first load.
   */
  async loadUpdate(docId: string): Promise<Uint8Array | null> {
    const row = await this.db.document.findUnique({
      where: { id: docId },
      select: { content: true, isDeleted: true, snapshotStorageKey: true },
    });
    if (!row || row.isDeleted) {
      throw createAppError('Collaborative document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const parts: Uint8Array[] = [];
    let legacyUpgrade = false;
    let loadedFromStorage = false;

    if (row.snapshotStorageKey && this.storage) {
      try {
        const downloaded = await this.storage.download(row.snapshotStorageKey);
        const buf = await streamToBuffer(downloaded.body);
        if (buf.byteLength > 0) {
          parts.push(new Uint8Array(buf));
          loadedFromStorage = true;
        }
      } catch (storageErr) {
        // A failed snapshot download is recoverable — the delta log is replayed
        // instead — but it must stay visible, because silent fallback to replay
        // is how a broken storage key turns into unexplained load. Same
        // convention as the other backend services here.
        // eslint-disable-next-line no-console
        console.warn(
          `[CollabPersistence] Failed to download snapshot ${row.snapshotStorageKey} for doc ${docId}, falling back to replay`,
          storageErr,
        );
      }
    }

    if (!loadedFromStorage) {
      const snapshot = decodeUpdate(row.content);
      if (snapshot) {
        parts.push(snapshot);
      } else if (
        typeof row.content === 'string' &&
        row.content.length > 0 &&
        !row.snapshotStorageKey
      ) {
        parts.push(legacyTextToUpdate(row.content));
        legacyUpgrade = true;
      }
    }

    const deltas = await this.updates().findMany({
      where: { docId },
      orderBy: { version: 'asc' },
      select: { updateBinary: true },
    });
    for (const delta of deltas) parts.push(toBytes(delta.updateBinary));

    if (parts.length === 0) return null;
    const merged = parts.length === 1 ? parts[0]! : Y.mergeUpdates(parts);

    if (legacyUpgrade) {
      // Convert the row to yjs:v1 immediately so a second pod cannot re-seed it.
      await this.writeSnapshot(docId, merged);
    }
    return merged;
  }

  async loadDoc(docId: string): Promise<Y.Doc> {
    const update = await this.loadUpdate(docId);
    const doc = new Y.Doc();
    if (update) Y.applyUpdate(doc, update, 'prisma-load');
    return doc;
  }

  /** Legacy entry point retained for callers that only want a snapshot write. */
  async saveDoc(docId: string, source: Y.Doc | Uint8Array): Promise<void> {
    await this.writeSnapshot(docId, toUpdate(source));
  }

  private async writeSnapshot(
    docId: string,
    update: Uint8Array,
  ): Promise<{ snapshotStorageKey?: string }> {
    try {
      if (this.storage) {
        const snapshotKey = `documents/${docId}/snapshots/${Date.now()}.yjs`;
        const buf = Buffer.from(update);
        await this.storage.upload(snapshotKey, buf, 'application/octet-stream');

        let verified = false;
        if (typeof this.storage.getObjectSize === 'function') {
          const size = await this.storage.getObjectSize(snapshotKey);
          verified = typeof size === 'number' && size > 0;
        } else if (typeof this.storage.headObject === 'function') {
          const head = await this.storage.headObject(snapshotKey);
          verified = Boolean(head && head.contentLength > 0);
        } else {
          verified = true;
        }

        if (verified) {
          const plainText = extractPlainText(update);
          await this.db.document.update({
            where: { id: docId },
            data: {
              content: plainText,
              snapshotStorageKey: snapshotKey,
            },
            select: { id: true },
          });
          return { snapshotStorageKey: snapshotKey };
        } else {
          throw new Error(`Failed to verify snapshot landing in storage: ${snapshotKey}`);
        }
      }

      if (this.allowInlineFallback) {
        await this.db.document.update({
          where: { id: docId },
          data: { content: encodeUpdate(update) },
          select: { id: true },
        });
        return {};
      }

      throw createAppError(
        'Storage client required for collaborative document snapshots; refusing silent base64 fallback',
        503,
        'STORAGE_UNAVAILABLE',
      );
    } catch (err: any) {
      if (err?.code === 'DOCUMENT_NOT_FOUND' || err?.statusCode === 404) throw err;
      throw createAppError(
        err?.message || 'Collaborative document snapshot could not be persisted',
        err?.statusCode || 500,
        err?.code || 'INTERNAL_ERROR',
      );
    }
  }

  /**
   * Squash deltas into the snapshot.
   *
   * Order is load -> merge -> write -> delete-by-id, never write -> delete-by-range.
   * Deltas are re-read and merged before pruning so a delta appended by ANOTHER pod
   * cannot be deleted without first being folded into the snapshot. Because
   * Y.mergeUpdates is idempotent, a crash between write and delete is harmless:
   * the surviving deltas simply re-apply on the next load.
   */
  async compact(docId: string, source: Y.Doc | Uint8Array): Promise<CompactionResult> {
    const delegate = this.updates();
    const deltas = await delegate.findMany({
      where: { docId },
      orderBy: { version: 'asc' },
      select: { id: true, updateBinary: true },
    });

    const parts: Uint8Array[] = [toUpdate(source)];
    for (const delta of deltas) parts.push(toBytes(delta.updateBinary));
    const merged = parts.length === 1 ? parts[0]! : Y.mergeUpdates(parts);

    let writeSuccess = false;
    try {
      await this.writeSnapshot(docId, merged);
      writeSuccess = true;
    } catch (err) {
      // Refusing to prune after a failed snapshot write is the safe branch: the
      // deltas are the only remaining copy of the document. Surfacing it matters
      // precisely because the request still succeeds.
      // eslint-disable-next-line no-console
      console.warn(
        `[CollabPersistence] Failed to write snapshot for doc ${docId}, refusing delta pruning`,
        err,
      );
      return { snapshotBytes: merged.byteLength, prunedUpdates: 0 };
    }

    if (writeSuccess && deltas.length > 0) {
      await delegate.deleteMany({
        where: { id: { in: deltas.map((delta: { id: string }) => delta.id) } },
      });
    }

    return { snapshotBytes: merged.byteLength, prunedUpdates: deltas.length };
  }

  async countPendingUpdates(docId: string): Promise<number> {
    const rows = await this.updates().findMany({ where: { docId }, select: { id: true } });
    return rows.length;
  }

  async listVersions(docId: string): Promise<DocumentVersion[]> {
    const versions = await this.db.documentVersion!.findMany({
      where: { docId, title: { not: { startsWith: '__branch__:' } } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docId: true, title: true, createdAt: true },
    });
    return versions.map(({ title, ...version }: any) => ({ ...version, name: title }));
  }

  async createCheckpoint(
    docId: string,
    name: string,
    source: Y.Doc | Uint8Array,
  ): Promise<DocumentVersion> {
    const version = await this.db.documentVersion!.create({
      data: { docId, title: name, content: encodeUpdate(toUpdate(source)) },
      select: { id: true, docId: true, title: true, createdAt: true },
    });
    const { title, ...rest } = version;
    return { ...rest, name: title };
  }
}

/**
 * Process-wide adapter, constructed on first use rather than at import.
 *
 * This used to be `export const collabPersistence = new PersistenceAdapter()`.
 * The constructor resolves object-storage config from the environment and throws
 * when it is absent — correct, because silently writing snapshots nowhere would
 * lose documents. But as a module-scope `const` that throw happened at *import*
 * time, and importing this file transitively boots the whole QuantMail backend.
 * The result: with no R2/S3 credentials configured the server died before it
 * listened, so a missing document-storage secret took down login, the inbox and
 * sending — none of which touch Yjs persistence.
 *
 * Deferring construction keeps the fail-closed contract exactly as strict, and
 * scopes it to the feature that actually needs storage: collaborative documents
 * fail loudly, and the rest of the mail product keeps serving.
 */
let adapter: PersistenceAdapter | undefined;

export function getCollabPersistence(): PersistenceAdapter {
  adapter ??= new PersistenceAdapter();
  return adapter;
}

/** Exposed for tests, which need a fresh adapter per case. */
export function __resetCollabPersistence(): void {
  adapter = undefined;
}
