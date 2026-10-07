// ============================================================================
// User Signal Processor - Negative feedback, topic hiding, profile reset
// ============================================================================

export interface NegativeSignal {
  type: 'show_less';
  contentType?: string;
  topicId?: string;
  itemId?: string;
  timestamp: number;
}

export interface SignalStore {
  saveSignal(userId: string, signal: NegativeSignal): void;
  getSignals(userId: string): NegativeSignal[];
  clearSignals(userId: string): void;
}

export class InMemorySignalStore implements SignalStore {
  private signals: Map<string, NegativeSignal[]> = new Map();

  saveSignal(userId: string, signal: NegativeSignal): void {
    const existing = this.signals.get(userId) ?? [];
    existing.push(signal);
    this.signals.set(userId, existing);
  }

  getSignals(userId: string): NegativeSignal[] {
    return this.signals.get(userId) ?? [];
  }

  clearSignals(userId: string): void {
    this.signals.delete(userId);
  }
}

export class UserSignalProcessor {
  private signalStore: SignalStore;
  private hiddenTopics: Map<string, Set<string>> = new Map();
  private retrainingQueue: Set<string> = new Set();

  constructor(signalStore?: SignalStore) {
    this.signalStore = signalStore ?? new InMemorySignalStore();
  }

  processNegativeSignal(userId: string, signal: NegativeSignal): void {
    this.signalStore.saveSignal(userId, signal);
    // Mark user for retraining within 1 hour
    this.retrainingQueue.add(userId);
  }

  getActiveHiddenTopics(userId: string): string[] {
    const topics = this.hiddenTopics.get(userId);
    return topics ? [...topics] : [];
  }

  hideTopics(userId: string, topicIds: string[]): void {
    const existing = this.hiddenTopics.get(userId) ?? new Set();
    for (const id of topicIds) {
      existing.add(id);
    }
    this.hiddenTopics.set(userId, existing);
  }

  unhideTopics(userId: string, topicIds: string[]): void {
    const existing = this.hiddenTopics.get(userId);
    if (!existing) return;
    for (const id of topicIds) {
      existing.delete(id);
    }
  }

  resetProfile(userId: string): void {
    this.signalStore.clearSignals(userId);
    this.hiddenTopics.delete(userId);
    this.retrainingQueue.delete(userId);
  }

  getRetrainingQueue(): string[] {
    return [...this.retrainingQueue];
  }
}
