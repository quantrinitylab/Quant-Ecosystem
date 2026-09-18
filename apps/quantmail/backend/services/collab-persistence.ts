import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';
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

/** Prisma-backed Yjs persistence: append-only delta log + snapshot compaction. */
export class PersistenceAdapter {
  constructor(private readonly db: CollabPrismaClient = defaultPrisma) {}

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
   * Full durable state = snapshot (or legacy plaintext) + every un-compacted delta.
   *
   * G-A-BUG-1 fix: the legacy-plaintext branch used to exist only in loadDoc(), so
   * yjs-server opened pre-existing docs empty and the next compaction overwrote the
   * real body. Legacy bodies are now upgraded in place on first load.
   */
  async loadUpdate(docId: string): Promise<Uint8Array | null> {
    const row = await this.db.document.findUnique({
      where: { id: docId },
      select: { content: true, isDeleted: true },
    });
    if (!row || row.isDeleted) {
      throw createAppError('Collaborative document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const parts: Uint8Array[] = [];
    let legacyUpgrade = false;

    const snapshot = decodeUpdate(row.content);
    if (snapshot) {
      parts.push(snapshot);
    } else if (typeof row.content === 'string' && row.content.length > 0) {
      parts.push(legacyTextToUpdate(row.content));
      legacyUpgrade = true;
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

  private async writeSnapshot(docId: string, update: Uint8Array): Promise<void> {
    try {
      await this.db.document.update({
        where: { id: docId },
        data: { content: encodeUpdate(update) },
        select: { id: true },
      });
    } catch {
      throw createAppError('Collaborative document not found', 404, 'DOCUMENT_NOT_FOUND');
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

    await this.writeSnapshot(docId, merged);

    if (deltas.length > 0) {
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

export const collabPersistence = new PersistenceAdapter();
