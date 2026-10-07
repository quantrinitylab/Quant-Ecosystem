// ============================================================================
// AI Core — LegacyMemoryAdapter (M11c, ADR-011)
//
// Adapts the legacy ContextManager (pairing model: addToHistory + enrichPrompt/
// getRelevantMemories) to the MemoryBackend interface the MemoryFacade routes.
// This lets the facade run legacy and new side-by-side for shadow comparison.
//
// NOTE: the legacy model records via user↔assistant PAIRING, while MemoryBackend
// is per-turn. This adapter records user turns (empty assistant slot triggers
// legacy memory extraction) and ignores non-user turns. It is a MIGRATION-HARNESS
// adapter for shadow comparison — NOT a drop-in replacement for AIEngine's direct
// ContextManager calls (that wiring needs an enrich/record-shaped facade; see
// INTEGRATION_MAP.md). Keeps production behavior unchanged (engine untouched).
// ============================================================================

import type { ContextManager } from './context-manager';
import type { MemoryBackend } from './memory-facade';
import type { ConversationTurn, RetrievalContext, RetrievedMemory } from './memory-port';

export class LegacyMemoryAdapter implements MemoryBackend {
  constructor(private readonly ctx: ContextManager) {}

  async observe(turn: ConversationTurn): Promise<void> {
    // The legacy model derives memories from user messages. Non-user turns are
    // not memory sources in that model.
    if (turn.role === 'user') {
      await this.ctx.addToHistory(turn.actor, turn.content, '');
    }
  }

  async recall(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    const memories = this.ctx.getRelevantMemories(ctx.actor, ctx.query);
    return memories.map((m) => ({
      id: m.key,
      content: m.value,
      source: 'legacy',
      relevance: m.importance,
      backend: 'context-manager',
      reason: 'legacy',
    }));
  }
}
