// ============================================================================
// AI Core — PrismaMemoryStore (PR-M04B)
//
// The first durable MemoryStore backend. Implements the FROZEN MemoryStore port
// (ADR-005) against the memory_records table designed in ADR-006.
//
// Hexagonal boundary: this file does NOT import @quant/database or @prisma/client.
// It depends on a NARROW structural client interface (MemoryPrismaClient) that the
// real Prisma client satisfies at the composition root. That keeps @quant/ai free
// of a database dependency and lets it typecheck without the generated client.
//
// Port → schema mapping (the port stays frozen; ownerType is a persistence concern):
//   owner        → ownerId
//   (default)    → ownerType = 'user'
//   metadata.tenantId (if string) → tenantId
//   port `id`    ↔ DB `logicalId`  (DB `id` is an internal surrogate)
//
// Writes are immutable-append: store() inserts version=1. Logical updates
// (version+1) await a future MemoryStore.update() capability (deferred, ADR-005).
// ============================================================================

import type { MemoryStore, MemoryRecord } from './memory-port';
import { asKind, asLevel } from './memory-port';

// ─── Narrow structural client (the real Prisma client satisfies this) ────────

/** A row of the memory_records table. */
export interface MemoryRecordRow {
  id: string;
  logicalId: string;
  version: number;
  ownerType: string;
  ownerId: string | null;
  tenantId: string | null;
  kind: string;
  level: string;
  content: string;
  pinned: boolean;
  metadata: unknown;
  expiresAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The subset of fields PrismaMemoryStore writes (DB defaults fill the rest). */
export interface MemoryRecordCreateData {
  ownerType: string;
  ownerId: string | null;
  tenantId: string | null;
  kind: string;
  level: string;
  content: string;
  pinned: boolean;
  metadata: unknown;
  expiresAt: Date | null;
}

/** The Prisma delegate methods PrismaMemoryStore uses. */
export interface MemoryRecordDelegate {
  create(args: { data: MemoryRecordCreateData }): Promise<MemoryRecordRow>;
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<MemoryRecordRow | null>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

/** The narrow client surface (a real PrismaClient structurally satisfies this). */
export interface MemoryPrismaClient {
  memoryRecord: MemoryRecordDelegate;
}

export interface PrismaMemoryStoreOptions {
  client: MemoryPrismaClient;
  /** Default owner type for records written through the frozen port. */
  defaultOwnerType?: string;
}

// ─── Archive capability (separate delegate — keeps MemoryStore surface frozen) ─

export interface MemoryRecordUpdateDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: { archivedAt: Date };
  }): Promise<{ count: number }>;
}

export interface MemoryArchiverPrismaClient {
  memoryRecord: MemoryRecordUpdateDelegate;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class PrismaMemoryStore implements MemoryStore {
  private readonly client: MemoryPrismaClient;
  private readonly defaultOwnerType: string;

  constructor(opts: PrismaMemoryStoreOptions) {
    this.client = opts.client;
    this.defaultOwnerType = opts.defaultOwnerType ?? 'user';
  }

  async store(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>): Promise<MemoryRecord> {
    const tenantId =
      typeof record.metadata?.['tenantId'] === 'string'
        ? (record.metadata['tenantId'] as string)
        : null;

    const row = await this.client.memoryRecord.create({
      data: {
        ownerType: this.defaultOwnerType,
        ownerId: record.owner,
        tenantId,
        kind: record.kind as unknown as string,
        level: record.level as unknown as string,
        content: record.content,
        pinned: record.pinned,
        metadata: record.metadata,
        expiresAt: record.expiresAt !== null ? new Date(record.expiresAt) : null,
      },
    });
    return toMemoryRecord(row);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    // Resolve the latest, non-deleted version for this logical id.
    const row = await this.client.memoryRecord.findFirst({
      where: { logicalId: id, deletedAt: null },
      orderBy: { version: 'desc' },
    });
    return row ? toMemoryRecord(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    // Hard-delete every version of the logical record (embeddings cascade).
    const res = await this.client.memoryRecord.deleteMany({ where: { logicalId: id } });
    return res.count > 0;
  }
}

// ─── PrismaMemoryArchiver (soft archive: set archivedAt) ─────────────────────

/**
 * Soft-archive implementation: marks every live version of a logical record as
 * archived (archivedAt = now). Archived rows are excluded from recall by the
 * retrievers but retained for audit/rollback. Realizes the MemoryArchiver port.
 */
export class PrismaMemoryArchiver {
  private readonly client: MemoryArchiverPrismaClient;

  constructor(client: MemoryArchiverPrismaClient) {
    this.client = client;
  }

  async archive(id: string, _reason: string): Promise<boolean> {
    const res = await this.client.memoryRecord.updateMany({
      where: { logicalId: id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return res.count > 0;
  }
}

// ─── Row → port mapping ───────────────────────────────────────────────────────

function toMemoryRecord(row: MemoryRecordRow): MemoryRecord {
  return {
    id: row.logicalId, // port id ↔ DB logicalId
    content: row.content,
    kind: asKind(row.kind),
    level: asLevel(row.level),
    owner: row.ownerId,
    createdAt: row.createdAt.getTime(),
    version: row.version,
    pinned: row.pinned,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
