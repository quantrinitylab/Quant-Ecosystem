// ============================================================================
// AI Memory Store - CRUD operations for user-owned memory
// ============================================================================

import type { MemoryEntry, MemoryCategory, MemoryAccess } from './types';

export interface AIMemoryStoreOptions {
  maxEntries?: number;
  maxAccessLogEntries?: number;
}

export class AIMemoryStore {
  private memories: Map<string, MemoryEntry> = new Map();
  private counter = 0;
  private readonly maxEntries: number;
  private readonly maxAccessLogEntries: number;
  private insertionOrder: string[] = [];

  constructor(options?: AIMemoryStoreOptions) {
    this.maxEntries = options?.maxEntries ?? 10000;
    this.maxAccessLogEntries = options?.maxAccessLogEntries ?? 100;
  }

  create(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessLog'>): MemoryEntry {
    if (entry.writeSignal !== 'explicit') {
      throw new Error('writeSignal must be "explicit" for direct memory creation (anti-creep)');
    }

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
    this.insertionOrder.push(id);
    this.evictIfNeeded();
    return full;
  }

  createCandidate(
    entry: Omit<
      MemoryEntry,
      'id' | 'createdAt' | 'updatedAt' | 'accessLog' | 'writeSignal' | 'status'
    >,
  ): MemoryEntry {
    const id = `mem_${Date.now()}_${++this.counter}`;
    const now = Date.now();
    const full: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
      accessLog: [],
      writeSignal: 'pending-review',
      status: 'pending',
    };
    this.memories.set(id, full);
    this.insertionOrder.push(id);
    this.evictIfNeeded();
    return full;
  }

  approveCandidate(id: string): MemoryEntry | undefined {
    const entry = this.memories.get(id);
    if (!entry || entry.status !== 'pending') return undefined;

    const updated: MemoryEntry = {
      ...entry,
      status: 'active',
      writeSignal: 'digest-approved',
      updatedAt: Date.now(),
    };
    this.memories.set(id, updated);
    return updated;
  }

  rejectCandidate(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry || entry.status !== 'pending') return false;
    return this.delete(id);
  }

  getPendingCandidates(userId: string): MemoryEntry[] {
    return Array.from(this.memories.values()).filter(
      (m) => m.userId === userId && m.status === 'pending',
    );
  }

  purgeByTag(userId: string, tag: string): number {
    let count = 0;
    for (const [id, entry] of this.memories) {
      if (entry.userId === userId && entry.tags.includes(tag)) {
        this.memories.delete(id);
        const idx = this.insertionOrder.indexOf(id);
        if (idx >= 0) {
          this.insertionOrder.splice(idx, 1);
        }
        count++;
      }
    }
    return count;
  }

  private evictIfNeeded(): void {
    while (this.memories.size > this.maxEntries && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift();
      if (oldest != null) {
        this.memories.delete(oldest);
      }
    }
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
    const deleted = this.memories.delete(id);
    if (deleted) {
      const idx = this.insertionOrder.indexOf(id);
      if (idx >= 0) {
        this.insertionOrder.splice(idx, 1);
      }
    }
    return deleted;
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
    // Cap access log to prevent unbounded growth
    if (entry.accessLog.length > this.maxAccessLogEntries) {
      entry.accessLog = entry.accessLog.slice(-this.maxAccessLogEntries);
    }
    this.memories.set(id, entry);
    return true;
  }

  // TODO: Access scope enforcement at query time is planned for a future phase.
  // Currently getUserMemories returns all active, non-expired entries for a user
  // regardless of the requesting app's identity. Scope filtering will be added
  // when app-level identity is passed through the API layer.
  getUserMemories(userId: string): MemoryEntry[] {
    const now = Date.now();
    return Array.from(this.memories.values()).filter(
      (m) =>
        m.userId === userId && m.status === 'active' && (m.expiresAt == null || m.expiresAt > now),
    );
  }

  deleteUserMemories(userId: string): number {
    let count = 0;
    for (const [id, entry] of this.memories) {
      if (entry.userId === userId) {
        this.memories.delete(id);
        const idx = this.insertionOrder.indexOf(id);
        if (idx >= 0) {
          this.insertionOrder.splice(idx, 1);
        }
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
