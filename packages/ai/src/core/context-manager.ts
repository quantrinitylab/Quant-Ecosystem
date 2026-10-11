// ============================================================================
// AI Core - Context Manager
// ============================================================================

import type { ConversationMessage, ContextMemoryEntry } from '../types';
import {
  MemoryInjectionGuard,
  UNTRUSTED_DATA_NOTICE,
  beginUntrustedBlock,
  endUntrustedBlock,
  type MemoryQuarantineSink,
  type MemoryGuardStats,
} from './memory-injection-guard';

/** Context window configuration */
interface ContextConfig {
  maxHistoryMessages: number;
  maxContextTokens: number;
  memoryDecayRate: number;
  importanceThreshold: number;
  /**
   * F-110: best-effort audit sink for memory candidates quarantined as
   * suspected prompt-injection payloads (write-time and recall-time).
   */
  onMemoryQuarantine?: MemoryQuarantineSink;
}

/** A memory candidate quarantined by the injection guard (never recalled). */
export interface QuarantinedMemoryEntry {
  key: string;
  value: string;
  importance: number;
  timestamp: number;
  quarantinedAt: number;
  categories: string[];
}

const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxHistoryMessages: 20,
  maxContextTokens: 4000,
  memoryDecayRate: 0.95,
  importanceThreshold: 0.3,
};

/**
 * Context Manager
 *
 * Manages conversation context, long-term memory, and context window
 * optimization for AI interactions across the ecosystem.
 *
 * Features:
 * - Conversation history management per user
 * - Long-term memory with importance scoring
 * - Context window optimization (keeps most relevant context)
 * - Cross-app context sharing
 * - Memory summarization for long conversations
 */
