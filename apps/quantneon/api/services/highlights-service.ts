// ============================================================================
// QuantNeon API - Highlights Service
// Highlight creation from stories, cover images, ordering
// ============================================================================

interface Highlight {
  id: string;
  userId: string;
  title: string;
  coverUrl: string;
  storyIds: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface HighlightStory {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  duration: number;
  createdAt: string;
}

class HighlightsService {
  private highlights: Map<string, Highlight> = new Map();
  private stories: Map<string, HighlightStory> = new Map();

  async createHighlight(userId: string, data: { title: string; coverUrl?: string; storyIds: string[] }): Promise<Highlight> {
    const userHighlights = await this.getUserHighlights(userId);
    const highlight: Highlight = {
      id: `hl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId,
      title: data.title,
      coverUrl: data.coverUrl || '/highlights/default.jpg',
      storyIds: data.storyIds,
      position: userHighlights.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.highlights.set(highlight.id, highlight);
    return highlight;
  }

  async getUserHighlights(userId: string): Promise<Highlight[]> {
    return Array.from(this.highlights.values())
      .filter(h => h.userId === userId)
      .sort((a, b) => a.position - b.position);
  }

  async getHighlight(highlightId: string): Promise<Highlight | null> {
    return this.highlights.get(highlightId) || null;
  }

  async updateHighlight(highlightId: string, userId: string, updates: Partial<{ title: string; coverUrl: string }>): Promise<Highlight | null> {
    const highlight = this.highlights.get(highlightId);
    if (!highlight || highlight.userId !== userId) return null;
    Object.assign(highlight, updates, { updatedAt: new Date().toISOString() });
    return highlight;
  }

  async deleteHighlight(highlightId: string, userId: string): Promise<void> {
    const highlight = this.highlights.get(highlightId);
    if (!highlight || highlight.userId !== userId) throw new Error('Unauthorized');
    this.highlights.delete(highlightId);
  }

  async addStories(highlightId: string, userId: string, storyIds: string[]): Promise<Highlight | null> {
    const highlight = this.highlights.get(highlightId);
    if (!highlight || highlight.userId !== userId) return null;
    highlight.storyIds = [...new Set([...highlight.storyIds, ...storyIds])];
    highlight.updatedAt = new Date().toISOString();
    return highlight;
  }

  async removeStory(highlightId: string, userId: string, storyId: string): Promise<Highlight | null> {
    const highlight = this.highlights.get(highlightId);
    if (!highlight || highlight.userId !== userId) return null;
    highlight.storyIds = highlight.storyIds.filter(id => id !== storyId);
    highlight.updatedAt = new Date().toISOString();
    return highlight;
  }

  async reorderHighlights(userId: string, orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const highlight = this.highlights.get(id);
      if (highlight && highlight.userId === userId) {
        highlight.position = index;
      }
    });
  }

  async setCover(highlightId: string, userId: string, coverUrl: string): Promise<Highlight | null> {
    return this.updateHighlight(highlightId, userId, { coverUrl });
  }

  async getHighlightStories(highlightId: string): Promise<HighlightStory[]> {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) return [];
    return highlight.storyIds
      .map(id => this.stories.get(id))
      .filter((s): s is HighlightStory => s !== undefined);
  }
}

export const highlightsService = new HighlightsService();
export default HighlightsService;
