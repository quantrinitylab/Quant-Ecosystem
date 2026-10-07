// ============================================================================
// Search History Service - Per-user search history management
// ============================================================================

export interface SearchHistoryEntry {
  id: string;
  userId: string;
  query: string;
  timestamp: Date;
}

export interface SearchHistoryOptions {
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 100;

/**
 * SearchHistoryService - Manages per-user search history
 *
 * Provides CRUD operations for search history with incognito mode support
 * and deduplication. Caps at 100 entries per user.
 *
 * NOTE (v1 - demo/development scope): This service uses an in-memory Map as its backing
 * store. All history is lost on process restart. This is intentional for the current
 * phase. Production deployment requires a persistence adapter to retain history
 * across restarts.
 */
export class SearchHistoryService {
  private readonly store = new Map<string, SearchHistoryEntry[]>();
  private readonly maxEntries: number;
  private idCounter = 0;

  constructor(options?: SearchHistoryOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Add a query to user's search history.
   * Incognito queries are never stored.
   * Duplicate queries are moved to the top instead of creating a new entry.
   */
  addQuery(userId: string, query: string, incognito?: boolean): SearchHistoryEntry | undefined {
    if (incognito) {
      return undefined;
    }

    const normalized = query.trim();
    if (!normalized) {
      return undefined;
    }

    let entries = this.store.get(userId);
    if (!entries) {
      entries = [];
      this.store.set(userId, entries);
    }

    // Deduplication: remove existing entry with same query (case-insensitive)
    const existingIdx = entries.findIndex(
      (e) => e.query.toLowerCase() === normalized.toLowerCase(),
    );
    if (existingIdx !== -1) {
      entries.splice(existingIdx, 1);
    }

    this.idCounter++;
    const entry: SearchHistoryEntry = {
      id: `sh-${this.idCounter}`,
      userId,
      query: normalized,
      timestamp: new Date(),
    };

    // Add to the front (most recent first)
    entries.unshift(entry);

    // Cap at max entries
    if (entries.length > this.maxEntries) {
      entries.splice(this.maxEntries);
    }

    return entry;
  }

  /**
   * Get user's search history, ordered by most recent first.
   */
  getHistory(userId: string, limit?: number): SearchHistoryEntry[] {
    const entries = this.store.get(userId) ?? [];
    if (limit !== undefined && limit >= 0) {
      return entries.slice(0, limit);
    }
    return [...entries];
  }

  /**
   * Clear all search history for a user.
   */
  clearHistory(userId: string): void {
    this.store.delete(userId);
  }

  /**
   * Delete a specific query from user's history.
   */
  deleteQuery(userId: string, queryId: string): boolean {
    const entries = this.store.get(userId);
    if (!entries) return false;

    const idx = entries.findIndex((e) => e.id === queryId);
    if (idx === -1) return false;

    entries.splice(idx, 1);
    return true;
  }
}
