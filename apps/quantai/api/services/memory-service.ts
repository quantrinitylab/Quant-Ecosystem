// ============================================================================
// QuantAI - Memory Service
// Long-term memory: storage, retrieval, relevance scoring, privacy
// ============================================================================

interface MemoryItem {
  id: string;
  userId: string;
  text: string;
  category: string;
  privacyLevel: 'share' | 'app-only' | 'never';
  source: string;
  embedding?: number[];
  relevanceScore: number;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

interface MemorySearchResult {
  memory: MemoryItem;
  score: number;
  matchedTerms: string[];
}

interface MemoryStats {
  totalMemories: number;
  byCategory: Record<string, number>;
  byPrivacy: Record<string, number>;
  lastUpdated: Date;
}

type MemoryCategory = 'personal' | 'work' | 'preferences' | 'people' | 'general';

export class MemoryService {
  private memories: Map<string, MemoryItem> = new Map();

  async addMemory(userId: string, text: string, category: MemoryCategory, source: string = 'conversation'): Promise<MemoryItem> {
    const memory: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      text,
      category,
      privacyLevel: 'app-only',
      source,
      relevanceScore: 1.0,
      accessCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memories.set(memory.id, memory);
    return memory;
  }

  async getMemory(memoryId: string): Promise<MemoryItem | null> {
    const memory = this.memories.get(memoryId);
    if (memory) {
      memory.accessCount++;
      memory.relevanceScore = this.calculateRelevance(memory);
    }
    return memory || null;
  }

  async listMemories(userId: string, category?: string): Promise<MemoryItem[]> {
    let results = Array.from(this.memories.values()).filter(m => m.userId === userId);
    if (category) {
      results = results.filter(m => m.category === category);
    }
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async searchMemories(userId: string, query: string): Promise<MemorySearchResult[]> {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const userMemories = Array.from(this.memories.values()).filter(m => m.userId === userId);

    const results: MemorySearchResult[] = userMemories
      .map(memory => {
        const memoryText = memory.text.toLowerCase();
        const matchedTerms = queryTerms.filter(term => memoryText.includes(term));
        const score = matchedTerms.length / queryTerms.length;
        return { memory, score, matchedTerms };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return results;
  }

  async updateMemory(memoryId: string, userId: string, text: string): Promise<MemoryItem | null> {
    const memory = this.memories.get(memoryId);
    if (!memory || memory.userId !== userId) return null;
    memory.text = text;
    memory.updatedAt = new Date();
    return memory;
  }

  async deleteMemory(memoryId: string, userId: string): Promise<boolean> {
    const memory = this.memories.get(memoryId);
    if (!memory || memory.userId !== userId) return false;
    this.memories.delete(memoryId);
    return true;
  }

  async setPrivacyLevel(memoryId: string, userId: string, level: 'share' | 'app-only' | 'never'): Promise<boolean> {
    const memory = this.memories.get(memoryId);
    if (!memory || memory.userId !== userId) return false;
    memory.privacyLevel = level;
    memory.updatedAt = new Date();
    return true;
  }

  async clearAllMemories(userId: string): Promise<number> {
    const userMemories = Array.from(this.memories.entries()).filter(([_, m]) => m.userId === userId);
    userMemories.forEach(([id]) => this.memories.delete(id));
    return userMemories.length;
  }

  async importMemories(userId: string, data: Array<{ text: string; category: string }>): Promise<number> {
    let imported = 0;
    for (const item of data) {
      await this.addMemory(userId, item.text, item.category as MemoryCategory, 'import');
      imported++;
    }
    return imported;
  }

  async exportMemories(userId: string): Promise<Array<{ text: string; category: string; createdAt: string }>> {
    const memories = await this.listMemories(userId);
    return memories.map(m => ({
      text: m.text,
      category: m.category,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async getStats(userId: string): Promise<MemoryStats> {
    const userMemories = Array.from(this.memories.values()).filter(m => m.userId === userId);
    const byCategory: Record<string, number> = {};
    const byPrivacy: Record<string, number> = {};

    userMemories.forEach(m => {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      byPrivacy[m.privacyLevel] = (byPrivacy[m.privacyLevel] || 0) + 1;
    });

    return {
      totalMemories: userMemories.length,
      byCategory,
      byPrivacy,
      lastUpdated: userMemories.length > 0
        ? new Date(Math.max(...userMemories.map(m => m.updatedAt.getTime())))
        : new Date(),
    };
  }

  async getRelevantMemories(userId: string, context: string, limit: number = 5): Promise<MemoryItem[]> {
    const searchResults = await this.searchMemories(userId, context);
    return searchResults
      .slice(0, limit)
      .map(r => r.memory)
      .filter(m => m.privacyLevel !== 'never');
  }

  private calculateRelevance(memory: MemoryItem): number {
    const ageInDays = (Date.now() - memory.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.exp(-ageInDays / 30);
    const accessFactor = Math.min(memory.accessCount / 10, 1);
    return (decayFactor * 0.7 + accessFactor * 0.3);
  }
}

export default new MemoryService();
