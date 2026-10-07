// ============================================================================
// Item-Item Collaborative Filtering - Co-occurrence based similarity
// ============================================================================

export interface Interaction {
  userId: string;
  itemId: string;
  timestamp: number;
}

export class ItemItemCollaborative {
  private cooccurrence: Map<string, Map<string, number>> = new Map();
  private itemUsers: Map<string, Set<string>> = new Map();

  buildCooccurrenceMatrix(interactions: Interaction[]): void {
    // Group interactions by user
    const userItems = new Map<string, string[]>();
    for (const interaction of interactions) {
      const items = userItems.get(interaction.userId) ?? [];
      items.push(interaction.itemId);
      userItems.set(interaction.userId, items);

      // Track which users interacted with each item
      const users = this.itemUsers.get(interaction.itemId) ?? new Set();
      users.add(interaction.userId);
      this.itemUsers.set(interaction.itemId, users);
    }

    // Build co-occurrence: items that appear together for the same user
    this.cooccurrence.clear();
    for (const [, items] of userItems) {
      const uniqueItems = [...new Set(items)];
      for (let i = 0; i < uniqueItems.length; i++) {
        for (let j = i + 1; j < uniqueItems.length; j++) {
          const a = uniqueItems[i]!;
          const b = uniqueItems[j]!;
          this.incrementCooccurrence(a, b);
          this.incrementCooccurrence(b, a);
        }
      }
    }
  }

  private incrementCooccurrence(itemA: string, itemB: string): void {
    if (!this.cooccurrence.has(itemA)) {
      this.cooccurrence.set(itemA, new Map());
    }
    const row = this.cooccurrence.get(itemA)!;
    row.set(itemB, (row.get(itemB) ?? 0) + 1);
  }

  computeSimilarity(itemA: string, itemB: string): number {
    const usersA = this.itemUsers.get(itemA);
    const usersB = this.itemUsers.get(itemB);

    if (!usersA || !usersB) return 0;

    // Cosine similarity on user vectors
    // Each item is represented as a binary vector over users
    return this.cosineSimilarityFromSets(usersA, usersB);
  }

  private cosineSimilarityFromSets(setA: Set<string>, setB: Set<string>): number {
    // Compute cosine similarity between binary user vectors
    let intersection = 0;
    for (const user of setA) {
      if (setB.has(user)) {
        intersection++;
      }
    }

    const denominator = Math.sqrt(setA.size) * Math.sqrt(setB.size);
    return denominator === 0 ? 0 : intersection / denominator;
  }

  getSimilarItems(itemId: string, k: number): Array<{ itemId: string; score: number }> {
    const itemRow = this.cooccurrence.get(itemId);
    if (!itemRow) return [];

    const similarities: Array<{ itemId: string; score: number }> = [];
    for (const [otherItem] of itemRow) {
      const score = this.computeSimilarity(itemId, otherItem);
      similarities.push({ itemId: otherItem, score });
    }

    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, k);
  }

  getCooccurrenceCount(itemA: string, itemB: string): number {
    return this.cooccurrence.get(itemA)?.get(itemB) ?? 0;
  }
}