export class ContextManager {
  private config: ContextConfig;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();
  private longTermMemory: Map<string, ContextMemoryEntry[]> = new Map();
  private summaries: Map<string, string> = new Map();
  /**
   * F-110: quarantined injection suspects. Kept OUT of longTermMemory so they
   * can never be recalled into a prompt; retained for review/audit.
   */
  private quarantined: Map<string, QuarantinedMemoryEntry[]> = new Map();
  private readonly injectionGuard: MemoryInjectionGuard;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
    this.injectionGuard = new MemoryInjectionGuard(this.config.onMemoryQuarantine);
  }

  /**
   * Enrich a prompt with relevant context from history and memory
   */
  async enrichPrompt(
    userId: string,
    prompt: string,
    additionalContext: ConversationMessage[] = [],
  ): Promise<string> {
    const parts: string[] = [];

    // Add relevant long-term memories.
    // F-110: recalled memories are UNTRUSTED DATA — screen each at recall
    // time, quarantine + drop flagged items, and wrap survivors in explicit
    // delimiters with an instruction-hierarchy preamble (data, not
    // instructions).
    const memories = this.getRelevantMemories(userId, prompt);
    const cleanMemories: ContextMemoryEntry[] = [];
    for (const memory of memories) {
      const screen = this.injectionGuard.screen(memory.value);
      if (screen.flagged) {
        this.quarantineMemory(userId, memory, screen.categories, 'recall');
        continue;
      }
      cleanMemories.push(memory);
    }
    if (cleanMemories.length > 0) {
      parts.push('Relevant context from previous interactions:');
      parts.push(UNTRUSTED_DATA_NOTICE);
      for (const memory of cleanMemories) {
        parts.push(this.injectionGuard.wrap(memory.value, 'recalled memory'));
      }
      parts.push('');
    }

    // Add conversation summary if available.
    // F-110: summaries are attacker-influenceable (built from past turns) —
    // screen at recall time; quarantine + drop when flagged.
    const summary = this.summaries.get(userId);
    if (summary) {
      const screen = this.injectionGuard.screen(summary);
      if (screen.flagged) {
        this.quarantineMemory(
          userId,
          { key: 'conversation_summary', value: summary, importance: 0, timestamp: Date.now() },
          screen.categories,
          'recall',
        );
      } else {
        parts.push('Conversation summary:');
        parts.push(UNTRUSTED_DATA_NOTICE);
        parts.push(this.injectionGuard.wrap(summary, 'conversation summary'));
        parts.push('');
      }
    }

    // Add recent conversation history.
    // F-110: history contains past user turns (recorded raw) — mark the whole
    // section as untrusted data. History is wrapped, not dropped, so the
    // conversation stays coherent; the preamble keeps it out of the
    // instruction hierarchy.
    const history = this.getRecentHistory(userId);
    if (history.length > 0) {
      parts.push('Recent conversation:');
      parts.push(UNTRUSTED_DATA_NOTICE);
      parts.push(beginUntrustedBlock('conversation history'));
      for (const msg of history) {
        const role = typeof msg.role === 'string' ? msg.role : 'unknown';
        const content = typeof msg.content === 'string' ? msg.content : String(msg.content ?? '');
        parts.push(`${role}: ${content}`);
      }
      parts.push(endUntrustedBlock('conversation history'));
      parts.push('');
    }

    // Add any additional context
    if (additionalContext.length > 0) {
      for (const msg of additionalContext) {
        parts.push(`${msg.role}: ${msg.content}`);
      }
      parts.push('');
    }

    // Add the current prompt
    parts.push(`user: ${prompt}`);

    return parts.join('\n');
  }

  /**
   * Add a user-assistant exchange to conversation history
   */
  async addToHistory(
    userId: string,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    const history = this.conversationHistory.get(userId) || [];

    history.push(
      { role: 'user', content: userMessage, timestamp: Date.now() },
      { role: 'assistant', content: assistantResponse, timestamp: Date.now() },
    );

    // Trim history if too long
    if (history.length > this.config.maxHistoryMessages * 2) {
      // Summarize older messages before removing
      const removedMessages = history.splice(0, history.length - this.config.maxHistoryMessages);
      await this.summarizeAndStore(userId, removedMessages);
    }

    this.conversationHistory.set(userId, history);

    // Extract and store important information
    await this.extractMemories(userId, userMessage, assistantResponse);
  }

  /**
   * Store a memory entry for a user
   */
  async addMemory(
    userId: string,
    key: string,
    value: string,
    importance: number = 0.5,
  ): Promise<void> {
    // F-110: scan on write. A flagged candidate never enters long-term
    // memory — it is quarantined (non-recallable) and audited instead.
    const screen = this.injectionGuard.screen(value);
    if (screen.flagged) {
      this.quarantineMemory(
        userId,
        { key, value, importance, timestamp: Date.now() },
        screen.categories,
        'write',
      );
      return;
    }

    const memories = this.longTermMemory.get(userId) || [];

    // Check for duplicate keys and update
    const existingIndex = memories.findIndex((m) => m.key === key);
    if (existingIndex >= 0) {
      memories[existingIndex] = {
        key,
        value,
        importance: Math.max(memories[existingIndex]!.importance, importance),
        timestamp: Date.now(),
      };
    } else {
      memories.push({
        key,
        value,
        importance,
        timestamp: Date.now(),
      });
    }

    // Sort by importance and trim if needed
    memories.sort((a, b) => b.importance - a.importance);
    if (memories.length > 100) {
      memories.splice(100);
    }

    this.longTermMemory.set(userId, memories);
  }

  /**
   * Get relevant memories for a given prompt
   */
  getRelevantMemories(userId: string, prompt: string): ContextMemoryEntry[] {
    const memories = this.longTermMemory.get(userId) || [];
    if (memories.length === 0) return [];

    // Score memories by relevance to the prompt
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/));
    const scored = memories.map((memory) => {
      const memoryWords = new Set(memory.value.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const word of promptWords) {
        if (memoryWords.has(word)) overlap++;
      }
      const relevance = overlap / Math.max(promptWords.size, 1);
      const recency = 1 - (Date.now() - memory.timestamp) / (7 * 24 * 60 * 60 * 1000); // Decay over a week
      const score = relevance * 0.6 + Math.max(0, recency) * 0.2 + memory.importance * 0.2;
      return { memory, score };
    });

    return scored
      .filter((s) => s.score > this.config.importanceThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.memory);
  }

  /**
   * Get recent conversation history for a user
   */
  getRecentHistory(userId: string, limit?: number): ConversationMessage[] {
    const history = this.conversationHistory.get(userId) || [];
    const maxMessages = limit || this.config.maxHistoryMessages;
    return history.slice(-maxMessages);
  }

  /**
   * F-110: quarantine a suspected prompt-injection memory candidate.
   *
   * - 'write' stage: the candidate was screened on the way in and never
   *   entered long-term memory.
   * - 'recall' stage: the item was already stored (pre-fix data or a missed
   *   write-time screen). It is REMOVED from long-term memory so no future
   *   recall can serve it, and moved to the quarantine list for review.
   *
   * Either way an audit event is emitted to the quarantine sink and the
   * guard counters are bumped.
   */
  private quarantineMemory(
    userId: string,
    entry: ContextMemoryEntry,
    categories: string[],
    stage: 'write' | 'recall',
  ): void {
    if (stage === 'recall') {
      const memories = this.longTermMemory.get(userId);
      if (memories) {
        const idx = memories.findIndex(
          (m) => m.key === entry.key && m.value === entry.value && m.timestamp === entry.timestamp,
        );
        if (idx >= 0) memories.splice(idx, 1);
      }
    }
    const list = this.quarantined.get(userId) || [];
    list.push({
      key: entry.key,
      value: entry.value,
      importance: entry.importance,
      timestamp: entry.timestamp,
      quarantinedAt: Date.now(),
      categories,
    });
    this.quarantined.set(userId, list);
    this.injectionGuard.quarantine({
      stage,
      actor: userId,
      content: entry.value,
      categories,
    });
  }

  /** F-110: quarantined injection suspects for a user (never recalled). */
  getQuarantinedMemories(userId: string): QuarantinedMemoryEntry[] {
    return [...(this.quarantined.get(userId) || [])];
  }

  /** F-110: lifetime audit counters for the injection guard. */
  getMemoryGuardStats(): MemoryGuardStats {
    return this.injectionGuard.getStats();
  }

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
    this.summaries.delete(userId);
  }

  /**
   * Clear all context (history + memories) for a user
   */
  clearAll(userId: string): void {
    this.conversationHistory.delete(userId);
    this.longTermMemory.delete(userId);
    this.summaries.delete(userId);
    this.quarantined.delete(userId);
  }

  /**
   * Get the total context size for a user (approximate tokens)
   */
  getContextSize(userId: string): number {
    const history = this.conversationHistory.get(userId) || [];
    const memories = this.longTermMemory.get(userId) || [];
    const summary = this.summaries.get(userId) || '';

    let totalChars = 0;
    for (const msg of history) {
      totalChars += msg.content.length;
    }
    for (const memory of memories) {
      totalChars += memory.value.length;
    }
    totalChars += summary.length;

    return Math.ceil(totalChars / 4); // Approximate tokens
  }

  /**
   * Summarize and store older messages
   */
  private async summarizeAndStore(userId: string, messages: ConversationMessage[]): Promise<void> {
    if (messages.length === 0) return;

    // Create a simple summary of the removed messages
    const topics = new Set<string>();
    for (const msg of messages) {
      const words = msg.content.split(/\s+/).slice(0, 5);
      topics.add(words.join(' '));
    }

    const existingSummary = this.summaries.get(userId) || '';
    const newSummary = existingSummary
      ? `${existingSummary} Additionally discussed: ${Array.from(topics).slice(0, 3).join('; ')}.`
      : `Previously discussed: ${Array.from(topics).slice(0, 5).join('; ')}.`;

    this.summaries.set(userId, newSummary);
  }

  /**
   * Extract important information from exchanges and store as memories
   */
  private async extractMemories(
    userId: string,
    userMessage: string,
    _assistantResponse: string,
  ): Promise<void> {
    // Simple heuristic: look for informational patterns
    const patterns = [
      { regex: /my name is (\w+)/i, key: 'user_name' },
      { regex: /i (?:work|am working) (?:at|for) (.+?)(?:\.|,|$)/i, key: 'workplace' },
      { regex: /i (?:live|am) in (.+?)(?:\.|,|$)/i, key: 'location' },
      { regex: /i (?:like|love|enjoy|prefer) (.+?)(?:\.|,|$)/i, key: 'preference' },
      { regex: /i'm (?:a|an) (.+?)(?:\.|,|$)/i, key: 'identity' },
    ];

    for (const pattern of patterns) {
      const match = userMessage.match(pattern.regex);
      if (match) {
        await this.addMemory(userId, pattern.key, match[0], 0.8);
      }
    }
  }

  /**
   * Apply memory decay to reduce importance of old memories
   */
  applyDecay(userId: string): void {
    const memories = this.longTermMemory.get(userId);
    if (!memories) return;

    for (const memory of memories) {
      memory.importance *= this.config.memoryDecayRate;
    }

    // Remove memories below threshold
    const filtered = memories.filter((m) => m.importance >= 0.1);
    this.longTermMemory.set(userId, filtered);
  }
}
