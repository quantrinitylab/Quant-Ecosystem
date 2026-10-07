// ============================================================================
// QuantChat - Message Search Service
// Full-text search with filters and relevance scoring
// ============================================================================

export interface SearchableMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: number;
  type: string;
  isPinned: boolean;
}

export interface SearchFilters {
  conversationId?: string;
  senderId?: string;
  type?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  isPinned?: boolean;
}

export interface SearchResult {
  message: SearchableMessage;
  score: number;
  highlights: string[];
}

export class MessageSearchService {
  private index: Map<string, SearchableMessage> = new Map();
  private conversationIndex: Map<string, Set<string>> = new Map();
  private senderIndex: Map<string, Set<string>> = new Map();

  indexMessage(message: SearchableMessage): void {
    this.index.set(message.id, message);

    const convSet = this.conversationIndex.get(message.conversationId) ?? new Set();
    convSet.add(message.id);
    this.conversationIndex.set(message.conversationId, convSet);

    const senderSet = this.senderIndex.get(message.senderId) ?? new Set();
    senderSet.add(message.id);
    this.senderIndex.set(message.senderId, senderSet);
  }

  removeMessage(messageId: string): boolean {
    const message = this.index.get(messageId);
    if (!message) return false;

    this.index.delete(messageId);
    this.conversationIndex.get(message.conversationId)?.delete(messageId);
    this.senderIndex.get(message.senderId)?.delete(messageId);
    return true;
  }

  search(query: string, filters?: SearchFilters, limit: number = 50): SearchResult[] {
    if (!query.trim()) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = this.getCandidates(filters);
    const results: SearchResult[] = [];

    for (const message of candidates) {
      const score = this.calculateScore(message, terms);
      if (score > 0) {
        const highlights = this.extractHighlights(message.content, terms);
        results.push({ message, score, highlights });
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.message.timestamp - a.message.timestamp;
    });

    return results.slice(0, limit);
  }

  searchByDate(query: string, filters?: SearchFilters, limit: number = 50): SearchResult[] {
    const results = this.search(query, filters, limit);
    results.sort((a, b) => b.message.timestamp - a.message.timestamp);
    return results;
  }

  searchByConversation(conversationId: string, query: string, limit: number = 50): SearchResult[] {
    return this.search(query, { conversationId }, limit);
  }

  searchByUser(senderId: string, query: string, limit: number = 50): SearchResult[] {
    return this.search(query, { senderId }, limit);
  }

  searchPinned(conversationId: string, query?: string): SearchResult[] {
    const filters: SearchFilters = { conversationId, isPinned: true };
    if (!query) {
      const candidates = this.getCandidates(filters);
      return candidates.map((m) => ({
        message: m,
        score: 1,
        highlights: [],
      }));
    }
    return this.search(query, filters);
  }

  getRecentMessages(conversationId: string, limit: number = 20): SearchableMessage[] {
    const ids = this.conversationIndex.get(conversationId);
    if (!ids) return [];

    const messages: SearchableMessage[] = [];
    for (const id of ids) {
      const msg = this.index.get(id);
      if (msg) messages.push(msg);
    }

    messages.sort((a, b) => b.timestamp - a.timestamp);
    return messages.slice(0, limit);
  }

  getMessageCount(conversationId?: string): number {
    if (conversationId) {
      return this.conversationIndex.get(conversationId)?.size ?? 0;
    }
    return this.index.size;
  }

  clear(): void {
    this.index.clear();
    this.conversationIndex.clear();
    this.senderIndex.clear();
  }

  private getCandidates(filters?: SearchFilters): SearchableMessage[] {
    if (!filters) return Array.from(this.index.values());

    let candidateIds: Set<string> | null = null;

    if (filters.conversationId) {
      candidateIds = new Set(this.conversationIndex.get(filters.conversationId) ?? []);
    }

    if (filters.senderId) {
      const senderIds = this.senderIndex.get(filters.senderId) ?? new Set();
      if (candidateIds) {
        candidateIds = new Set([...candidateIds].filter((id) => senderIds.has(id)));
      } else {
        candidateIds = new Set(senderIds);
      }
    }

    let messages: SearchableMessage[];
    if (candidateIds) {
      messages = [];
      for (const id of candidateIds) {
        const msg = this.index.get(id);
        if (msg) messages.push(msg);
      }
    } else {
      messages = Array.from(this.index.values());
    }

    if (filters.type) {
      messages = messages.filter((m) => m.type === filters.type);
    }
    if (filters.fromTimestamp !== undefined) {
      messages = messages.filter((m) => m.timestamp >= filters.fromTimestamp!);
    }
    if (filters.toTimestamp !== undefined) {
      messages = messages.filter((m) => m.timestamp <= filters.toTimestamp!);
    }
    if (filters.isPinned !== undefined) {
      messages = messages.filter((m) => m.isPinned === filters.isPinned);
    }

    return messages;
  }

  private calculateScore(message: SearchableMessage, terms: string[]): number {
    const content = message.content.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (content.includes(term)) {
        score += 1;
        if (content.startsWith(term)) score += 0.5;
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = content.match(regex);
        if (matches) score += (matches.length - 1) * 0.25;
      }
    }

    if (message.isPinned) score *= 1.5;

    const recency = message.timestamp / Date.now();
    score *= 0.9 + recency * 0.1;

    return score;
  }

  private extractHighlights(
    content: string,
    terms: string[],
    contextLength: number = 30,
  ): string[] {
    const highlights: string[] = [];
    const lower = content.toLowerCase();

    for (const term of terms) {
      const index = lower.indexOf(term);
      if (index === -1) continue;

      const start = Math.max(0, index - contextLength);
      const end = Math.min(content.length, index + term.length + contextLength);
      let highlight = content.slice(start, end);
      if (start > 0) highlight = '...' + highlight;
      if (end < content.length) highlight = highlight + '...';
      highlights.push(highlight);
    }

    return highlights;
  }
}
