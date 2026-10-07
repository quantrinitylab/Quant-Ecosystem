// ============================================================================
// Memory Manager - User-controlled memory with per-app controls
// ============================================================================
// NOTE: This is an in-memory implementation for the foundation phase. All memory entries are held
// in Maps with no persistence, eviction, TTL, or size limits. Database-backed storage and
// eviction policies will be added when persistence integration is implemented.

import type { MemoryEntry } from '../types.js';

export class MemoryManager {
  private memories: Map<string, MemoryEntry> = new Map();
  private appSettings: Map<string, Map<string, boolean>> = new Map();

  addMemory(userId: string, appSource: string, content: string): MemoryEntry | null {
    if (!this.isAppMemoryEnabled(userId, appSource)) {
      return null;
    }

    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const entry: MemoryEntry = {
      id,
      userId,
      appSource,
      content,
      paused: false,
      createdAt: now,
      updatedAt: now,
    };

    this.memories.set(id, entry);
    return entry;
  }

  getMemories(userId: string, appSource?: string): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    for (const entry of this.memories.values()) {
      if (entry.userId !== userId) continue;
      if (appSource && entry.appSource !== appSource) continue;
      results.push(entry);
    }
    return results;
  }

  editMemory(id: string, content: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;
    entry.content = content;
    entry.updatedAt = Date.now();
    return true;
  }

  deleteMemory(id: string): boolean {
    return this.memories.delete(id);
  }

  pauseMemory(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;
    entry.paused = true;
    entry.updatedAt = Date.now();
    return true;
  }

  resumeMemory(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;
    entry.paused = false;
    entry.updatedAt = Date.now();
    return true;
  }

  setAppMemoryEnabled(userId: string, app: string, enabled: boolean): void {
    let userSettings = this.appSettings.get(userId);
    if (!userSettings) {
      userSettings = new Map();
      this.appSettings.set(userId, userSettings);
    }
    userSettings.set(app, enabled);
  }

  isAppMemoryEnabled(userId: string, app: string): boolean {
    const userSettings = this.appSettings.get(userId);
    if (!userSettings) return true;
    return userSettings.get(app) ?? true;
  }

  getActiveMemories(userId: string): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    for (const entry of this.memories.values()) {
      if (entry.userId === userId && !entry.paused) {
        results.push(entry);
      }
    }
    return results;
  }
}
