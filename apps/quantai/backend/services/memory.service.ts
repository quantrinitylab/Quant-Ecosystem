// ============================================================================
// QuantAI - Memory Service
// Wraps @quant/ai-memory store and exporter for backend API use.
//
// The store is injected as the async MemoryStorePort: production passes
// PrismaAIMemoryStore (durable Postgres); tests / zero-DB environments pass
// AsyncAIMemoryStoreAdapter over the in-memory AIMemoryStore. All methods are
// async — a resolved write means it is DURABLE (no silent data loss).
// ============================================================================

import {
  AIMemoryStore,
  AsyncAIMemoryStoreAdapter,
  MemoryExporter,
  type MemoryEntry,
  type MemoryCategory,
  type ExportFormat,
  type MemoryAccess,
  type MemoryStorePort,
} from '@quant/ai-memory';

export interface MemoryFilters {
  category?: MemoryCategory;
  search?: string;
  tag?: string;
}

export interface CreateMemoryData {
  category: MemoryCategory;
  content: string;
  source: string;
  sourceApp: string;
  explanation: string;
  writeSignal: 'explicit' | 'digest-approved' | 'pending-review';
  accessScopes: string[];
  tags: string[];
  expiresAt?: number;
}

export interface UpdateMemoryData {
  content?: string;
  category?: MemoryCategory;
  tags?: string[];
  explanation?: string;
}

export interface FullDisclosure {
  memories: MemoryEntry[];
  accessLogs: Array<{ memoryId: string; content: string; logs: MemoryAccess[] }>;
}

export class MemoryService {
  private store: MemoryStorePort;
  private exporter: MemoryExporter;

  constructor(store?: MemoryStorePort) {
    this.store = store ?? new AsyncAIMemoryStoreAdapter(new AIMemoryStore());
    this.exporter = new MemoryExporter(this.store);
  }

  async listMemories(userId: string, filters?: MemoryFilters): Promise<MemoryEntry[]> {
    let results = await this.store.getUserMemories(userId);

    if (filters?.category) {
      results = results.filter((m) => m.category === filters.category);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (m) => m.content.toLowerCase().includes(q) || m.explanation.toLowerCase().includes(q),
      );
    }
    if (filters?.tag) {
      results = results.filter((m) => m.tags.includes(filters.tag!));
    }

    return results;
  }

  async createMemory(userId: string, data: CreateMemoryData): Promise<MemoryEntry> {
    return this.store.create({
      userId,
      category: data.category,
      content: data.content,
      source: data.source,
      sourceApp: data.sourceApp,
      explanation: data.explanation,
      writeSignal: data.writeSignal,
      accessScopes: data.accessScopes,
      tags: data.tags,
      expiresAt: data.expiresAt,
      status: 'active',
    });
  }

  async getMemory(id: string): Promise<MemoryEntry | undefined> {
    return this.store.get(id);
  }

  async updateMemory(id: string, data: UpdateMemoryData): Promise<MemoryEntry | undefined> {
    return this.store.update(id, data);
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async purgeByTag(userId: string, tag: string): Promise<number> {
    return this.store.purgeByTag(userId, tag);
  }

  async createCandidate(
    userId: string,
    data: Omit<CreateMemoryData, 'writeSignal'>,
  ): Promise<MemoryEntry> {
    return this.store.createCandidate({
      userId,
      category: data.category,
      content: data.content,
      source: data.source,
      sourceApp: data.sourceApp,
      explanation: data.explanation,
      accessScopes: data.accessScopes,
      tags: data.tags,
      expiresAt: data.expiresAt,
    });
  }

  async getPendingCandidates(userId: string): Promise<MemoryEntry[]> {
    return this.store.getPendingCandidates(userId);
  }

  async approveCandidate(id: string): Promise<MemoryEntry | undefined> {
    return this.store.approveCandidate(id);
  }

  async rejectCandidate(id: string): Promise<boolean> {
    return this.store.rejectCandidate(id);
  }

  async exportMemories(userId: string, format: ExportFormat): Promise<string> {
    return this.exporter.export(userId, format);
  }

  async importMemories(userId: string, json: string): Promise<MemoryEntry[]> {
    return this.exporter.importFromJson(json, userId);
  }

  async getFullDisclosure(userId: string): Promise<FullDisclosure> {
    const memories = await this.store.getUserMemories(userId);
    const accessLogs = await Promise.all(
      memories.map(async (m) => ({
        memoryId: m.id,
        content: m.content,
        logs: await this.store.getAccessLog(m.id),
      })),
    );

    return { memories, accessLogs };
  }
}
