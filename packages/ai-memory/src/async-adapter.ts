// ============================================================================
// AI Memory - Async adapter over the sync in-memory AIMemoryStore
//
// Lets MemoryService depend on ONE port (MemoryStorePort) regardless of
// backend: production injects PrismaAIMemoryStore; tests and zero-DB
// environments inject this adapter over the process-local AIMemoryStore.
// The adapter adds no durability — it is honest about being ephemeral.
// ============================================================================

import { AIMemoryStore } from './memory-store';
import type {
  CreateMemoryInput,
  MemoryStorePort,
  UpdateMemoryInput,
} from './store-port';
import type { MemoryAccess, MemoryCategory, MemoryEntry } from './types';

export class AsyncAIMemoryStoreAdapter implements MemoryStorePort {
  constructor(private readonly inner: AIMemoryStore = new AIMemoryStore()) {}

  async create(entry: CreateMemoryInput): Promise<MemoryEntry> {
    return this.inner.create(entry);
  }

  async createCandidate(
    entry: Omit<CreateMemoryInput, 'writeSignal' | 'status'>,
  ): Promise<MemoryEntry> {
    return this.inner.createCandidate(entry);
  }

  async approveCandidate(id: string): Promise<MemoryEntry | undefined> {
    return this.inner.approveCandidate(id);
  }

  async rejectCandidate(id: string): Promise<boolean> {
    return this.inner.rejectCandidate(id);
  }

  async getPendingCandidates(userId: string): Promise<MemoryEntry[]> {
    return this.inner.getPendingCandidates(userId);
  }

  async purgeByTag(userId: string, tag: string): Promise<number> {
    return this.inner.purgeByTag(userId, tag);
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    return this.inner.get(id);
  }

  async update(id: string, updates: UpdateMemoryInput): Promise<MemoryEntry | undefined> {
    return this.inner.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    return this.inner.delete(id);
  }

  async searchByCategory(userId: string, category: MemoryCategory): Promise<MemoryEntry[]> {
    return this.inner.searchByCategory(userId, category);
  }

  async searchByContent(userId: string, query: string): Promise<MemoryEntry[]> {
    return this.inner.searchByContent(userId, query);
  }

  async logAccess(id: string, access: MemoryAccess): Promise<boolean> {
    return this.inner.logAccess(id, access);
  }

  async getUserMemories(userId: string): Promise<MemoryEntry[]> {
    return this.inner.getUserMemories(userId);
  }

  async deleteUserMemories(userId: string): Promise<number> {
    return this.inner.deleteUserMemories(userId);
  }

  async getAccessLog(id: string): Promise<MemoryAccess[]> {
    return this.inner.getAccessLog(id);
  }
}
