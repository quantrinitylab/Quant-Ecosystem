// ============================================================================
// AI Core — InMemoryMemoryPort (default implementation, preserves existing behavior)
//
// This is the BACKWARD-COMPATIBLE implementation that replicates the current
// ContextManager's behavior behind the new MemoryPort interface. Existing
// tests and production behavior are unchanged. Future PRs (M02-M05) will
// introduce PrismaMemoryPort and VectorMemoryPort as replacements.
//
// On restart: ALL DATA LOST (same as current behavior — explicitly acknowledged).
// ============================================================================

import type {
  MemoryPort,
  MemoryEntry,
  MemoryRetrievalOptions,
  MemoryRetrievalResult,
  MemoryStats,
  MemoryProvenance,
} from './memory-port';
import { MemoryLevel } from './memory-port';

let counter = 0;
function generateMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${(++counter).toString(36)}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * InMemoryMemoryPort — backward-compatible default.
 *
 * Stores everything in Maps. Lost on restart. This is intentional for Phase 1:
 * the interface is now correct; persistence comes in PR-M02.
 */
export class InMemoryMemoryPort implements MemoryPort {
  private memories: Map<string, MemoryEntry> = new Map();
  private history: Map<string, Array<{ role: string; content: string; timestamp: number }>> = new Map();
  private summaries: Map<string, string> = new Map();
  private retrievalLatencies: number[] = [];

  // ─── Core Operations ──────────────────────────────────────────────────────

  async store(
    userId: string,
    entry: Omit<MemoryEntry, 'id' | 'retrievalCount'>,
  ): Promise<MemoryEntry> {
    // Deduplication by key+owner (CEO Order #0038)
    const existing = Array.from(this.memories.values()).find(
      (m) => m.key === entry.key && m.provenance.owner === userId,
    );
    if (existing) {
      const updated: MemoryEntry = {
        ...existing,
        content: entry.content,
        score: Math.max(existing.score, entry.score),
        scoreComponents: entry.scoreComponents,
        provenance: { ...existing.provenance, updatedAt: Date.now() },
      };
      this.memories.set(existing.id, updated);
      return updated;
    }

    const full: MemoryEntry = { ...entry, id: generateMemoryId(), retrievalCount: 0 };
    this.memories.set(full.id, full);
    return full;
  }

  async retrieve(
    userId: string,
    query: string,
    options?: MemoryRetrievalOptions,
  ): Promise<MemoryRetrievalResult[]> {
    const start = Date.now();
    const results = await this.search(userId, query, options);

    // Normalize → Deduplicate → Rank → Compress → Budget (CEO Order #0034)
    const tokenBudget = options?.tokenBudget ?? 2000;
    let tokensUsed = 0;
    const budgeted: MemoryRetrievalResult[] = [];

    for (const entry of results) {
      const entryTokens = estimateTokens(entry.content);
      if (tokensUsed + entryTokens > tokenBudget) break;
      tokensUsed += entryTokens;

      // Update retrieval count
      entry.retrievalCount++;
      this.memories.set(entry.id, entry);

      budgeted.push({
        entry,
        retrievalReason: `Matched query "${query.slice(0, 30)}..." with score ${entry.score.toFixed(2)}`,
        relevance: entry.score,
      });
    }

    this.retrievalLatencies.push(Date.now() - start);
    if (this.retrievalLatencies.length > 1000) this.retrievalLatencies.shift();

    return budgeted;
  }

  async search(
    userId: string,
    query: string,
    options?: MemoryRetrievalOptions,
  ): Promise<MemoryEntry[]> {
    const levels = options?.levels ?? [
      MemoryLevel.CONVERSATION,
      MemoryLevel.USER,
      MemoryLevel.KNOWLEDGE,
    ];
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0.1;

    const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const now = Date.now();

    const candidates = Array.from(this.memories.values())
      .filter((m) => {
        if (m.provenance.owner !== userId) return false;
        if (!levels.includes(m.level)) return false;
        if (m.expiresAt && m.expiresAt < now) return false;
        return true;
      })
      .map((m) => {
        // Word-overlap relevance (same as current context-manager — to be replaced in PR-M04)
        const memWords = new Set(m.content.toLowerCase().split(/\s+/));
        let overlap = 0;
        for (const w of queryWords) {
          if (memWords.has(w)) overlap++;
        }
        const relevance = queryWords.size > 0 ? overlap / queryWords.size : 0;

        // Composite score (CEO Order #0033)
        const freshness = Math.max(0, 1 - (now - m.provenance.updatedAt) / (7 * 24 * 3600_000));
        const dynamicScore =
          m.scoreComponents.importance * 0.3 +
          freshness * 0.2 +
          m.scoreComponents.confidence * 0.2 +
          (m.retrievalCount > 0 ? Math.min(1, m.retrievalCount / 20) : 0) * 0.15 +
          relevance * 0.15;

        return { memory: m, dynamicScore };
      })
      .filter((r) => r.dynamicScore >= minScore)
      .sort((a, b) => b.dynamicScore - a.dynamicScore)
      .slice(0, limit);

    return candidates.map((c) => ({ ...c.memory, score: c.dynamicScore }));
  }

