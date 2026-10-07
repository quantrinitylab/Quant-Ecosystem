import { MemoryStore } from './memory-store.js';

export interface UnifiedMemoryItem {
  id: string;
  userId: string;
  type: 'conversation' | 'task' | 'preference' | 'fact' | 'workflow' | 'workflow_result';
  content: any;
  sourceAgent?: string;
  timestamp: Date;
  embedding?: number[];
  tags?: string[];
}

export class UnifiedMemorySystem {
  private userMemories: Map<string, MemoryStore> = new Map();
  private globalMemory: MemoryStore;

  constructor() {
    this.globalMemory = new MemoryStore('unified-global');
  }

  private getUserMemory(userId: string): MemoryStore {
    if (!this.userMemories.has(userId)) {
      this.userMemories.set(userId, new MemoryStore(`user-${userId}`));
    }
    return this.userMemories.get(userId)!;
  }

  async storeForUser(
    userId: string,
    item: Omit<UnifiedMemoryItem, 'id' | 'timestamp' | 'userId'>,
  ): Promise<string> {
    const memoryStore = this.getUserMemory(userId);

    const id = await memoryStore.store({
      type: item.type,
      content: item.content,
      metadata: {
        sourceAgent: item.sourceAgent,
        tags: item.tags,
      },
    });

    // Also store in global memory for cross-user insights (anonymized)
    await this.globalMemory.store({
      type: 'cross_user_' + item.type,
      content: {
        type: item.type,
        tags: item.tags,
      },
    });

    return id;
  }

  async retrieveForUser(userId: string, query: string, limit: number = 10) {
    const memoryStore = this.getUserMemory(userId);
    return memoryStore.retrieveRelevant(query, limit);
  }

  async getUserContext(userId: string) {
    const memoryStore = this.getUserMemory(userId);
    return memoryStore.getRecent(50);
  }

  async shareMemoryBetweenAgents(
    fromAgent: string,
    toAgent: string,
    userId: string,
    memoryId: string,
  ) {
    const memoryStore = this.getUserMemory(userId);
    const memory = await memoryStore.retrieve(memoryId);

    if (memory) {
      await memoryStore.store({
        type: 'shared_memory',
        content: memory.content,
        metadata: {
          fromAgent,
          toAgent,
          originalId: memoryId,
        },
      });
    }
  }
}

export const unifiedMemory = new UnifiedMemorySystem();
