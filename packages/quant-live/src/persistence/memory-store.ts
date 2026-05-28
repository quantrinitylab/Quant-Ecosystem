import type { LiveSessionState, SessionStoreEntry } from '../types.js';
import type { SessionStore } from './session-store.js';

export class InMemorySessionStore implements SessionStore {
  private store = new Map<string, SessionStoreEntry>();
  private idCounter = 0;

  async create(entry: Omit<SessionStoreEntry, 'id'>): Promise<SessionStoreEntry> {
    const id = `ls-${++this.idCounter}`;
    const full: SessionStoreEntry = { ...entry, id };
    this.store.set(id, full);
    return full;
  }

  async get(id: string): Promise<SessionStoreEntry | undefined> {
    return this.store.get(id);
  }

  async list(
    userId: string,
    opts?: { limit?: number; offset?: number; state?: LiveSessionState },
  ): Promise<{ entries: SessionStoreEntry[]; total: number }> {
    let entries = [...this.store.values()].filter((e) => e.userId === userId);
    if (opts?.state) entries = entries.filter((e) => e.state === opts.state);
    const total = entries.length;
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? entries.length;
    return { entries: entries.slice(offset, offset + limit), total };
  }

  async update(id: string, patch: Partial<SessionStoreEntry>): Promise<SessionStoreEntry> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Session not found: ${id}`);
    const updated = { ...existing, ...patch, id };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async search(userId: string, query: string): Promise<SessionStoreEntry[]> {
    const lower = query.toLowerCase();
    return [...this.store.values()].filter((e) => {
      if (e.userId !== userId) return false;
      return e.transcript.some((s) => s.text.toLowerCase().includes(lower));
    });
  }
}
