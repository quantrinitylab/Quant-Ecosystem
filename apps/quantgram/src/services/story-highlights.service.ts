// ============================================================================
// QuantNeon - Story Highlights Service
// Manages story highlight collections, covers, and ordering
// ============================================================================

export interface StoryHighlight {
  id: string;
  name: string;
  coverUrl: string;
  storyIds: string[];
  createdAt: number;
  updatedAt: number;
}

export class StoryHighlightsService {
  private highlights: Map<string, StoryHighlight> = new Map();
  private userHighlights: Map<string, string[]> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `highlight-${this.idCounter}`;
  }

  createHighlight(name: string, coverUrl: string): StoryHighlight {
    const highlight: StoryHighlight = {
      id: this.generateId(),
      name,
      coverUrl,
      storyIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.highlights.set(highlight.id, highlight);
    return { ...highlight, storyIds: [...highlight.storyIds] };
  }

  deleteHighlight(highlightId: string): boolean {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) {
      return false;
    }

    this.highlights.delete(highlightId);

    // Remove from user highlights maps
    for (const [userId, ids] of this.userHighlights.entries()) {
      const index = ids.indexOf(highlightId);
      if (index !== -1) {
        ids.splice(index, 1);
        this.userHighlights.set(userId, ids);
      }
    }

    return true;
  }

  addStory(highlightId: string, storyId: string): StoryHighlight | null {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) {
      return null;
    }

    if (!highlight.storyIds.includes(storyId)) {
      highlight.storyIds.push(storyId);
      highlight.updatedAt = Date.now();
    }

    return { ...highlight, storyIds: [...highlight.storyIds] };
  }

  removeStory(highlightId: string, storyId: string): boolean {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) {
      return false;
    }

    const index = highlight.storyIds.indexOf(storyId);
    if (index === -1) {
      return false;
    }

    highlight.storyIds.splice(index, 1);
    highlight.updatedAt = Date.now();
    return true;
  }

  reorder(highlightId: string, storyIds: string[]): StoryHighlight | null {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) {
      return null;
    }

    // Only keep IDs that exist in the highlight
    const validIds = storyIds.filter((id) => highlight.storyIds.includes(id));
    highlight.storyIds = validIds;
    highlight.updatedAt = Date.now();

    return { ...highlight, storyIds: [...highlight.storyIds] };
  }

  getHighlights(userId: string): StoryHighlight[] {
    const ids = this.userHighlights.get(userId) ?? [];
    const results: StoryHighlight[] = [];
    for (const id of ids) {
      const highlight = this.highlights.get(id);
      if (highlight) {
        results.push({ ...highlight, storyIds: [...highlight.storyIds] });
      }
    }
    return results;
  }

  updateCover(highlightId: string, coverUrl: string): StoryHighlight | null {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) {
      return null;
    }

    highlight.coverUrl = coverUrl;
    highlight.updatedAt = Date.now();
    return { ...highlight, storyIds: [...highlight.storyIds] };
  }

  assignToUser(userId: string, highlightId: string): void {
    const ids = this.userHighlights.get(userId) ?? [];
    if (!ids.includes(highlightId)) {
      ids.push(highlightId);
      this.userHighlights.set(userId, ids);
    }
  }
}
