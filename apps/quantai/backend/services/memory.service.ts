// ============================================================================
// QuantAI - Memory Service
// Wraps @quant/ai-memory store and exporter for backend API use
// ============================================================================

import {
  AIMemoryStore,
  MemoryExporter,
  type MemoryEntry,
  type MemoryCategory,
  type ExportFormat,
  type MemoryAccess,
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
  private store: AIMemoryStore;
  private exporter: MemoryExporter;

  constructor() {
    this.store = new AIMemoryStore();
    this.exporter = new MemoryExporter(this.store);
  }

  listMemories(userId: string, filters?: MemoryFilters): MemoryEntry[] {
    let results = this.store.getUserMemories(userId);

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

  createMemory(userId: string, data: CreateMemoryData): MemoryEntry {
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

  getMemory(id: string): MemoryEntry | undefined {
    return this.store.get(id);
  }

  updateMemory(id: string, data: UpdateMemoryData): MemoryEntry | undefined {
    return this.store.update(id, data);
  }

  deleteMemory(id: string): boolean {
    return this.store.delete(id);
  }

  purgeByTag(userId: string, tag: string): number {
    return this.store.purgeByTag(userId, tag);
  }

  createCandidate(userId: string, data: Omit<CreateMemoryData, 'writeSignal'>): MemoryEntry {
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

  getPendingCandidates(userId: string): MemoryEntry[] {
    return this.store.getPendingCandidates(userId);
  }

  approveCandidate(id: string): MemoryEntry | undefined {
    return this.store.approveCandidate(id);
  }

  rejectCandidate(id: string): boolean {
    return this.store.rejectCandidate(id);
  }

  exportMemories(userId: string, format: ExportFormat): string {
    return this.exporter.export(userId, format);
  }

  importMemories(userId: string, json: string): MemoryEntry[] {
    return this.exporter.importFromJson(json, userId);
  }

  getFullDisclosure(userId: string): FullDisclosure {
    const memories = this.store.getUserMemories(userId);
    const accessLogs = memories.map((m) => ({
      memoryId: m.id,
      content: m.content,
      logs: this.store.getAccessLog(m.id),
    }));

    return { memories, accessLogs };
  }
}