  // ─── History ──────────────────────────────────────────────────────────────

  async getHistory(
    userId: string,
    _sessionId?: string,
    limit?: number,
  ): Promise<Array<{ role: string; content: string; timestamp: number }>> {
    const h = this.history.get(userId) ?? [];
    return h.slice(-(limit ?? 40));
  }

  async appendHistory(userId: string, _sessionId: string, role: string, content: string): Promise<void> {
    const h = this.history.get(userId) ?? [];
    h.push({ role, content, timestamp: Date.now() });
    // Cap at 40 entries (20 turns) — same as current ContextManager
    if (h.length > 40) h.splice(0, h.length - 40);
    this.history.set(userId, h);
  }

  // ─── Summarization ────────────────────────────────────────────────────────

  async summarize(userId: string): Promise<string | null> {
    return this.summaries.get(userId) ?? null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async forget(memoryId: string, _reason: string): Promise<boolean> {
    return this.memories.delete(memoryId);
  }

  async decay(userId: string): Promise<number> {
    let decayed = 0;
    for (const [id, m] of this.memories) {
      if (m.provenance.owner !== userId) continue;
      if (m.pinned) continue;
      m.scoreComponents.importance *= 0.95;
      m.score = m.scoreComponents.importance;
      if (m.score < 0.05) {
        this.memories.delete(id);
        decayed++;
      } else {
        this.memories.set(id, m);
      }
    }
    return decayed;
  }

  // ─── Importance Management ────────────────────────────────────────────────

  async promote(memoryId: string, boostFactor = 1.2): Promise<MemoryEntry | null> {
    const m = this.memories.get(memoryId);
    if (!m) return null;
    m.scoreComponents.importance = Math.min(1, m.scoreComponents.importance * boostFactor);
    m.score = m.scoreComponents.importance;
    this.memories.set(memoryId, m);
    return m;
  }

  async demote(memoryId: string, decayFactor = 0.8): Promise<MemoryEntry | null> {
    const m = this.memories.get(memoryId);
    if (!m) return null;
    m.scoreComponents.importance *= decayFactor;
    m.score = m.scoreComponents.importance;
    this.memories.set(memoryId, m);
    return m;
  }

  async pin(memoryId: string): Promise<MemoryEntry | null> {
    const m = this.memories.get(memoryId);
    if (!m) return null;
    m.pinned = true;
    m.expiresAt = null;
    this.memories.set(memoryId, m);
    return m;
  }

  async unpin(memoryId: string): Promise<MemoryEntry | null> {
    const m = this.memories.get(memoryId);
    if (!m) return null;
    m.pinned = false;
    this.memories.set(memoryId, m);
    return m;
  }

  // ─── Explainability ───────────────────────────────────────────────────────

  async explain(memoryId: string): Promise<string> {
    const m = this.memories.get(memoryId);
    if (!m) return 'Memory not found.';
    return [
      `Memory: "${m.content.slice(0, 80)}..."`,
      `Level: ${MemoryLevel[m.level]}`,
      `Source: ${m.provenance.source}`,
      `Created: ${new Date(m.provenance.createdAt).toISOString()}`,
      `Confidence: ${m.provenance.confidence}`,
      `Importance: ${m.scoreComponents.importance.toFixed(3)}`,
      `Retrieved ${m.retrievalCount} times`,
      `Pinned: ${m.pinned}`,
      m.expiresAt ? `Expires: ${new Date(m.expiresAt).toISOString()}` : 'No expiry',
      `Reason stored: ${m.provenance.reason}`,
    ].join('\n');
  }

  // ─── Observability ────────────────────────────────────────────────────────

  async stats(userId?: string): Promise<MemoryStats> {
    const entries = userId
      ? Array.from(this.memories.values()).filter((m) => m.provenance.owner === userId)
      : Array.from(this.memories.values());

    const countByLevel: Record<MemoryLevel, number> = {
      [MemoryLevel.WORKING]: 0,
      [MemoryLevel.CONVERSATION]: 0,
      [MemoryLevel.USER]: 0,
      [MemoryLevel.KNOWLEDGE]: 0,
      [MemoryLevel.ORGANIZATION]: 0,
      [MemoryLevel.WORLD]: 0,
    };
    let totalTokens = 0;
    let pinnedCount = 0;

    for (const e of entries) {
      countByLevel[e.level]++;
      totalTokens += estimateTokens(e.content);
      if (e.pinned) pinnedCount++;
    }

    const avgLatency =
      this.retrievalLatencies.length > 0
        ? this.retrievalLatencies.reduce((a, b) => a + b, 0) / this.retrievalLatencies.length
        : 0;

    return {
      countByLevel,
      totalTokens,
      cacheHitRate: 0, // No cache layer in in-memory implementation
      avgRetrievalLatencyMs: avgLatency,
      decayedLastCycle: 0,
      pinnedCount,
    };
  }
}
