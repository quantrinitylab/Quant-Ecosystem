// ============================================================================
// QuantAI - Prompt Library Service
// Save, search, categorize, and share prompt templates
// ============================================================================

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  usageCount: number;
  createdAt: number;
}

export class PromptLibraryService {
  private prompts: Map<string, SavedPrompt> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `prompt-${this.idCounter}`;
  }

  save(prompt: Omit<SavedPrompt, 'id' | 'usageCount' | 'createdAt' | 'isFavorite'>): SavedPrompt {
    const saved: SavedPrompt = {
      ...prompt,
      id: this.generateId(),
      usageCount: 0,
      createdAt: Date.now(),
      isFavorite: false,
    };
    this.prompts.set(saved.id, saved);
    return saved;
  }

  update(id: string, changes: Partial<SavedPrompt>): SavedPrompt | null {
    const prompt = this.prompts.get(id);
    if (!prompt) return null;
    const updated: SavedPrompt = { ...prompt, ...changes, id: prompt.id };
    this.prompts.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.prompts.delete(id);
  }

  search(query: string): SavedPrompt[] {
    const lower = query.toLowerCase();
    const results: SavedPrompt[] = [];
    for (const prompt of this.prompts.values()) {
      if (
        prompt.title.toLowerCase().includes(lower) ||
        prompt.content.toLowerCase().includes(lower) ||
        prompt.tags.some((t) => t.toLowerCase().includes(lower))
      ) {
        results.push(prompt);
      }
    }
    return results;
  }

  getByCategory(category: string): SavedPrompt[] {
    const results: SavedPrompt[] = [];
    for (const prompt of this.prompts.values()) {
      if (prompt.category === category) {
        results.push(prompt);
      }
    }
    return results;
  }

  getFavorites(): SavedPrompt[] {
    const results: SavedPrompt[] = [];
    for (const prompt of this.prompts.values()) {
      if (prompt.isFavorite) {
        results.push(prompt);
      }
    }
    return results;
  }

  getPopular(limit: number): SavedPrompt[] {
    const all = [...this.prompts.values()];
    all.sort((a, b) => b.usageCount - a.usageCount);
    return all.slice(0, limit);
  }

  toggleFavorite(id: string): boolean {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;
    prompt.isFavorite = !prompt.isFavorite;
    return true;
  }

  incrementUsage(id: string): void {
    const prompt = this.prompts.get(id);
    if (prompt) {
      prompt.usageCount += 1;
    }
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const prompt of this.prompts.values()) {
      categories.add(prompt.category);
    }
    return [...categories];
  }
}
