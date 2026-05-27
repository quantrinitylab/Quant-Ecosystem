// ============================================================================
// AI Memory Store - CRUD operations for user-owned memory
// ============================================================================

import type { MemoryEntry, MemoryCategory, MemoryAccess } from './types';

export class AIMemoryStore {
  private memories: Map<string, MemoryEntry> = new Map();
  private counter = 0;

  create(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessLog'>): MemoryEntry {
    const id = `mem_${Date.now()}_${++this.counter}`;
    const now = Date.now();
    const full: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
      accessLog: [],
    };
    this.memories.set(id, full);
    return full;
  }

  get(id: string): MemoryEntry | undefined {
    return this.memories.get(id);
  }

  update(
    id: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'explanation' | 'expiresAt'>>,
  ): MemoryEntry | undefined {
    const existing = this.memories.get(id);
    if (!existing) return undefined;

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };
    this.memories.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.memories.delete(id);
  }

  searchByCategory(userId: string, category: MemoryCategory): MemoryEntry[] {
    return this.getUserMemories(userId).filter((m) => m.category === category);
  }

  searchByContent(userId: string, query: string): MemoryEntry[] {
    const normalizedQuery = query.toLowerCase();
    return this.getUserMemories(userId).filter(
      (m) =>
        m.content.toLowerCase().includes(normalizedQuery) ||
        m.explanation.toLowerCase().includes(normalizedQuery),
    );
  }

  logAccess(id: string, access: MemoryAccess): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;

    entry.accessLog.push(access);
    this.memories.set(id, entry);
    return true;
  }

  getUserMemories(userId: string): MemoryEntry[] {
    const now = Date.now();
    return Array.from(this.memories.values()).filter(
      (m) => m.userId === userId && (m.expiresAt == null || m.expiresAt > now),
    );
  }

  deleteUserMemories(userId: string): number {
    let count = 0;
    for (const [id, entry] of this.memories) {
      if (entry.userId === userId) {
        this.memories.delete(id);
        count++;
      }
    }
    return count;
  }

  getAccessLog(id: string): MemoryAccess[] {
    const entry = this.memories.get(id);
    if (!entry) return [];
    return [...entry.accessLog];
  }
}
