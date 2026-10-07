// ============================================================================
// QuantAI - Conversation History Service
// Enhanced history management with search, pinning, and stats
// ============================================================================

export interface HistoryConversation {
  id: string;
  title: string;
  messages: HistoryMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  tags: string[];
}

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  tokens?: number;
}

export interface ConversationStats {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  averageMessagesPerConversation: number;
  mostUsedModel: string;
  pinnedCount: number;
  archivedCount: number;
}

export interface SearchOptions {
  query?: string;
  model?: string;
  tag?: string;
  dateFrom?: number;
  dateTo?: number;
  pinnedOnly?: boolean;
  archivedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export class ConversationHistoryService {
  private conversations: Map<string, HistoryConversation> = new Map();

  addConversation(conversation: HistoryConversation): void {
    this.conversations.set(conversation.id, conversation);
  }

  getConversation(id: string): HistoryConversation | null {
    return this.conversations.get(id) || null;
  }

  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  listConversations(options: SearchOptions = {}): HistoryConversation[] {
    let results = Array.from(this.conversations.values());

    if (options.archivedOnly) {
      results = results.filter((c) => c.archived);
    } else if (!options.archivedOnly) {
      results = results.filter((c) => !c.archived);
    }

    if (options.pinnedOnly) {
      results = results.filter((c) => c.pinned);
    }

    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.messages.some((m) => m.content.toLowerCase().includes(query)),
      );
    }

    if (options.model) {
      results = results.filter((c) => c.model === options.model);
    }

    if (options.tag) {
      results = results.filter((c) => c.tags.includes(options.tag!));
    }

    if (options.dateFrom) {
      results = results.filter((c) => c.createdAt >= options.dateFrom!);
    }

    if (options.dateTo) {
      results = results.filter((c) => c.createdAt <= options.dateTo!);
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);

    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return results.slice(offset, offset + limit);
  }

  pinConversation(id: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    conv.pinned = true;
    return true;
  }

  unpinConversation(id: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    conv.pinned = false;
    return true;
  }

  archiveConversation(id: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    conv.archived = true;
    return true;
  }

  unarchiveConversation(id: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    conv.archived = false;
    return true;
  }

  addTag(id: string, tag: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    if (!conv.tags.includes(tag)) {
      conv.tags.push(tag);
    }
    return true;
  }

  removeTag(id: string, tag: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    conv.tags = conv.tags.filter((t) => t !== tag);
    return true;
  }

  renameConversation(id: string, title: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;
    conv.title = title;
    return true;
  }

  getStats(): ConversationStats {
    const all = Array.from(this.conversations.values());
    let totalMessages = 0;
    let totalTokens = 0;
    const modelCounts: Record<string, number> = {};

    for (const conv of all) {
      totalMessages += conv.messages.length;
      for (const msg of conv.messages) {
        totalTokens += msg.tokens || 0;
      }
      modelCounts[conv.model] = (modelCounts[conv.model] || 0) + 1;
    }

    const mostUsedModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    return {
      totalConversations: all.length,
      totalMessages,
      totalTokens,
      averageMessagesPerConversation: all.length > 0 ? totalMessages / all.length : 0,
      mostUsedModel,
      pinnedCount: all.filter((c) => c.pinned).length,
      archivedCount: all.filter((c) => c.archived).length,
    };
  }

  search(query: string, limit: number = 20): HistoryConversation[] {
    return this.listConversations({ query, limit });
  }

  getRecentConversations(limit: number = 10): HistoryConversation[] {
    return this.listConversations({ limit });
  }
}
