// ============================================================================
// AI Memory - Prisma-backed durable store (ai_memory_entries)
//
// Implements the async MemoryStorePort against Postgres via a NARROW
// structural Prisma client (same hexagonal pattern as @quant/ai's
// PrismaMemoryStore): this package never imports @quant/database or
// @prisma/client, so it typechecks without the generated client.
//
// Namespacing: every row is scoped by (appId, userId). appId is fixed at
// construction (server-side, e.g. 'quantai') — never taken from user input —
// so one table safely serves every app.
//
// Durability: every mutating method awaits the DB write before resolving.
// A resolved write survives process restart; a new store instance over the
// same database sees all previously committed rows.
// ============================================================================

import type { MemoryAccess, MemoryCategory, MemoryEntry } from './types';
import type {
  CreateMemoryInput,
  MemoryStorePort,
  UpdateMemoryInput,
} from './store-port';

/** A row of the ai_memory_entries table. */
export interface AiMemoryEntryRow {
  id: string;
  appId: string;
  userId: string;
  category: string;
  content: string;
  source: string;
  sourceApp: string;
  explanation: string;
  accessScopes: string[];
  tags: string[];
  writeSignal: string;
  status: string;
  expiresAt: Date | null;
  accessLog: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** The Prisma delegate methods PrismaAIMemoryStore uses. */
export interface AiMemoryEntryDelegate {
  create(args: { data: Omit<AiMemoryEntryRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } }): Promise<AiMemoryEntryRow>;
  findUnique(args: { where: { id: string } }): Promise<AiMemoryEntryRow | null>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<AiMemoryEntryRow[]>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<AiMemoryEntryRow>;
  delete(args: { where: { id: string } }): Promise<AiMemoryEntryRow>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

/** The narrow client surface (a real PrismaClient structurally satisfies this). */
export interface AiMemoryPrismaClient {
  aiMemoryEntry: AiMemoryEntryDelegate;
}

export interface PrismaAIMemoryStoreOptions {
  client: AiMemoryPrismaClient;
  /** Owning app namespace (server-side). Defaults to 'quantai'. */
  appId?: string;
  /** Cap for access-log entries per memory (mirrors AIMemoryStore default). */
  maxAccessLogEntries?: number;
}

export class PrismaAIMemoryStore implements MemoryStorePort {
  private readonly client: AiMemoryPrismaClient;
  private readonly appId: string;
  private readonly maxAccessLogEntries: number;

  constructor(opts: PrismaAIMemoryStoreOptions) {
    this.client = opts.client;
    this.appId = opts.appId ?? 'quantai';
    this.maxAccessLogEntries = opts.maxAccessLogEntries ?? 100;
  }

  private scope(userId: string): Record<string, unknown> {
    return { appId: this.appId, userId };
  }

  async create(entry: CreateMemoryInput): Promise<MemoryEntry> {
    if (entry.writeSignal !== 'explicit') {
      throw new Error('writeSignal must be "explicit" for direct memory creation (anti-creep)');
    }
    const row = await this.client.aiMemoryEntry.create({
      data: {
        appId: this.appId,
        userId: entry.userId,
        category: entry.category,
        content: entry.content,
        source: entry.source,
        sourceApp: entry.sourceApp,
        explanation: entry.explanation,
        accessScopes: entry.accessScopes,
        tags: entry.tags,
        writeSignal: entry.writeSignal,
        status: entry.status,
        expiresAt: entry.expiresAt != null ? new Date(entry.expiresAt) : null,
        accessLog: [],
      },
    });
    return toMemoryEntry(row);
  }

  async createCandidate(
    entry: Omit<CreateMemoryInput, 'writeSignal' | 'status'>,
  ): Promise<MemoryEntry> {
    const row = await this.client.aiMemoryEntry.create({
      data: {
        appId: this.appId,
        userId: entry.userId,
        category: entry.category,
        content: entry.content,
        source: entry.source,
        sourceApp: entry.sourceApp,
        explanation: entry.explanation,
        accessScopes: entry.accessScopes,
        tags: entry.tags,
        writeSignal: 'pending-review',
        status: 'pending',
        expiresAt: entry.expiresAt != null ? new Date(entry.expiresAt) : null,
        accessLog: [],
      },
    });
    return toMemoryEntry(row);
  }

