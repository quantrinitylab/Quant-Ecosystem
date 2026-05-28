import type { LiveSessionState, SessionStoreEntry } from '../types.js';

export interface SessionStore {
  create(entry: Omit<SessionStoreEntry, 'id'>): Promise<SessionStoreEntry>;
  get(id: string): Promise<SessionStoreEntry | undefined>;
  list(
    userId: string,
    opts?: { limit?: number; offset?: number; state?: LiveSessionState },
  ): Promise<{ entries: SessionStoreEntry[]; total: number }>;
  update(id: string, patch: Partial<SessionStoreEntry>): Promise<SessionStoreEntry>;
  delete(id: string): Promise<void>;
}
