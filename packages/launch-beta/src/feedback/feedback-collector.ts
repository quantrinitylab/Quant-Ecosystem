import type { FeedbackCategory, FeedbackEntry } from '../types.js';

const POSITIVE_WORDS = ['great', 'love', 'amazing', 'excellent', 'fast', 'good', 'awesome', 'nice'];
const NEGATIVE_WORDS = ['slow', 'bad', 'broken', 'crash', 'hate', 'terrible', 'awful', 'bug'];

export class FeedbackCollector {
  private entries = new Map<string, FeedbackEntry>();

  submit(userId: string, category: FeedbackCategory, text: string): FeedbackEntry {
    const entry: FeedbackEntry = {
      id: crypto.randomUUID(),
      userId,
      category,
      text,
      sentiment: this.analyzeSentiment(text),
      votes: 0,
      acknowledged: false,
      createdAt: Date.now(),
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  vote(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) return false;
    entry.votes++;
    return true;
  }

  acknowledge(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) return false;
    entry.acknowledged = true;
    return true;
  }

  getByCategory(category: FeedbackCategory): FeedbackEntry[] {
    return [...this.entries.values()].filter((e) => e.category === category);
  }

  getPrioritized(): FeedbackEntry[] {
    return [...this.entries.values()].sort(
      (a, b) => b.votes - a.votes || a.createdAt - b.createdAt,
    );
  }

  getTopVoted(limit: number): FeedbackEntry[] {
    return this.getPrioritized().slice(0, limit);
  }

  getSentimentAverage(category?: FeedbackCategory): number {
    const list = category
      ? [...this.entries.values()].filter((e) => e.category === category)
      : [...this.entries.values()];
    if (list.length === 0) return 0;
    return list.reduce((sum, e) => sum + e.sentiment, 0) / list.length;
  }

  getEntry(id: string): FeedbackEntry | null {
    return this.entries.get(id) ?? null;
  }

  private analyzeSentiment(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    for (const w of words) {
      if (POSITIVE_WORDS.includes(w)) score++;
      if (NEGATIVE_WORDS.includes(w)) score--;
    }
    return Math.max(-1, Math.min(1, score));
  }
}