  async approveCandidate(id: string): Promise<MemoryEntry | undefined> {
    const existing = await this.get(id);
    if (!existing || existing.status !== 'pending') return undefined;
    const row = await this.client.aiMemoryEntry.update({
      where: { id },
      data: { writeSignal: 'digest-approved', status: 'active' },
    });
    return toMemoryEntry(row);
  }

  async rejectCandidate(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing || existing.status !== 'pending') return false;
    return this.delete(id);
  }

  async getPendingCandidates(userId: string): Promise<MemoryEntry[]> {
    const rows = await this.client.aiMemoryEntry.findMany({
      where: { ...this.scope(userId), status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toMemoryEntry);
  }

  async purgeByTag(userId: string, tag: string): Promise<number> {
    const res = await this.client.aiMemoryEntry.deleteMany({
      where: { ...this.scope(userId), tags: { has: tag } },
    });
    return res.count;
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    const row = await this.client.aiMemoryEntry.findUnique({ where: { id } });
    if (!row || row.appId !== this.appId) return undefined;
    return toMemoryEntry(row);
  }

  async update(id: string, updates: UpdateMemoryInput): Promise<MemoryEntry | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;
    const data: Record<string, unknown> = {};
    if (updates.content !== undefined) data['content'] = updates.content;
    if (updates.category !== undefined) data['category'] = updates.category;
    if (updates.tags !== undefined) data['tags'] = updates.tags;
    if (updates.explanation !== undefined) data['explanation'] = updates.explanation;
    const row = await this.client.aiMemoryEntry.update({ where: { id }, data });
    return toMemoryEntry(row);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.client.aiMemoryEntry.delete({ where: { id } });
    return true;
  }

  async searchByCategory(userId: string, category: MemoryCategory): Promise<MemoryEntry[]> {
    const memories = await this.getUserMemories(userId);
    return memories.filter((m) => m.category === category);
  }

  async searchByContent(userId: string, query: string): Promise<MemoryEntry[]> {
    const normalizedQuery = query.toLowerCase();
    const memories = await this.getUserMemories(userId);
    return memories.filter(
      (m) =>
        m.content.toLowerCase().includes(normalizedQuery) ||
        m.explanation.toLowerCase().includes(normalizedQuery),
    );
  }

  async logAccess(id: string, access: MemoryAccess): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    const log = [...existing.accessLog, access].slice(-this.maxAccessLogEntries);
    await this.client.aiMemoryEntry.update({ where: { id }, data: { accessLog: log } });
    return true;
  }

  async getUserMemories(userId: string): Promise<MemoryEntry[]> {
    const rows = await this.client.aiMemoryEntry.findMany({
      where: { ...this.scope(userId), status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    return rows
      .map(toMemoryEntry)
      .filter((m) => m.expiresAt == null || m.expiresAt > now);
  }

  async deleteUserMemories(userId: string): Promise<number> {
    const res = await this.client.aiMemoryEntry.deleteMany({ where: this.scope(userId) });
    return res.count;
  }

  async getAccessLog(id: string): Promise<MemoryAccess[]> {
    const entry = await this.get(id);
    return entry ? [...entry.accessLog] : [];
  }
}

// ─── Row → domain mapping ────────────────────────────────────────────────────

function toMemoryEntry(row: AiMemoryEntryRow): MemoryEntry {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category as MemoryCategory,
    content: row.content,
    source: row.source,
    sourceApp: row.sourceApp,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    ...(row.expiresAt ? { expiresAt: row.expiresAt.getTime() } : {}),
    accessLog: Array.isArray(row.accessLog) ? (row.accessLog as MemoryAccess[]) : [],
    explanation: row.explanation,
    accessScopes: [...row.accessScopes],
    writeSignal: row.writeSignal as MemoryEntry['writeSignal'],
    status: row.status as MemoryEntry['status'],
    tags: [...row.tags],
  };
}
