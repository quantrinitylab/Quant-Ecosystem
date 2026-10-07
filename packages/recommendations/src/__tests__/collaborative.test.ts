import { describe, it, expect } from 'vitest';
import { ItemItemCollaborative } from '../retrieval/collaborative';

describe('ItemItemCollaborative', () => {
  it('should build co-occurrence matrix from interactions', () => {
    const collab = new ItemItemCollaborative();
    const interactions = [
      { userId: 'user1', itemId: 'item1', timestamp: 1000 },
      { userId: 'user1', itemId: 'item2', timestamp: 1001 },
      { userId: 'user2', itemId: 'item1', timestamp: 1002 },
      { userId: 'user2', itemId: 'item3', timestamp: 1003 },
      { userId: 'user3', itemId: 'item2', timestamp: 1004 },
      { userId: 'user3', itemId: 'item3', timestamp: 1005 },
    ];

    collab.buildCooccurrenceMatrix(interactions);

    // item1 and item2 co-occur for user1
    expect(collab.getCooccurrenceCount('item1', 'item2')).toBe(1);
    // item1 and item3 co-occur for user2
    expect(collab.getCooccurrenceCount('item1', 'item3')).toBe(1);
    // item2 and item3 co-occur for user3
    expect(collab.getCooccurrenceCount('item2', 'item3')).toBe(1);
  });

  it('should compute cosine similarity between items', () => {
    const collab = new ItemItemCollaborative();
    const interactions = [
      { userId: 'user1', itemId: 'item1', timestamp: 1000 },
      { userId: 'user1', itemId: 'item2', timestamp: 1001 },
      { userId: 'user2', itemId: 'item1', timestamp: 1002 },
      { userId: 'user2', itemId: 'item2', timestamp: 1003 },
      { userId: 'user3', itemId: 'item1', timestamp: 1004 },
      { userId: 'user3', itemId: 'item3', timestamp: 1005 },
    ];

    collab.buildCooccurrenceMatrix(interactions);

    const sim12 = collab.computeSimilarity('item1', 'item2');
    const sim13 = collab.computeSimilarity('item1', 'item3');

    // item1 and item2 share more co-occurrences
    expect(sim12).toBeGreaterThan(0);
    expect(sim13).toBeGreaterThan(0);
  });

  it('should return 0 similarity for unknown items', () => {
    const collab = new ItemItemCollaborative();
    collab.buildCooccurrenceMatrix([{ userId: 'user1', itemId: 'item1', timestamp: 1000 }]);

    expect(collab.computeSimilarity('item1', 'unknown')).toBe(0);
    expect(collab.computeSimilarity('unknown', 'item1')).toBe(0);
  });

  it('should get similar items sorted by score', () => {
    const collab = new ItemItemCollaborative();
    const interactions = [
      { userId: 'user1', itemId: 'item1', timestamp: 1000 },
      { userId: 'user1', itemId: 'item2', timestamp: 1001 },
      { userId: 'user1', itemId: 'item3', timestamp: 1002 },
      { userId: 'user2', itemId: 'item1', timestamp: 1003 },
      { userId: 'user2', itemId: 'item2', timestamp: 1004 },
      { userId: 'user3', itemId: 'item1', timestamp: 1005 },
      { userId: 'user3', itemId: 'item2', timestamp: 1006 },
      { userId: 'user3', itemId: 'item3', timestamp: 1007 },
    ];

    collab.buildCooccurrenceMatrix(interactions);
    const similar = collab.getSimilarItems('item1', 2);

    expect(similar.length).toBeLessThanOrEqual(2);
    if (similar.length >= 2) {
      expect(similar[0]!.score).toBeGreaterThanOrEqual(similar[1]!.score);
    }
    expect(similar[0]!.score).toBeGreaterThan(0);
  });

  it('should return empty array for item with no co-occurrences', () => {
    const collab = new ItemItemCollaborative();
    collab.buildCooccurrenceMatrix([]);

    const similar = collab.getSimilarItems('nonexistent', 5);
    expect(similar).toHaveLength(0);
  });
});
